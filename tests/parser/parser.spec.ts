import { describe, expect, it } from 'bun:test';
import {
  defineQuery,
  defineRelation,
  type QueryParams,
  q,
  type SortExpression,
} from '../../packages/core/src/index';
import { parseQuery } from '../../packages/core/src/parser/parser';

describe('QueryParser', () => {
  const TEST_SPEC = defineQuery({
    fields: {
      status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
      firstName: q.string().sortable().searchable(),
      lastName: q.string().sortable().searchable(),
      email: q.string().sortable().searchable(),
      age: q.number().sortable(),
      isActive: q.boolean(),
      createdAt: q.date().sortable(),
    },
  });

  const parse = (params: QueryParams) => TEST_SPEC.parse(params);

  describe('parseQuery hook', () => {
    it('parses params against a defineQuery definition', () => {
      const result = parseQuery({ filter: { status: 'ACTIVE' }, sort: '-createdAt' }, TEST_SPEC);
      expect(result.filters[0]).toMatchObject({ field: 'status', operator: 'eq' });
      expect(result.sort).toEqual([{ field: 'createdAt', direction: 'desc' }]);
    });
  });

  describe('empty input', () => {
    it('returns default pagination for empty query', () => {
      const result = parse({});
      expect(result.pagination).toEqual({ page: 1, limit: 10 });
      expect(result.filters).toEqual([]);
      expect(result.sort).toEqual([]);
      expect(result.search).toBeUndefined();
    });
  });

  describe('filter parsing', () => {
    it('parses simple filter', () => {
      const result = parse({ filter: { status: 'ACTIVE' } });
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toEqual({
        field: 'status',
        operator: 'eq',
        value: 'ACTIVE',
        caseSensitive: false,
      });
    });

    it('parses operator filter', () => {
      const result = parse({ filter: { age: { gte: 18, lt: 65 } } });
      expect(result.filters).toHaveLength(2);
    });
  });

  describe('sort parsing', () => {
    const sortCases: [string, QueryParams, SortExpression[]][] = [
      [
        'comma-separated sort',
        { sort: '-createdAt,firstName' },
        [
          { field: 'createdAt', direction: 'desc' },
          { field: 'firstName', direction: 'asc' },
        ],
      ],
      ['object sort', { sort: { createdAt: 'desc' } }, [{ field: 'createdAt', direction: 'desc' }]],
    ];

    for (const [label, input, expected] of sortCases) {
      it(`parses ${label}`, () => {
        const result = parse(input);
        expect(result.sort).toHaveLength(expected.length);
        expect(result.sort).toEqual(expected);
      });
    }
  });

  describe('search parsing', () => {
    it('parses simple search', () => {
      const result = parse({ search: 'abebe' });
      expect(result.search).toBeDefined();
      expect(result.search!.terms).toHaveLength(1);
      expect(result.search!.terms[0].value).toBe('abebe');
    });

    it('parses complex search', () => {
      const result = parse({ search: '"abebe kebede" firstName:take*' });
      expect(result.search!.terms).toHaveLength(2);
      expect(result.search!.terms[0].match).toBe('phrase');
      expect(result.search!.terms[1].match).toBe('prefix');
    });
  });

  describe('pagination parsing', () => {
    const paginationCases: [string, QueryParams, { page: number; limit: number }][] = [
      ['page and limit from strings', { page: '3', limit: '25' }, { page: 3, limit: 25 }],
      ['page and limit from numbers', { page: 2, limit: 20 }, { page: 2, limit: 20 }],
      ['non-numeric values', { page: 'abc', limit: 'xyz' }, { page: 1, limit: 10 }],
      ['truncates decimal values', { page: '2.7', limit: '10.9' }, { page: 2, limit: 10 }],
    ];

    for (const [label, input, expected] of paginationCases) {
      it(`parses ${label}`, () => {
        expect(parse(input)).toMatchObject({ pagination: expected });
      });
    }

    const clampCases: [string, QueryParams, string, number][] = [
      ['page to minimum 1', { page: '0' }, 'page', 1],
      ['negative page to 1', { page: '-5' }, 'page', 1],
      ['limit to maximum 100', { limit: '200' }, 'limit', 100],
      ['limit to minimum 1', { limit: '0' }, 'limit', 1],
      ['Infinity page', { page: 'Infinity' }, 'page', 1],
      ['huge page capped', { page: '1e300' }, 'page', 1_000_000],
    ];

    for (const [label, input, key, value] of clampCases) {
      it(`clamps ${label}`, () => {
        const result = parse(input);
        expect(result.pagination[key as keyof typeof result.pagination]).toBe(value);
      });
    }
  });

  describe('combined queries', () => {
    it('parses filter + sort + search + pagination', () => {
      const result = parse({
        filter: { status: 'ACTIVE' },
        sort: '-createdAt',
        search: 'abebe',
        page: '2',
        limit: '25',
      });
      expect(result.filters).toHaveLength(1);
      expect(result.sort).toHaveLength(1);
      expect(result.search).toBeDefined();
      expect(result.pagination).toEqual({ page: 2, limit: 25 });
    });
  });

  describe('configurable limits', () => {
    it('honors custom maxPage / maxLimit / defaultLimit', () => {
      const limited = defineQuery({
        fields: { status: q.enum(['ACTIVE', 'INACTIVE']).sortable() },
        limits: { maxPage: 100, maxLimit: 5, defaultLimit: 3 },
      });

      expect(limited.parse({ page: '500' }).pagination).toEqual({ page: 100, limit: 3 });
      expect(limited.parse({ limit: '20' }).pagination).toEqual({ page: 1, limit: 5 });
    });

    it('honors custom maxFilters', () => {
      const limited = defineQuery({
        fields: { a: q.string(), b: q.string(), c: q.string() },
        limits: { maxFilters: 2 },
      });

      expect(() => limited.parse({ filter: { a: '1', b: '2', c: '3' } })).toThrow(
        'Too many filters',
      );
      expect(limited.parse({ filter: { a: '1', b: '2' } }).filters).toHaveLength(2);
    });

    it('honors custom maxNestingDepth', () => {
      const limited = defineQuery({
        fields: { name: q.string() },
        relations: {
          org: defineRelation({
            fields: { name: q.string() },
            relations: {
              parent: defineRelation({
                fields: { name: q.string() },
                relations: {
                  grandparent: defineRelation({ fields: { name: q.string() } }),
                },
              }),
            },
          }),
        },
        limits: { maxNestingDepth: 3 },
      });

      const result = limited.parse({
        filter: { org: { parent: { grandparent: { name: 'x' } } } },
      });
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].relation).toBe('org.parent.grandparent');
    });

    it('honors custom search limits', () => {
      const limited = defineQuery({
        fields: { name: q.string().searchable() },
        limits: { search: { maxTerms: 1 } },
      });

      expect(() => limited.parse({ search: 'a b' })).toThrow('maximum of 1 terms');
    });
  });
});
