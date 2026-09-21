import { describe, expect, it } from 'bun:test';
import type { ResourceQuery } from '../../packages/core/src/index';
import { drizzleAdapter } from '../../packages/drizzle/src/index';

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

describe('Drizzle Adapter', () => {
  const makeQuery = (overrides: Partial<ResourceQuery> = {}): ResourceQuery => ({
    filters: [],
    relations: [],
    sort: [],
    pagination: { page: 1, limit: 10 },
    ...overrides,
  });

  describe('buildWhere', () => {
    it('returns undefined for empty query', () => {
      expect(drizzleAdapter.buildWhere(makeQuery())).toBeUndefined();
    });

    it('builds equality filter', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({
          filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
        }),
      );
      expect(sqlString(where!)).toBe('status = ACTIVE');
    });

    it('builds relation filter', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({
          relations: [
            {
              relation: 'member',
              filters: [{ field: 'firstName', operator: 'eq', value: 'Abebe' }],
            },
          ],
        }),
      );
      expect(sqlString(where!)).toContain('member.firstName');
    });
  });

  describe('LIKE ESCAPE (portable across SQLite)', () => {
    it('emits ESCAPE for contains', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({ filters: [{ field: 'name', operator: 'contains', value: '100%' }] }),
      );
      const str = sqlString(where!);
      expect(str).toContain('LIKE');
      expect(str).toContain("ESCAPE '\\'");
      expect(str).toContain('%100\\%%');
    });

    it('emits ESCAPE for startsWith', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({ filters: [{ field: 'name', operator: 'startsWith', value: 'abe' }] }),
      );
      const str = sqlString(where!);
      expect(str).toContain("ESCAPE '\\'");
    });

    it('emits ESCAPE for endsWith', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({ filters: [{ field: 'name', operator: 'endsWith', value: 'ebe' }] }),
      );
      const str = sqlString(where!);
      expect(str).toContain("ESCAPE '\\'");
    });

    it('wraps case-insensitive LIKE columns in LOWER()', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({ filters: [{ field: 'name', operator: 'contains', value: 'abe' }] }),
      );
      expect(sqlString(where!)).toContain('LOWER(name)');
    });
  });

  describe('nested relation filters', () => {
    it('builds nested relation filters from dotted paths with quoted identifiers', () => {
      const where = drizzleAdapter.buildWhere(
        makeQuery({
          relations: [
            { relation: 'org.parent', filters: [{ field: 'name', operator: 'eq', value: 'x' }] },
          ],
        }),
      );
      expect(sqlString(where!)).toContain('org.parent.name');
    });
  });

  describe('buildOrderBy', () => {
    it('returns undefined for empty sort', () => {
      expect(drizzleAdapter.buildOrderBy([])).toBeUndefined();
    });

    const sortCases: [
      string,
      ResourceQuery['sort'],
      { column: string; order: 'asc' | 'desc' }[],
    ][] = [
      [
        'single sort',
        [{ field: 'createdAt', direction: 'desc' }],
        [{ column: 'createdAt', order: 'desc' }],
      ],
      [
        'multiple sorts',
        [
          { field: 'createdAt', direction: 'desc' },
          { field: 'firstName', direction: 'asc' },
        ],
        [
          { column: 'createdAt', order: 'desc' },
          { column: 'firstName', order: 'asc' },
        ],
      ],
    ];

    for (const [label, sort, expected] of sortCases) {
      it(`builds ${label}`, () => {
        expect(drizzleAdapter.buildOrderBy(sort)).toEqual(expected);
      });
    }
  });

  describe('buildSkipTake', () => {
    const skipTakeCases: [number, number, { skip: number; take: number }][] = [
      [1, 10, { skip: 0, take: 10 }],
      [2, 25, { skip: 25, take: 25 }],
    ];

    for (const [page, limit, expected] of skipTakeCases) {
      it(`calculates skip/take for page=${page}, limit=${limit}`, () => {
        expect(drizzleAdapter.buildSkipTake(page, limit)).toEqual(expected);
      });
    }
  });

  describe('integration with adapter.map', () => {
    it('maps complete query', () => {
      const result = drizzleAdapter.map(
        makeQuery({
          filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
          sort: [{ field: 'createdAt', direction: 'desc' }],
          pagination: { page: 2, limit: 25 },
        }),
      );
      expect(result.where).toBeDefined();
      expect(result.orderBy).toEqual([{ column: 'createdAt', order: 'desc' }]);
      expect(result.skip).toBe(25);
      expect(result.take).toBe(25);
    });
  });
});
