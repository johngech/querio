import { describe, expect, it } from 'bun:test';
import { ILike, In, IsNull, Like, Not } from 'typeorm';
import type { ResourceQuery } from '../../packages/core/src/index';
import { drizzleQueryAdapter } from '../../packages/drizzle/src/index';
import { prismaQueryAdapter } from '../../packages/prisma/src/index';
import { typeormQueryAdapter } from '../../packages/typeorm/src/index';

/**
 * Operator parity matrix — exercises shared operator semantics (null handling,
 * empty arrays, LIKE wildcard escaping, case sensitivity) through all three
 * adapters so behavioral drift between them surfaces as a failing test.
 */

interface DrizzleSQL {
  queryChunks: unknown[];
}

function sqlString(where: DrizzleSQL | undefined): string {
  if (!where) return '';
  const chunks: string[] = [];
  function flatten(cs: unknown[]): void {
    for (const c of cs) {
      if (typeof c === 'string') chunks.push(c);
      else if (
        c &&
        typeof c === 'object' &&
        'value' in c &&
        Array.isArray((c as { value: unknown }).value)
      ) {
        chunks.push((c as { value: string[] }).value[0]);
      } else if (
        c &&
        typeof c === 'object' &&
        'queryChunks' in c &&
        Array.isArray((c as { queryChunks: unknown[] }).queryChunks)
      ) {
        flatten((c as { queryChunks: unknown[] }).queryChunks);
      }
    }
  }
  flatten(where.queryChunks);
  return chunks.join('');
}

const makeQuery = (overrides: Partial<ResourceQuery> = {}): ResourceQuery => ({
  filters: [],
  relations: [],
  sort: [],
  pagination: { page: 1, limit: 10 },
  ...overrides,
});

const ALL_OPERATORS = [
  'eq',
  'neq',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'endsWith',
  'isNull',
  'isNotNull',
] as const;

