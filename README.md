# Querio

Type-safe, declarative query language for TypeScript APIs.

Querio parses raw HTTP query parameters (`filter`, `sort`, `search`, `pagination`) into validated, application-level `ResourceQuery` objects, then maps them to your ORM's expected format via pluggable adapters.

## Features

- **Framework-agnostic** — no HTTP-framework or backend dependencies (works with Express, Fastify, Koa, plain Node, ...)
- **ORM adapters** — Prisma, TypeORM, Drizzle (extensible interface)
- **Type-safe** — full TypeScript types for all query objects
- **Validated** — clear error messages for invalid query parameters
- **Flexible** — supports complex filters, relation filters, search with phrases/prefixes

## Installation

```bash
bun add @querio/core @querio/prisma   # or @querio/drizzle / @querio/typeorm
```

## Quick Start

```typescript
import { defineQuery, defineRelation, q } from '@querio/core';
import { prismaQueryAdapter } from '@querio/prisma';

// 1. Define your resource schema with the fluent `q` API
const memberQuery = defineRelation({
  fields: {
    accountNo: q.string().sortable().searchable(),
  },
});

const usersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    firstName: q.string().sortable().searchable().operators(q.op.equal().contains()),
    email: q.string().sortable(),
    age: q.number().sortable(),
    createdAt: q.date().sortable(),
  },
  relations: {
    member: memberQuery,
  },
});

// 2. Parse raw query params into a validated ResourceQuery
function list(params: Record<string, unknown>) {
  const query = usersQuery.parse(params);

  // 3. Map to your ORM
  const { where, orderBy, skip, take } = prismaQueryAdapter.map(query);
  return prisma.user.findMany({ where, orderBy, skip, take });
}
```

## Query Syntax

### Filtering

```
?filter[status]=ACTIVE                    → [{ field: 'status', operator: 'equal', value: 'ACTIVE' }]
?filter[age][greaterThanOrEqual]=18       → [{ field: 'age', operator: 'greaterThanOrEqual', value: 18 }]
?filter[status][in][]=ACTIVE&filter[status][in][]=PENDING
                                            → [{ field: 'status', operator: 'in', value: ['ACTIVE', 'PENDING'] }]
?filter[email][isNull]=true               → [{ field: 'email', operator: 'isNull' }]
```

> **Note:** array operators (`in`, `notIn`) accept repeated `op[]=` parameters **or** a comma-separated list (e.g. `?filter[status][in]=ACTIVE,PENDING`).

### Sorting

```
?sort=-createdAt                          → [{ field: 'createdAt', direction: 'desc' }]
?sort=lastName,-firstName                 → [{ field: 'lastName', direction: 'asc' }, { field: 'firstName', direction: 'desc' }]
?sort[createdAt]=desc                     → [{ field: 'createdAt', direction: 'desc' }]
```

### Searching

```
?search=abebe                             → contains match (any searchable field)
?search="abebe beke"                      → phrase match (exact substring)
?search=abe*                              → prefix match
?search=firstName:abebe                   → field-specific match
?search=firstName:abe*                    → field-specific prefix
```

### Pagination

```
?page=2&limit=25                          → { page: 2, limit: 25 }
```

## Field Definition

Available builders: `q.string()`, `q.number()`, `q.boolean()`, `q.date()`, `q.enum(values)`.

Common modifiers:

- `.sortable()` / `.searchable()` — opt in to sorting/searching
- `.operators(q.op.equal().contains()...)` — allow specific comparison operators
- `.min(n)` / `.max(n)` / `.pattern(re)` / `.email()` — value constraints
- `.caseSensitive()` — string comparisons respect case (default: insensitive)

Fine-tune allowed operators per field type:

```typescript
import { q } from '@querio/core';

const spec = q.string().operators(
  q.op.equal().notEqual().contains().endsWith().in().notIn().isNull().isNotNull(),
);
```

## Query Limits

Set per-resource caps on pagination, filters, relation depth, and search. All limits are optional and fall back to the library defaults.

```typescript
const usersQuery = defineQuery({
  fields: { /* ... */ },
  limits: {
    maxPage: 1000,        // default 1_000_000
    maxLimit: 50,         // default 100
    defaultLimit: 20,     // default 10
    maxFilters: 50,       // default 100
    maxNestingDepth: 3,   // default 2 (relation filter depth)
    search: {             // overrides DEFAULT_SEARCH_LIMITS
      maxLength: 300,     // default 200 (raw search string)
      maxTerms: 5,        // default 10
      maxTermLength: 100, // default 100
    },
  },
});
```

## Adapters

### Prisma

```typescript
import { prismaQueryAdapter } from '@querio/prisma';

const { where, orderBy, skip, take } = prismaQueryAdapter.map(query);
await prisma.user.findMany({ where, orderBy, skip, take });
```

### TypeORM

```typescript
import { typeormQueryAdapter } from '@querio/typeorm';

const { where, orderBy, skip, take } = typeormQueryAdapter.map(query);
await userRepository.find({ where, order: orderBy, skip, take });
```

### Drizzle

```typescript
import { drizzleQueryAdapter, toDrizzleSQL } from '@querio/drizzle';

const { where, orderBy, skip, take } = drizzleQueryAdapter.map(query);
const rows = await db
  .select()
  .from(users)
  .where(where)
  .orderBy(...(orderBy ?? []))
  .limit(take)
  .offset(skip);

// The where/orderBy values are Drizzle SQL fragments; `toDrizzleSQL` flattens
// one back to a plain SQL string when you need raw SQL (debugging, sql`…` tags):
// const sqlText = toDrizzleSQL(where);
```

> **Note:** relation filters (`?filter[member][accountNo]=…`) assume the relation
> was joined under a table alias matching the relation path
> (e.g. `leftJoin(users.member, member)`).

### Custom Adapters

Implement the `QueryMapperAdapter` interface and wrap it with a `map()` helper:

```typescript
import type { ResourceQuery, SortExpression } from '@querio/core';
import { mapQuery, type QueryMapperAdapter } from '@querio/core/compiler';

const myAdapter: QueryMapperAdapter<MyWhere, MyOrderBy> = {
  buildWhere(query: ResourceQuery) {
    // Translate to your ORM's where format
  },
  buildOrderBy(sort: SortExpression[]) {
    // Translate to your ORM's order format
  },
  buildSkipTake(page: number, limit: number) {
    return { skip: (page - 1) * limit, take: limit };
  },
};

const { where, orderBy, skip, take } = mapQuery(query, myAdapter);
```

## License

MIT