/**
 * Single source of truth for every HTTP query example shown in the READMEs.
 *
 * Both `scripts/verify-doc-examples.ts` (which prints the real `parse()` results
 * the docs paste in) and `tests/docs/readme-examples.spec.ts` (which asserts
 * those results never drift) import from here.
 *
 * The `expected` values below are the ACTUAL parser output, captured with
 * `bun run verify-doc-examples` — if parsing behavior ever changes these tests
 * fail so the docs cannot silently drift.
 */

import type { FilterOperator, ResourceQuery } from '../../packages/core/src/index';
import { defineQuery, defineRelation, q } from '../../packages/core/src/index';

/** The schema the doc examples use — mirrors the README quick start. */
export const docUsersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    // endsWith is opt-in: the string defaults are eq, neq, contains, startsWith,
    // in, notIn, isNull, isNotNull (see the README's "Default operators" table).
    name: q.string().sortable().searchable().operators(q.op.contains().startsWith().endsWith()),
    email: q.string().sortable(),
    age: q.number().sortable(),
    createdAt: q.date().sortable(),
  },
  relations: {
    member: defineRelation({ fields: { accountNo: q.string() } }),
    org: defineRelation({
      fields: { name: q.string() },
      relations: {
        parent: defineRelation({ fields: { name: q.string() } }),
      },
    }),
  },
});

/**
 * Minimal bracket-notation query parser. Turns `filter[age][gte]=18&sort=-age`
 * into the nested `{ filter: { age: { gte: '18' } }, sort: '-age' }` shape that
 * the QueryJS parser expects. Repeated `…[]` keys accumulate into arrays.
 */
export function parseBracketQuery(query: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const isArrayLeaf = key.endsWith('[]');
    const tokens = key.replace(/\[\]$/, '').split(/[[\]]/g).filter(Boolean);
    if (tokens.length === 0) continue;
    let cursor = root;
    for (const token of tokens.slice(0, -1)) {
      const next = cursor[token];
      if (typeof next !== 'object' || next === null) cursor[token] = {};
      cursor = cursor[token] as Record<string, unknown>;
    }
    const last = tokens[tokens.length - 1];
    if (isArrayLeaf) {
      const arr = Array.isArray(cursor[last]) ? (cursor[last] as unknown[]) : [];
      arr.push(value);
      cursor[last] = arr;
    } else {
      cursor[last] = value;
    }
  }
  return root;
}

export interface OperatorUrlExpectation {
  url: string;
  expected: {
    field: string;
    operator: FilterOperator;
    value: unknown;
    caseSensitive: boolean;
  };
}

export interface SyntaxUrlExpectation {
  url: string;
  expected: ResourceQuery;
}

export const OPERATOR_URLS: OperatorUrlExpectation[] = [
  {
    url: 'filter[status][eq]=ACTIVE',
    expected: { field: 'status', operator: 'eq', value: 'ACTIVE', caseSensitive: false },
  },
  {
    url: 'filter[status][neq]=ACTIVE',
    expected: { field: 'status', operator: 'neq', value: 'ACTIVE', caseSensitive: false },
  },
  {
    url: 'filter[age][gt]=18',
    expected: { field: 'age', operator: 'gt', value: 18, caseSensitive: false },
  },
  {
    url: 'filter[age][gte]=18',
    expected: { field: 'age', operator: 'gte', value: 18, caseSensitive: false },
  },
  {
    url: 'filter[age][lt]=65',
    expected: { field: 'age', operator: 'lt', value: 65, caseSensitive: false },
  },
  {
    url: 'filter[age][lte]=65',
    expected: { field: 'age', operator: 'lte', value: 65, caseSensitive: false },
  },
  {
    url: 'filter[name][contains]=abe',
    expected: { field: 'name', operator: 'contains', value: 'abe', caseSensitive: false },
  },
  {
    url: 'filter[name][startsWith]=abe',
    expected: { field: 'name', operator: 'startsWith', value: 'abe', caseSensitive: false },
  },
  {
    url: 'filter[name][endsWith]=beke',
    expected: { field: 'name', operator: 'endsWith', value: 'beke', caseSensitive: false },
  },
  {
    url: 'filter[status][in]=ACTIVE,INACTIVE',
    expected: {
      field: 'status',
      operator: 'in',
      value: ['ACTIVE', 'INACTIVE'],
      caseSensitive: false,
    },
  },
  {
    url: 'filter[status][notIn]=ACTIVE,INACTIVE',
    expected: {
      field: 'status',
      operator: 'notIn',
      value: ['ACTIVE', 'INACTIVE'],
      caseSensitive: false,
    },
  },
  {
    url: 'filter[email][isNull]=true',
    expected: { field: 'email', operator: 'isNull', value: undefined, caseSensitive: false },
  },
  {
    url: 'filter[email][isNotNull]=true',
    expected: { field: 'email', operator: 'isNotNull', value: undefined, caseSensitive: false },
  },
];

