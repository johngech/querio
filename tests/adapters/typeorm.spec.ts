import { describe, expect, it } from 'bun:test';
import { And, Equal, ILike, In, IsNull, LessThan, Like, MoreThanOrEqual, Not } from 'typeorm';
import type { ResourceQuery } from '../../packages/core/src/index';
import { typeormQueryAdapter } from '../../packages/typeorm/src/index';

describe('TypeORM Adapter', () => {
  type WhereExpect = Record<string, unknown> | Record<string, unknown>[] | undefined;

  const makeQuery = (overrides: Partial<ResourceQuery> = {}): ResourceQuery => ({
    filters: [],
    relations: [],
    sort: [],
    pagination: { page: 1, limit: 10 },
    ...overrides,
  });

  describe('buildWhere', () => {
    it('returns undefined for empty query', () => {
      expect(typeormQueryAdapter.buildWhere(makeQuery())).toBeUndefined();
    });

    const filterCases: [string, Partial<ResourceQuery>, WhereExpect][] = [
      [
        'equality filter',
        { filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }] },
        { status: 'ACTIVE' },
      ],
      [
        'in filter',
        { filters: [{ field: 'status', operator: 'in', value: ['ACTIVE', 'PENDING'] }] },
        { status: In(['ACTIVE', 'PENDING']) },
      ],
      [
        'not-in filter',
        { filters: [{ field: 'status', operator: 'notIn', value: ['INACTIVE'] }] },
        { status: Not(In(['INACTIVE'])) },
      ],
      [
        'comparison filters on same field with And()',
        {
          filters: [
            { field: 'age', operator: 'gte', value: 18 },
            { field: 'age', operator: 'lt', value: 65 },
          ],
        },
        { age: And(MoreThanOrEqual(18), LessThan(65)) },
      ],
      [
        'null equality',
        { filters: [{ field: 'email', operator: 'eq', value: null }] },
        { email: IsNull() },
      ],
      [
        'isNotNull',
        { filters: [{ field: 'email', operator: 'isNotNull' }] },
        { email: Not(IsNull()) },
      ],
    ];

    for (const [label, queryOverrides, expected] of filterCases) {
      it(`builds ${label}`, () => {
        expect(typeormQueryAdapter.buildWhere(makeQuery(queryOverrides))).toEqual(expected);
      });
    }

    describe('contains/startsWith/endsWith case sensitivity', () => {
      const caseSensitiveCases: [string, Partial<ResourceQuery>, WhereExpect][] = [
        [
          'case-insensitive contains',
          { filters: [{ field: 'name', operator: 'contains', value: 'abebe' }] },
          { name: ILike('%abebe%') },
        ],
        [
          'case-sensitive contains',
          {
            filters: [{ field: 'name', operator: 'contains', value: 'Abebe', caseSensitive: true }],
          },
          { name: Like('%Abebe%') },
        ],
        [
          'case-insensitive startsWith',
          { filters: [{ field: 'name', operator: 'startsWith', value: 'abe' }] },
          { name: ILike('abe%') },
        ],
        [
          'case-sensitive startsWith',
          {
            filters: [{ field: 'name', operator: 'startsWith', value: 'Abe', caseSensitive: true }],
          },
          { name: Like('Abe%') },
        ],
        [
          'case-insensitive endsWith',
          { filters: [{ field: 'name', operator: 'endsWith', value: 'ebe' }] },
          { name: ILike('%ebe') },
        ],
        [
          'case-sensitive endsWith',
          {
            filters: [{ field: 'name', operator: 'endsWith', value: 'Ebe', caseSensitive: true }],
          },
          { name: Like('%Ebe') },
        ],
      ];

      for (const [label, queryOverrides, expected] of caseSensitiveCases) {
        it(label, () => {
          expect(typeormQueryAdapter.buildWhere(makeQuery(queryOverrides))).toEqual(expected);
        });
      }
    });

    it('builds relation filter', () => {
      expect(
        typeormQueryAdapter.buildWhere(
          makeQuery({
            relations: [
              {
                relation: 'member',
                filters: [{ field: 'firstName', operator: 'eq', value: 'Abebe' }],
              },
            ],
          }),
        ),
      ).toEqual({ member: { firstName: 'Abebe' } });
    });

    it('builds search as OR-array of where alternatives', () => {
      const result = typeormQueryAdapter.buildWhere(
        makeQuery({
          search: {
            raw: 'abebe',
            terms: [{ value: 'abebe', match: 'contains' }],
            fields: ['firstName', 'lastName'],
          },
        }),
      );
      expect(result).toEqual([{ firstName: ILike('%abebe%') }, { lastName: ILike('%abebe%') }]);
    });

    it('combines filters with search via AND over each alternative', () => {
      const result = typeormQueryAdapter.buildWhere(
        makeQuery({
          filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
          search: {
            raw: 'abebe',
            terms: [{ value: 'abebe', match: 'contains' }],
            fields: ['firstName', 'lastName'],
          },
        }),
      );
      expect(result).toEqual([
        { status: 'ACTIVE', firstName: ILike('%abebe%') },
        { status: 'ACTIVE', lastName: ILike('%abebe%') },
      ]);
    });

    it('ANDs the filter and search when both target the same field', () => {
      const result = typeormQueryAdapter.buildWhere(
        makeQuery({
          filters: [{ field: 'name', operator: 'eq', value: 'X' }],
          search: {
            raw: 'abebe',
            terms: [{ value: 'abebe', match: 'contains' }],
            fields: ['name'],
          },
        }),
      );
      expect(result).toEqual({ name: And(Equal('X'), ILike('%abebe%')) });
    });
  });

  describe('buildOrderBy', () => {
    it('returns undefined for empty sort', () => {
      expect(typeormQueryAdapter.buildOrderBy([])).toBeUndefined();
    });

    const sortCases: [string, ResourceQuery['sort'], Record<string, 'ASC' | 'DESC'>][] = [
      ['single sort', [{ field: 'createdAt', direction: 'desc' }], { createdAt: 'DESC' }],
      [
        'multiple sorts',
        [
          { field: 'createdAt', direction: 'desc' },
          { field: 'firstName', direction: 'asc' },
        ],
        { createdAt: 'DESC', firstName: 'ASC' },
      ],
    ];

    for (const [label, sort, expected] of sortCases) {
      it(`builds ${label}`, () => {
        expect(typeormQueryAdapter.buildOrderBy(sort)).toEqual(expected);
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
        expect(typeormQueryAdapter.buildSkipTake(page, limit)).toEqual(expected);
      });
    }
  });

  describe('integration with adapter.map', () => {
    it('maps complete query', () => {
      const result = typeormQueryAdapter.map(
        makeQuery({
          filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
          sort: [{ field: 'createdAt', direction: 'desc' }],
          pagination: { page: 2, limit: 25 },
        }),
      );
      expect(result.where).toEqual({ status: 'ACTIVE' });
      expect(result.orderBy).toEqual({ createdAt: 'DESC' });
      expect(result.skip).toBe(25);
      expect(result.take).toBe(25);
    });
  });

  describe('nested relation filters', () => {
    it('builds nested relation filters from dotted paths', () => {
      expect(
        typeormQueryAdapter.buildWhere(
          makeQuery({
            relations: [
              {
                relation: 'org.parent',
                filters: [{ field: 'name', operator: 'eq', value: 'x' }],
              },
            ],
          }),
        ),
      ).toEqual({ org: { parent: { name: 'x' } } });
    });
  });
});
