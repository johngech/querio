# @queryjs/core

[![npm version](https://img.shields.io/npm/v/@queryjs/core)](https://www.npmjs.com/package/@queryjs/core)
[![CI](https://github.com/johngech/queryjs/actions/workflows/ci.yml/badge.svg)](https://github.com/johngech/queryjs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@queryjs/core)](https://github.com/johngech/queryjs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-%23007ACC)](https://github.com/johngech/queryjs)

Type-safe, declarative query language for TypeScript REST APIs. Parse raw HTTP query parameters into validated `ResourceQuery` objects, then map them to any ORM.

This package is the core of QueryJS: the schema builders (`defineQuery`, `q`), the parser, the query model, and the mapping/compiler layer. ORM adapters live in separate packages — [`@queryjs/prisma`](https://www.npmjs.com/package/@queryjs/prisma), [`@queryjs/drizzle`](https://www.npmjs.com/package/@queryjs/drizzle), and [`@queryjs/typeorm`](https://www.npmjs.com/package/@queryjs/typeorm).

## Why QueryJS?

Typical `req.query` handling goes like this: a string like `?filter[age][gte]=18` is split with regexes, cast with `Number()`, validated by hand, and then each controller builds its own Prisma/Firebase/whatever `where` object. That code is stringly-typed, repeated everywhere, and easy to get wrong in security-relevant ways.

QueryJS replaces it with three steps that are the same in every controller:

1. **Declare** the queryable surface of a resource (schema-first, type-safe).
2. **Parse** raw params into a validated, typed `ResourceQuery`.
3. **Map** that query to your ORM's native arguments via an adapter.

If a client sends an unknown field, a bad operator, a malformed number, or a `__proto__`-style hostile key, you get a structured `QueryJSError` back — the bad input never reaches your database.

## Installation

```bash
bun add @queryjs/core
# or
npm install @queryjs/core
# or
pnpm add @queryjs/core
# or
yarn add @queryjs/core
```

Core has no peer dependencies. Add one adapter to map queries to an ORM:

```bash
bun add @queryjs/prisma             # Prisma
bun add @queryjs/drizzle drizzle-orm   # Drizzle
bun add @queryjs/typeorm typeorm       # TypeORM
```

## Quick Start

Request: `GET /users?filter[status]=ACTIVE&filter[age][gte]=18&sort=-createdAt&page=2&limit=25`

```typescript
import { defineQuery, defineRelation, q } from '@queryjs/core';
import { prismaQueryAdapter } from '@queryjs/prisma';

const usersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    firstName: q.string().sortable().searchable(),
    email: q.string().sortable(),
    age: q.number().sortable(),
    createdAt: q.date().sortable(),
  },
  relations: {
    member: defineRelation({ fields: { accountNo: q.string() } }),
  },
});

// 1. Parse
const query = usersQuery.parse(req.query);

// 2. Map to Prisma arguments
const { where, orderBy, skip, take } = prismaQueryAdapter.map(query);

// 3. Query the database
const rows = await prisma.user.findMany({ where, orderBy, skip, take });

// const query → {
//   filters: [
//     { field: 'status', operator: 'eq', value: 'ACTIVE' },
//     { field: 'age', operator: 'gte', value: 18 },
//   ],
//   relations: [],
//   sort: [{ field: 'createdAt', direction: 'desc' }],
//   search: undefined,
//   pagination: { page: 2, limit: 25 },
// }
//
// const { where, orderBy, skip, take } →
// {
//   where: { status: { equals: 'ACTIVE' }, age: { gte: 18 } },
//   orderBy: [{ createdAt: 'desc' }],
//   skip: 25,
//   take: 25,
// }
```

`req.query` can be any object shaped like `QueryParams` (`page`, `limit`, `filter`, `sort`, `search`) — pass it straight from Express, Fastify, Koa, or a framework-free handler.

## Full Express Example

A complete list endpoint with validation-error handling, wired to Prisma:

```typescript
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { defineQuery, defineRelation, QueryJSError, q } from '@queryjs/core';
import { prismaQueryAdapter } from '@queryjs/prisma';

const prisma = new PrismaClient();
const app = express();

const usersQuery = defineQuery({
  fields: {
    name: q.string().sortable().searchable().max(100),
    email: q.string().sortable().searchable().email(),
    age: q.number().sortable().min(0).max(150).integer(),
    isActive: q.boolean().sortable(),
    role: q.enum(['admin', 'editor', 'viewer']).sortable().searchable(),
    createdAt: q.date().sortable(),
  },
  relations: {
    org: defineRelation({ fields: { name: q.string().sortable().searchable() } }),
  },
});

app.get('/users', async (req, res) => {
  try {
    const query = usersQuery.parse(req.query);
    const { where, orderBy, skip, take } = prismaQueryAdapter.map(query);
    const [data, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy, skip, take, include: { org: true } }),
      prisma.user.count({ where }),
    ]);
    res.json({ data, meta: { total, page: query.pagination.page, limit: query.pagination.limit } });
  } catch (error) {
    if (error instanceof QueryJSError) {
      // e.g. { message, code: 'INVALID_NUMBER', field: 'age', operator: 'eq', ... }
      const { message, code, field, operator, path, details } = error;
      res.status(error.statusCode).json({ error: { message, code, field, operator, path, details } });
      return;
    }
    throw error;
  }
});

app.listen(3000);
```

Same shape works with Fastify/Koa by passing the framework's parsed query object.

## API Reference

### `defineQuery(definition)` / `defineRelation(definition)`

`defineQuery` creates a resource definition with a typed `.parse(params)` method:

```typescript
interface QueryDefinition {
  fields: Record<string, FilterFieldSpec>;
  relations?: Record<string, RelationSpec>;
  limits?: ResourceQueryLimits;
  parse(params: QueryParams): ResourceQuery;
}
```

`defineRelation` declares a nested relation inside a definition (relations can nest up to `maxNestingDepth`). Use `q.enum()` values or operation ids directly; raw strings are also accepted.

### The `q` field builders

```typescript
q.string()   q.number()   q.boolean()   q.date()   q.enum(['a', 'b', 'c'])
```

Common modifiers:

| Modifier | Applies to | Effect |
| --- | --- | --- |
| `.sortable()` | all | Allow the field in `sort`. |
| `.searchable()` | all | Include the field in global/field search. |
| `.nullable()` | all | Mark the field as nullable in the schema. `isNull`/`isNotNull` matching is always available via operators. |
| `.caseSensitive()` | all | Case-sensitive string matching (default: insensitive). |
| `.operators(ops)` | all | Explicitly set allowed operators — pass `q.op.equal().contains()` or a raw array. |

String value constraints: `.min(len)`, `.max(len)`, `.email()`, `.pattern(/re/)` — each accepts an optional custom message. Number value constraints: `.min(n)`, `.max(n)`, `.integer()`. Constraint violations throw with `ErrorCode.VALUE_*` (see [Error handling](#error-handling)).

**Operators.** Every field type has a default operator set:

| Field type | Default operators |
| --- | --- |
| `string` | `eq`, `neq`, `contains`, `startsWith`, `in`, `notIn`, `isNull`, `isNotNull` |
| `number` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `isNull`, `isNotNull` |
| `boolean` | `eq`, `isNull`, `isNotNull` |
| `date` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `isNull`, `isNotNull` |
| `enum` | `eq`, `neq`, `in`, `notIn`, `isNull`, `isNotNull` |

Replace them per field with `.operators(...)`:

```typescript
const createdAt = q.date().operators(q.op.greaterThan().lessThan());
// or the raw array form:
const bio = q.string().operators(['eq', 'contains', 'isNull']);
```

The fluent `q.op` namespace and its wire-format ids — every example URL below is parsed and asserted in [`tests/docs/readme-examples.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/docs/readme-examples.spec.ts):

| Builder method | Wire id (`FilterOperator`) | Example URL |
| --- | --- | --- |
| `q.op.equal()` | `eq` | `?filter[status][eq]=ACTIVE` |
| `q.op.notEqual()` | `neq` | `?filter[status][neq]=ACTIVE` |
| `q.op.greaterThan()` | `gt` | `?filter[age][gt]=18` |
| `q.op.greaterThanOrEqual()` | `gte` | `?filter[age][gte]=18` |
| `q.op.lessThan()` | `lt` | `?filter[age][lt]=65` |
| `q.op.lessThanOrEqual()` | `lte` | `?filter[age][lte]=65` |
| `q.op.contains()` | `contains` | `?filter[name][contains]=abe` |
| `q.op.startsWith()` | `startsWith` | `?filter[name][startsWith]=abe` |
| `q.op.endsWith()` | `endsWith` | `?filter[name][endsWith]=beke` |
| `q.op.in()` | `in` | `?filter[status][in]=ACTIVE,INACTIVE` |
| `q.op.notIn()` | `notIn` | `?filter[status][notIn]=ACTIVE,INACTIVE` |
| `q.op.isNull()` | `isNull` | `?filter[email][isNull]=true` |
| `q.op.isNotNull()` | `isNotNull` | `?filter[email][isNotNull]=true` |

Category and semantics: `eq`/`neq` are value operators (a literal `null` input renders as `IS NULL`/`IS NOT NULL`), `gt`/`gte`/`lt`/`lte` are value comparisons, `contains`/`startsWith`/`endsWith` are substring (LIKE) operators, `in`/`notIn` are list operators, and `isNull`/`isNotNull` are null checks.

Note: `endsWith` is **opt-in** — it is not in the string defaults (see the "Default operators" table below). Declare it with `.operators(q.op.startsWith().endsWith())` as the doc-example schema does.

Consumers submit operators by their **wire id** (`…[gte]=18`, not `…[greaterThanOrEqual]=18`).

**Verified real output.** Every URL in this README is asserted by [`tests/docs/readme-examples.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/docs/readme-examples.spec.ts) and printed by `bun run verify-doc-examples` (one of the filter, sort, search and pagination examples):

```
GET /users?filter[age][gte]=18&filter[age][lt]=65&sort=-createdAt&page=2&limit=25
→   {"filters":[{"field":"age","operator":"gte","value":18,"caseSensitive":false},{"field":"age","operator":"lt","value":65,"caseSensitive":false}],"relations":[],"sort":[{"field":"createdAt","direction":"desc"}],"pagination":{"page":2,"limit":25}}

GET /users?filter[status][in][]=ACTIVE&filter[status][in][]=INACTIVE
→   {"filters":[{"field":"status","operator":"in","value":["ACTIVE","INACTIVE"],"caseSensitive":false}],"relations":[],"sort":[],"pagination":{"page":1,"limit":10}}

GET /users?filter[org][parent][name]=Acme
→   {"filters":[],"relations":[{"relation":"org.parent","filters":[{"field":"name","operator":"eq","value":"Acme","caseSensitive":false}]}],"sort":[],"pagination":{"page":1,"limit":10}}

GET /users?search=name:abe*
→   {"filters":[],"relations":[],"sort":[],"search":{"raw":"name:abe*","terms":[{"value":"abe","match":"prefix","field":"name","caseSensitive":false}],"fields":["status","name"]},"pagination":{"page":1,"limit":10}}

GET /users?page=1000001&limit=9999       (page/limit are clamped, never errors)
→   {"pagination":{"page":1000000,"limit":100}}
```

### Filter syntax

```
?filter[status]=ACTIVE                     → scalar: status op eq value 'ACTIVE'
?filter[age][gte]=18                       → scalar: age op gte value 18
?filter[status][in][]=ACTIVE&filter[status][in][]=PENDING
                                             → scalar: status op in value ['ACTIVE','PENDING']
?filter[email][isNull]=true                 → scalar: email op isNull
?filter[member][accountNo]=AC-1             → relation: member, scalar filters on accountNo
?filter[org][parent][name]=Acme             → relation: org.parent (nested)
```

Rules:

- A bare `field=value` means `eq`; `field[op]=value` means that specific operator.
- Array operators (`in`, `notIn`) accept repeated `…[op][]` params or a comma-separated list: `?filter[status][in]=ACTIVE,PENDING`.
- Multiple operators on the same field combine with **AND** (`?filter[age][gte]=18&filter[age][lt]=65` → age in `[18, 65)`).
- Submit `field` as a dotted relation path for nested relations. Depth is capped by `maxNestingDepth` (default 2).
- `isNull`/`isNotNull` take any value; `eq`/`neq` with a literal `null` render as `IS NULL`/`IS NOT NULL`.
- Unparsable values (e.g. a non-number for a `number` field) throw `INVALID_*` codes.

### Sort syntax

```
?sort=-createdAt
?sort=lastName,-firstName
?sort[createdAt]=desc
?sort[0]=-createdAt&sort[1]=firstName
?sort[0][createdAt]=desc
```

- Comma-separated list of fields; a leading `-` (or `desc` in the object form) means descending.
- Only `.sortable()` fields are accepted; others throw `NON_SORTABLE_FIELD`.

### Search syntax

```
?search=abebe                              → contains on every searchable field
?search="abebe beke"                       → phrase (contiguous substring)
?search=abe*                               → prefix match
?search=name:abebe                         → contains on name only
?search=name:abe*                          → prefix on name only
?search=name:abebe status:ACTIVE           → AND across terms
```

- Terms are space-separated; quote a phrase with `"` (unterminated quotes throw `UNTERMINATED_PHRASE`).
- `field:value` restricts a term to one field. The whole search is AND-joined across terms and OR-joined across fields; adapters translate to SQL `OR` groups.
- A `search` on a definition with no `.searchable()` fields throws `NO_SEARCHABLE_FIELDS`. `field:` targeting a non-searchable/unknown field throws `NON_SEARCHABLE_FIELD`/`UNKNOWN_SEARCH_FIELD`.
- Lengths are bounded: `maxLength = 200`, `maxTerms = 10`, `maxTermLength = 100` (override per query via `limits.search`).

### Pagination syntax

```
?page=2&limit=25                          → { page: 2, limit: 25 }
```

- Defaults `page = 1`, `limit = 10`. Non-numeric values fall back to defaults; fractional values truncate.
- Clamped to `[1, maxPage]` and `[1, maxLimit]`.

### Query limits

Cap pagination, filters, relation depth, and search per query. All optional; anything omitted falls back to the defaults.

```typescript
const queries = defineQuery({
  fields: { /* … */ },
  limits: {
    maxPage: 1000,          // default 1_000_000
    maxLimit: 50,           // default 100
    defaultLimit: 20,       // default 10
    maxFilters: 50,         // default 100
    maxNestingDepth: 3,     // default 2
    search: {
      maxLength: 300,       // default 200
      maxTerms: 5,          // default 10
      maxTermLength: 100,   // default 100
    },
  },
});
```

The resolved limits are frozen and cached per object identity — never mutate a passed-in limits object.

### `parse` and the `ResourceQuery` model

```typescript
interface ResourceQuery {
  filters: FilterExpression[];           // scalar conditions
  relations: RelationFilterExpression[]; // relation-scoped conditions
  sort: SortExpression[];                // ordered sort keys
  search?: SearchQuery;                  // defined only when `search` was present
  pagination: Pagination;                // { page, limit }
}

interface FilterExpression {
  field: string;                    // scalar field name
  operator: FilterOperator;         // wire id (eq, gte, …)
  value?: unknown;                  // coerced & validated value
  caseSensitive?: boolean;          // resolved from the field spec
}

interface RelationFilterExpression {
  relation: string;                 // dotted path, e.g. 'org.parent'
  filters: FilterExpression[];
}

interface SortExpression { field: string; direction: 'asc' | 'desc'; }

interface SearchQuery {
  raw: string;                      // original input
  terms: SearchTerm[];              // parsed terms
  fields: string[];                 // every searchable field
}
interface SearchTerm {
  value: string;
  match: 'contains' | 'prefix' | 'phrase';
  field?: string;                   // field:value restriction
  caseSensitive?: boolean;
}
```

### `@queryjs/core/compiler` subpath

The compiler turns a `ResourceQuery` into ORM arguments through a `QueryMapperAdapter`:

```typescript
import { mapQuery, QueryMapper } from '@queryjs/core/compiler';
import type { MappableAdapter, MappedQuery, QueryMapperAdapter } from '@queryjs/core/compiler';

// All three are equivalent ways to map:
mapQuery(query, adapter);
QueryMapper.map(query, adapter);
adapter.map(query); // when the adapter also exposes .map()
```

The three built-in adapters implement `MappableAdapter`, so `prismaQueryAdapter.map(query)` is a shortcut for `mapQuery(query, prismaQueryAdapter)`.

## Error Handling

Parsing and validation throw a single structured error type:

```typescript
import { ErrorCode, QueryJSError } from '@queryjs/core';

class QueryJSError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;     // offending field name
  readonly operator?: string;  // offending operator id
  readonly path?: string;      // relation path, for nested filters
  readonly details?: Record<string, unknown>;
  get statusCode(): number;    // always 400
}
```

`ErrorCode` is grouped by category:

| Category | Codes |
| --- | --- |
| Filter | `UNKNOWN_FIELD`, `UNSUPPORTED_OPERATOR`, `INVALID_FILTER_VALUE`, `FILTER_DEPTH_EXCEEDED`, `RELATION_MUST_BE_OBJECT` |
| Sort | `NON_SORTABLE_FIELD`, `INVALID_SORT_DIRECTION`, `EMPTY_SORT_FIELD` |
| Search | `NO_SEARCHABLE_FIELDS`, `SEARCH_TOO_LONG`, `TOO_MANY_SEARCH_TERMS`, `SEARCH_TERM_TOO_LONG`, `NON_SEARCHABLE_FIELD`, `UNKNOWN_SEARCH_FIELD`, `EMPTY_SEARCH_VALUE`, `EMPTY_SEARCH_QUERY`, `UNTERMINATED_PHRASE` |
| Value | `INVALID_BOOLEAN`, `INVALID_NUMBER`, `INVALID_DATE`, `INVALID_ENUM_VALUE` |
| Value constraints | `VALUE_TOO_SHORT`, `VALUE_TOO_LONG`, `VALUE_OUT_OF_RANGE`, `VALUE_NOT_INTEGER`, `VALUE_NOT_EMAIL`, `VALUE_PATTERN_MISMATCH`, `TOO_MANY_FILTERS` |

Handle them centrally:

```typescript
app.use((err, req, res, next) => {
  if (err instanceof QueryJSError) {
    const { statusCode, ...rest } = err;
    return res.status(statusCode).json({ error: rest });
  }
  next(err);
});
```

Example — `GET /users?filter[age]=old` where `age` is a `number` field throws:

```
QueryJSError: Invalid number value: 'old', expected a valid number
  code: INVALID_NUMBER
  field: 'age'
  operator: 'eq'
```

## Security Notes

- **Whitelist first.** Only schema-declared fields parse successfully; everything else throws `UNKNOWN_FIELD` before reaching your database.
- **Own-property semantics.** Field/relation keys are assigned via own-property operations, so hostile keys like `__proto__` cannot silently pollute the emitted `where` objects.
- **Capped by default.** `TOO_MANY_FILTERS` (default 100), `FILTER_DEPTH_EXCEEDED` (default 2), bounded search (`maxLength`/`maxTerms`/`maxTermLength`), `maxPage`, and `maxLimit` keep untrusted input from building enormous OR-clauses or offsets. Adapt your limits to what each query may legitimately produce.
- **LIKE escaping.** Substring operators escape `%`, `_`, and `\`, so user input matches literally. Adapters pass values through parameterized SQL.

## Custom Adapters

Implement the `QueryMapperAdapter` interface (exposed from `@queryjs/core/compiler`):

```typescript
import type { ResourceQuery, SortExpression } from '@queryjs/core';
import { mapQuery } from '@queryjs/core/compiler';
import type { QueryMapperAdapter } from '@queryjs/core/compiler';

interface MyWhere { [field: string]: unknown }
type MyOrderBy = Record<string, 'ASC' | 'DESC'>;

const myAdapter: QueryMapperAdapter<MyWhere, MyOrderBy> = {
  buildWhere(query: ResourceQuery): MyWhere | undefined {
    // Translate query.filters, query.relations, query.search to your ORM.
    // Return undefined when there is no where clause.
    const where: MyWhere = {};
    for (const f of query.filters) {
      where[f.field] = { op: f.operator, value: f.value };
    }
    return Object.keys(where).length > 0 ? where : undefined;
  },

  buildOrderBy(sort: SortExpression[]): MyOrderBy | undefined {
    if (sort.length === 0) return undefined;
    const order: MyOrderBy = {};
    for (const s of sort) order[s.field] = s.direction.toUpperCase() as 'ASC' | 'DESC';
    return order;
  },

  buildSkipTake(page: number, limit: number) {
    return { skip: (page - 1) * limit, take: limit };
  },
};

// Two equivalent call sites:
const mappedA = mapQuery(query, myAdapter);
const mappedB = myAdapter.buildWhere(query); // lower-level

// mappedA → { where: {…}, orderBy: {…}, skip: 0, take: 10 }
```

`MappedQuery<TWhere, TOrderBy>` and `MappableAdapter<TWhere, TOrderBy>` (an adapter that also exposes `.map(query)`) are exported for typing your own adapters. The built-in adapters are the reference implementations and are parity-tested against each other.

Semantics helpers are public for adapter authors:

```typescript
import {
  buildLikePattern,        // escaped LIKE pattern for contains/startsWith/endsWith
  escapeLikeValue,         // escape % _ \ for literal matching
  isEmptySubstringValue,   // true when a substring op has no useful value
  isStringOperator,        // true for contains/startsWith/endsWith
  nullClauseFor,           // '"isNull" | "notNull" | undefined' for a null input
  OPERATOR_SEMANTICS,      // per-operator category/needsValue/nullHandling
} from '@queryjs/core';
```

## Compatibility

- **Runtime:** Node.js ≥ 18 and Bun. Zero runtime dependencies.
- **Modules:** dual ESM + CJS (`import` and `require` both work; the `@queryjs/core/compiler` subpath mirrors the same dual format).
- **TypeScript:** full strict declarations for every query object and adapter result; compiled and verified with TypeScript 5.x and 7.
- **Peer packages:** the ORM adapters are separate packages and list their ORM as a peer dependency — core itself has none.

## Links

- Repository: [github.com/johngech/queryjs](https://github.com/johngech/queryjs)
- Issues: [github.com/johngech/queryjs/issues](https://github.com/johngech/queryjs/issues)
- Adapters: [`@queryjs/prisma`](https://github.com/johngech/queryjs/tree/main/packages/prisma) · [`@queryjs/drizzle`](https://github.com/johngech/queryjs/tree/main/packages/drizzle) · [`@queryjs/typeorm`](https://github.com/johngech/queryjs/tree/main/packages/typeorm)
- Examples: [examples/](https://github.com/johngech/queryjs/tree/main/examples)
- Design notes: [docs/architecture.md](https://github.com/johngech/queryjs/blob/main/docs/architecture.md)

## License

MIT © Yohannes Getachew — see [LICENSE](https://github.com/johngech/queryjs/blob/main/LICENSE).