import { describe, expect, it } from 'bun:test';
import type { ResourceQuery } from '../../packages/core/src/index';
import { prismaQueryAdapter } from '../../packages/prisma/src/index';

describe('Prisma Adapter', () => {
  const makeQuery = (overrides: Partial<ResourceQuery> = {}): ResourceQuery => ({
    filters: [],
    relations: [],
    sort: [],
    pagination: { page: 1, limit: 10 },
    ...overrides,
  });

  describe('buildWhere', () => {
    it('returns undefined for empty query', () => {
      expect(prismaQueryAdapter.buildWhere(makeQuery())).toBeUndefined();
    });

    it('builds equality filter', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
          }),
        ),
      ).toEqual({ status: { equals: 'ACTIVE' } });
    });

    it('builds relation filter', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            relations: [
              {
                relation: 'member',
                filters: [{ field: 'firstName', operator: 'eq', value: 'Abebe' }],
              },
            ],
          }),
        ),
      ).toEqual({ member: { firstName: { equals: 'Abebe' } } });
    });

    it('builds search filter', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            search: {
              raw: 'abebe',
              terms: [{ value: 'abebe', match: 'contains' }],
              fields: ['firstName', 'lastName'],
            },
          }),
        ),
      ).toEqual({
        OR: [
          { firstName: { contains: 'abebe', mode: 'insensitive' } },
          { lastName: { contains: 'abebe', mode: 'insensitive' } },
        ],
      });
    });

    const scalarOperators: [string, ResourceQuery['filters'], Record<string, unknown>][] = [
      [
        'simple equality',
        [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
        { status: { equals: 'ACTIVE' } },
      ],
      [
        'null equality',
        [{ field: 'email', operator: 'eq', value: null }],
        { email: { equals: null } },
      ],
      [
        'not-equal',
        [{ field: 'status', operator: 'neq', value: 'INACTIVE' }],
        { status: { not: 'INACTIVE' } },
      ],
      [
        'comparison operators',
        [
          { field: 'age', operator: 'gte', value: 18 },
          { field: 'age', operator: 'lt', value: 65 },
        ],
        { AND: [{ age: { gte: 18 } }, { age: { lt: 65 } }] },
      ],
      [
        'contains (case insensitive)',
        [{ field: 'name', operator: 'contains', value: 'test' }],
        { name: { contains: 'test', mode: 'insensitive' } },
      ],
      [
        'contains (case sensitive)',
        [
          {
            field: 'name',
            operator: 'contains',
            value: 'test',
            caseSensitive: true,
          },
        ],
        { name: { contains: 'test' } },
      ],
      [
        'in',
        [{ field: 'status', operator: 'in', value: ['ACTIVE', 'PENDING'] }],
        { status: { in: ['ACTIVE', 'PENDING'] } },
      ],
      [
        'not-in',
        [{ field: 'status', operator: 'notIn', value: ['INACTIVE'] }],
        { status: { notIn: ['INACTIVE'] } },
      ],
      [
        'startsWith',
        [{ field: 'name', operator: 'startsWith', value: 'test' }],
        { name: { startsWith: 'test', mode: 'insensitive' } },
      ],
      [
        'endsWith',
        [{ field: 'name', operator: 'endsWith', value: 'test' }],
        { name: { endsWith: 'test', mode: 'insensitive' } },
      ],
      ['isNull', [{ field: 'email', operator: 'isNull' }], { email: { equals: null } }],
      ['isNotNull', [{ field: 'email', operator: 'isNotNull' }], { email: { not: null } }],
    ];

    for (const [label, filters, expected] of scalarOperators) {
      it(`builds ${label}`, () => {
        expect(prismaQueryAdapter.buildWhere(makeQuery({ filters }))).toEqual(expected);
      });
    }

    it('combines multiple fields with AND', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            filters: [
              { field: 'status', operator: 'eq', value: 'ACTIVE' },
              { field: 'age', operator: 'gte', value: 18 },
            ],
          }),
        ),
      ).toEqual({
        status: { equals: 'ACTIVE' },
        age: { gte: 18 },
      });
    });

    it('renders incompatible operators on the same field as an AND list', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            filters: [
              { field: 'age', operator: 'gte', value: 18 },
              { field: 'age', operator: 'isNull' },
            ],
          }),
        ),
      ).toEqual({ AND: [{ age: { gte: 18 } }, { age: { equals: null } }] });
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            filters: [
              { field: 'name', operator: 'contains', value: 'ab' },
              { field: 'name', operator: 'eq', value: 'abebe' },
            ],
          }),
        ),
      ).toEqual({
        AND: [{ name: { contains: 'ab', mode: 'insensitive' } }, { name: { equals: 'abebe' } }],
      });
    });

    it('keeps single-operator fields compact when another field uses two operators', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            filters: [
              { field: 'status', operator: 'eq', value: 'ACTIVE' },
              { field: 'age', operator: 'gte', value: 18 },
              { field: 'age', operator: 'lt', value: 65 },
            ],
          }),
        ),
      ).toEqual({
        AND: [{ status: { equals: 'ACTIVE' } }, { age: { gte: 18 } }, { age: { lt: 65 } }],
      });
    });

    it('combines scalar and relation filters', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
            relations: [
              {
                relation: 'user',
                filters: [{ field: 'name', operator: 'eq', value: 'test' }],
              },
            ],
          }),
        ),
      ).toEqual({
        AND: [{ status: { equals: 'ACTIVE' } }, { user: { name: { equals: 'test' } } }],
      });
    });
  });

  describe('buildOrderBy', () => {
    it('returns undefined for empty sort', () => {
      expect(prismaQueryAdapter.buildOrderBy([])).toBeUndefined();
    });

    const sortCases: [
      string,
      ResourceQuery['sort'],
      { createdAt?: 'asc' | 'desc'; firstName?: 'asc' | 'desc' }[],
    ][] = [
      ['single sort', [{ field: 'createdAt', direction: 'desc' }], [{ createdAt: 'desc' }]],
      [
        'multiple sorts',
        [
          { field: 'createdAt', direction: 'desc' },
          { field: 'firstName', direction: 'asc' },
        ],
        [{ createdAt: 'desc' }, { firstName: 'asc' }],
      ],
    ];

    for (const [label, sort, expected] of sortCases) {
      it(`builds ${label}`, () => {
        expect(prismaQueryAdapter.buildOrderBy(sort)).toEqual(expected);
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
        expect(prismaQueryAdapter.buildSkipTake(page, limit)).toEqual(expected);
      });
    }
  });

  describe('integration with adapter.map', () => {
    it('maps complete query', () => {
      const result = prismaQueryAdapter.map(
        makeQuery({
          filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
          sort: [{ field: 'createdAt', direction: 'desc' }],
          pagination: { page: 2, limit: 25 },
        }),
      );
      expect(result.where).toEqual({ status: { equals: 'ACTIVE' } });
      expect(result.orderBy).toEqual([{ createdAt: 'desc' }]);
      expect(result.skip).toBe(25);
      expect(result.take).toBe(25);
    });
  });

  describe('nested relation filters', () => {
    it('builds nested relation filters from dotted paths', () => {
      expect(
        prismaQueryAdapter.buildWhere(
          makeQuery({
            relations: [
              {
                relation: 'org.parent',
                filters: [{ field: 'name', operator: 'eq', value: 'x' }],
              },
            ],
          }),
        ),
      ).toEqual({ org: { parent: { name: { equals: 'x' } } } });
    });
  });
});