describe('operator parity across adapters', () => {
  it('renders every operator through every adapter without throwing', () => {
    for (const op of ALL_OPERATORS) {
      const value = op === 'in' || op === 'notIn' ? ['A', 'B'] : 'x';
      const query = makeQuery({ filters: [{ field: 'status', operator: op, value }] });
      for (const [name, adapter] of [
        ['prisma', prismaQueryAdapter],
        ['drizzle', drizzleQueryAdapter],
        ['typeorm', typeormQueryAdapter],
      ] as const) {
        const where = adapter.buildWhere(query);
        expect(where, `${name} should build ${op}`).toBeDefined();
      }
    }
  });

  describe('null semantics', () => {
    it('equal null renders as IS NULL in all adapters', () => {
      const query = makeQuery({ filters: [{ field: 'email', operator: 'eq', value: null }] });
      expect(prismaQueryAdapter.buildWhere(query)).toEqual({ email: { equals: null } });
      expect(typeormQueryAdapter.buildWhere(query)).toEqual({ email: IsNull() });
      expect(sqlString(drizzleQueryAdapter.buildWhere(query))).toContain('IS NULL');
    });

    it('notEqual null renders as IS NOT NULL in all adapters', () => {
      const query = makeQuery({ filters: [{ field: 'email', operator: 'neq', value: null }] });
      expect(prismaQueryAdapter.buildWhere(query)).toEqual({ email: { not: null } });
      expect(typeormQueryAdapter.buildWhere(query)).toEqual({ email: Not(IsNull()) });
      expect(sqlString(drizzleQueryAdapter.buildWhere(query))).toContain('IS NOT NULL');
    });

    it('isNull / isNotNull render consistently', () => {
      const qNull = makeQuery({ filters: [{ field: 'email', operator: 'isNull' }] });
      expect(prismaQueryAdapter.buildWhere(qNull)).toEqual({ email: { equals: null } });
      expect(typeormQueryAdapter.buildWhere(qNull)).toEqual({ email: IsNull() });
      expect(sqlString(drizzleQueryAdapter.buildWhere(qNull))).toContain('IS NULL');

      const qNotNull = makeQuery({ filters: [{ field: 'email', operator: 'isNotNull' }] });
      expect(prismaQueryAdapter.buildWhere(qNotNull)).toEqual({ email: { not: null } });
      expect(typeormQueryAdapter.buildWhere(qNotNull)).toEqual({ email: Not(IsNull()) });
      expect(sqlString(drizzleQueryAdapter.buildWhere(qNotNull))).toContain('IS NOT NULL');
    });
  });

  describe('empty array semantics', () => {
    it('in [] never matches; notIn [] never filters', () => {
      const qIn = makeQuery({ filters: [{ field: 'status', operator: 'in', value: [] }] });
      expect(prismaQueryAdapter.buildWhere(qIn)).toEqual({ status: { in: [] } });
      expect(typeormQueryAdapter.buildWhere(qIn)).toEqual({ status: In([]) });
      expect(sqlString(drizzleQueryAdapter.buildWhere(qIn))).toContain('1=0');

      const qNotIn = makeQuery({ filters: [{ field: 'status', operator: 'notIn', value: [] }] });
      expect(prismaQueryAdapter.buildWhere(qNotIn)).toEqual({ status: { notIn: [] } });
      expect(sqlString(drizzleQueryAdapter.buildWhere(qNotIn))).toContain('1=1');
    });
  });

  describe('LIKE wildcard escaping', () => {
    it('escapes % and _ consistently in substring operators', () => {
      const q = makeQuery({ filters: [{ field: 'name', operator: 'contains', value: '100_%' }] });
      // Prisma contains handles escaping in the engine — value passes through.
      expect(prismaQueryAdapter.buildWhere(q)).toEqual({
        name: { contains: '100_%', mode: 'insensitive' },
      });
      // Drizzle escapes % and _ so they are treated literally.
      expect(sqlString(drizzleQueryAdapter.buildWhere(q))).toContain('%100\\_\\%%');
      // TypeORM gets the same escaped pattern from the shared builder.
      expect(typeormQueryAdapter.buildWhere(q)).toEqual({ name: ILike('%100\\_\\%%') });
    });

    it('respects case sensitivity for substring operators', () => {
      const q = makeQuery({
        filters: [{ field: 'name', operator: 'startsWith', value: 'Abe', caseSensitive: true }],
      });
      expect(typeormQueryAdapter.buildWhere(q)).toEqual({ name: Like('Abe%') });
      expect(prismaQueryAdapter.buildWhere(q)).toEqual({ name: { startsWith: 'Abe' } });
      expect(sqlString(drizzleQueryAdapter.buildWhere(q))).toContain("ESCAPE '\\'");
    });
  });

  describe('search phrase semantics', () => {
    const ADAPTERS = [
      ['prisma', prismaQueryAdapter],
      ['drizzle', drizzleQueryAdapter],
      ['typeorm', typeormQueryAdapter],
    ] as const;

    it('compiles phrase identically to contains within each adapter', () => {
      for (const [name, adapter] of ADAPTERS) {
        const phrase = adapter.buildWhere(
          makeQuery({
            search: {
              raw: '"abebe beke"',
              terms: [{ value: 'abebe beke', match: 'phrase' }],
              fields: ['firstName', 'lastName'],
            },
          }),
        );
        const contains = adapter.buildWhere(
          makeQuery({
            search: {
              raw: 'abebe beke',
              terms: [{ value: 'abebe beke', match: 'contains' }],
              fields: ['firstName', 'lastName'],
            },
          }),
        );
        expect(phrase, `${name} phrase should equal contains`).toEqual(contains);
      }
    });

    it('compiles prefix distinctly from phrase/contains', () => {
      for (const [name, adapter] of ADAPTERS) {
        const prefix = adapter.buildWhere(
          makeQuery({
            search: {
              raw: 'abe*',
              terms: [{ value: 'abe', match: 'prefix' }],
              fields: ['firstName'],
            },
          }),
        );
        const contains = adapter.buildWhere(
          makeQuery({
            search: {
              raw: 'abe',
              terms: [{ value: 'abe', match: 'contains' }],
              fields: ['firstName'],
            },
          }),
        );
        expect(prefix, `${name} prefix should differ from contains`).not.toEqual(contains);
      }
    });
  });
});