export const SYNTAX_URLS: SyntaxUrlExpectation[] = [
  {
    url: 'filter[status]=ACTIVE',
    expected: {
      filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE', caseSensitive: false }],
      relations: [],
      sort: [],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'filter[age][gte]=18&filter[age][lt]=65&sort=-createdAt&page=2&limit=25',
    expected: {
      filters: [
        { field: 'age', operator: 'gte', value: 18, caseSensitive: false },
        { field: 'age', operator: 'lt', value: 65, caseSensitive: false },
      ],
      relations: [],
      sort: [{ field: 'createdAt', direction: 'desc' }],
      pagination: { page: 2, limit: 25 },
    },
  },
  {
    url: 'filter[status][in][]=ACTIVE&filter[status][in][]=INACTIVE',
    expected: {
      filters: [
        {
          field: 'status',
          operator: 'in',
          value: ['ACTIVE', 'INACTIVE'],
          caseSensitive: false,
        },
      ],
      relations: [],
      sort: [],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'filter[email][isNull]=true',
    expected: {
      filters: [{ field: 'email', operator: 'isNull', caseSensitive: false }],
      relations: [],
      sort: [],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'filter[member][accountNo]=AC-1',
    expected: {
      filters: [],
      relations: [
        {
          relation: 'member',
          filters: [{ field: 'accountNo', operator: 'eq', value: 'AC-1', caseSensitive: false }],
        },
      ],
      sort: [],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'filter[org][parent][name]=Acme',
    expected: {
      filters: [],
      relations: [
        {
          relation: 'org.parent',
          filters: [{ field: 'name', operator: 'eq', value: 'Acme', caseSensitive: false }],
        },
      ],
      sort: [],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'sort=-createdAt',
    expected: {
      filters: [],
      relations: [],
      sort: [{ field: 'createdAt', direction: 'desc' }],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'sort=status,-createdAt',
    expected: {
      filters: [],
      relations: [],
      sort: [
        { field: 'status', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'sort[createdAt]=desc',
    expected: {
      filters: [],
      relations: [],
      sort: [{ field: 'createdAt', direction: 'desc' }],
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'search=abe',
    expected: {
      filters: [],
      relations: [],
      sort: [],
      search: {
        raw: 'abe',
        terms: [{ value: 'abe', match: 'contains' }],
        fields: ['status', 'name'],
      },
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'search="abebe beke"',
    expected: {
      filters: [],
      relations: [],
      sort: [],
      search: {
        raw: '"abebe beke"',
        fields: ['status', 'name'],
        terms: [{ value: 'abebe beke', match: 'phrase' }],
      },
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'search=name:abebe',
    expected: {
      filters: [],
      relations: [],
      sort: [],
      search: {
        raw: 'name:abebe',
        fields: ['status', 'name'],
        terms: [{ value: 'abebe', match: 'contains', field: 'name', caseSensitive: false }],
      },
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'search=name:abe*',
    expected: {
      filters: [],
      relations: [],
      sort: [],
      search: {
        raw: 'name:abe*',
        fields: ['status', 'name'],
        terms: [{ value: 'abe', match: 'prefix', field: 'name', caseSensitive: false }],
      },
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'search=name:abebe status:ACTIVE',
    expected: {
      filters: [],
      relations: [],
      sort: [],
      search: {
        raw: 'name:abebe status:ACTIVE',
        terms: [
          { value: 'abebe', match: 'contains', field: 'name', caseSensitive: false },
          { value: 'ACTIVE', match: 'contains', field: 'status', caseSensitive: false },
        ],
        fields: ['status', 'name'],
      },
      pagination: { page: 1, limit: 10 },
    },
  },
  {
    url: 'search=abe*',
    expected: {
      filters: [],
      relations: [],
      sort: [],
      search: {
        raw: 'abe*',
        terms: [{ value: 'abe', match: 'prefix' }],
        fields: ['status', 'name'],
      },
      pagination: { page: 1, limit: 10 },
    },
  },
];

/** Pagination clamping — page/limit are coerced and clamped, never errors. */
export const PAGINATION_URLS: { url: string; expected: { page: number; limit: number } }[] = [
  { url: 'page=2&limit=25', expected: { page: 2, limit: 25 } },
  { url: 'page=2', expected: { page: 2, limit: 10 } },
  { url: 'page=abc', expected: { page: 1, limit: 10 } },
  { url: 'limit=abc', expected: { page: 1, limit: 10 } },
  { url: 'page=0&limit=0', expected: { page: 1, limit: 1 } },
  { url: 'page=1000001&limit=9999', expected: { page: 1_000_000, limit: 100 } },
  { url: 'page=2.9&limit=25.9', expected: { page: 2, limit: 25 } },
  { url: 'page=-1&limit=-5', expected: { page: 1, limit: 1 } },
];
