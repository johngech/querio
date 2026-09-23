# @queryjs/drizzle

[![npm version](https://img.shields.io/npm/v/@queryjs/drizzle)](https://www.npmjs.com/package/@queryjs/drizzle)
[![CI](https://github.com/johngech/queryjs/actions/workflows/ci.yml/badge.svg)](https://github.com/johngech/queryjs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@queryjs/drizzle)](https://github.com/johngech/queryjs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-%23007ACC)](https://github.com/johngech/queryjs)

Drizzle adapter for [QueryJS](https://www.npmjs.com/package/@queryjs/core): translates validated `ResourceQuery` objects into Drizzle `SQL` fragments for `where` and `orderBy`, plus `skip`/`take` integers.

The adapter builds parameterized Drizzle `SQL` chunks — pass them straight to `.where()` / `.orderBy()`. A debug-only `toDrizzleSQL()` helper flattens a fragment back to text for tests and logs.

## Why this adapter?

- **No stringly-typed conditions.** Filters, relation filters, and search compile into Drizzle `SQL` values using parameter binding, so nothing is interpolated into SQL text.
- **Portable case-insensitive matching.** Substring operators use `LOWER(column) LIKE LOWER(pattern) ESCAPE '\'` — no database-specific collations, works on SQLite, PostgreSQL, and MySQL alike.
- **Literal `LIKE` input.** User-supplied `%`, `_`, and `\` are escaped, and SQLite (unlike PostgreSQL/MySQL) has no implicit backslash escaping — the explicit `ESCAPE '\'` makes it safe everywhere.
- **Relation filters with aliases.** `?filter[member][accountNo]=AC-1` compiles to `member.accountNo = 'AC-1'`, so a relation filter works when you have joined that relation under an alias matching the path.
- **Identity with the other adapters.** The same query produces semantically identical results across the Prisma, Drizzle, and TypeORM adapters (parity tests in [`tests/adapters/operator-parity.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/adapters/operator-parity.spec.ts)).

## Installation

```bash
bun add @queryjs/core @queryjs/drizzle drizzle-orm
# or
npm install @queryjs/core @queryjs/drizzle drizzle-orm
# or
pnpm add @queryjs/core @queryjs/drizzle drizzle-orm
# or
yarn add @queryjs/core @queryjs/drizzle drizzle-orm
```

`@queryjs/core` and `drizzle-orm` are peer dependencies (the adapter imports Drizzle's `and`, `or`, `sql`, and the `SQL` type). Install any driver you need on top (`better-sqlite3`, `pg`, `mysql2`, …).

## Quick Start

Request: `GET /users?filter[status]=ACTIVE&filter[age][gte]=18&sort=-createdAt&page=2&limit=25`

```typescript
import { defineQuery, q } from '@queryjs/core';
import { drizzleQueryAdapter } from '@queryjs/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { users } from './schema';

const db = drizzle(new Database('app.db'));

const usersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    age: q.number().sortable().min(0).max(150),
    createdAt: q.date().sortable(),
  },
});

const query = usersQuery.parse(req.query);
const { where, orderBy, skip, take } = drizzleQueryAdapter.map(query);

const rows = await db
  .select()
  .from(users)
  .where(where)               // SQL fragment | undefined
  .orderBy(...(orderBy ?? []))// spread SQL[]
  .limit(take)
  .offset(skip);

// const { where, orderBy, skip, take } →
// {
//   where: SQL fragment — `users.status = 'ACTIVE' AND users.age >= 18`,
//   orderBy: [ SQL fragment — `users.createdAt DESC` ],
//   skip: 25,
//   take: 25,
// }
```

Pass `undefined` where clauses freely — Drizzle omits them. For an empty result set ordering, there's no `orderBy` (spread of `[]`).

## Full Fastify Example

```typescript
import Fastify from 'fastify';
import { defineQuery, QueryJSError, q } from '@queryjs/core';
import { drizzleQueryAdapter } from '@queryjs/drizzle';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { orgs, users } from './schema';

const db = drizzle(new Database('app.db'));
const app = Fastify();

const usersQuery = defineQuery({
  fields: {
    name: q.string().sortable().searchable().max(100),
    email: q.string().sortable().searchable().email(),
    age: q.number().sortable().min(0).max(150).integer(),
    role: q.enum(['admin', 'editor', 'viewer']).searchable(),
  },
  relations: {
    org: defineRelation({ fields: { name: q.string().sortable().searchable() } }),
  },
});

app.get('/users', async (req, reply) => {
  try {
    const query = usersQuery.parse(req.query as Record<string, unknown>);
    const { where, orderBy, skip, take } = drizzleQueryAdapter.map(query);
    const data = await db.select().from(users).where(where).orderBy(...(orderBy ?? [])).limit(take).offset(skip);
    reply.send({ data, meta: { page: query.pagination.page, limit: query.pagination.limit } });
  } catch (error) {
    if (error instanceof QueryJSError) {
      const { message, code, field, operator, path, details } = error;
      return reply.status(error.statusCode).send({ error: { message, code, field, operator, path, details } });
    }
    throw error;
  }
});

await app.listen({ port: 3000 });
```

**Relation filters** (`?filter[org][name]=Acme`) reference `org.name` — join the relation under a matching alias in your query:

```typescript
// Alias the join as `org` so the generated `org.name` references it.
const data = await db
  .select()
  .from(users)
  .leftJoin(org, eq(users.orgId, org.id))
  .where(where)
  .orderBy(...(orderBy ?? []))
  .limit(take)
  .offset(skip);
```

## API Reference

### `drizzleQueryAdapter.map(query)`

```typescript
import { drizzleQueryAdapter, toDrizzleSQL } from '@queryjs/drizzle';

const mapped: {
  where: SQL | undefined;
  orderBy: SQL[] | undefined;
  skip: number;
  take: number;
} = drizzleQueryAdapter.map(query);
```

`where` and each `orderBy` element are Drizzle `SQL` fragments (`import type { SQL } from 'drizzle-orm'`). All values are bound parameters.

### Operator mapping

The wire ids come from `@queryjs/core` (`FilterOperator`):

| Builder method | Wire id | Example URL |
| --- | --- | --- |
| `q.op.equal()` | `eq` | `?filter[status][eq]=ACTIVE` |
| `q.op.notEqual()` | `neq` | `?filter[status][neq]=ACTIVE` |
| `q.op.greaterThan()` | `gt` | `?filter[age][gt]=18` |
| `q.op.greaterThanOrEqual()` | `gte` | `?filter[age][gte]=18` |
| `q.op.lessThan()` | `lt` | `?filter[age][lt]=65` |
| `q.op.lessThanOrEqual()` | `lte` | `?filter[age][lte]=65` |
| `q.op.in()` | `in` | `?filter[status][in]=ACTIVE,INACTIVE` |
| `q.op.notIn()` | `notIn` | `?filter[status][notIn]=ACTIVE,INACTIVE` |
| `q.op.contains()` | `contains` | `?filter[name][contains]=abe` |
| `q.op.startsWith()` | `startsWith` | `?filter[name][startsWith]=abe` |
| `q.op.endsWith()` | `endsWith` | `?filter[name][endsWith]=beke` |
| `q.op.isNull()` | `isNull` | `?filter[email][isNull]=true` |
| `q.op.isNotNull()` | `isNotNull` | `?filter[email][isNotNull]=true` |

SQL translation:

| Wire id | Drizzle SQL |
| --- | --- |
| `eq` | `col = ?` · `col IS NULL` for a `null` input |
| `neq` | `col != ?` · `col IS NOT NULL` for a `null` input |
| `in` | `col IN (?, ?, …)` · `1=0` for an empty list |
| `notIn` | `col NOT IN (?, ?, …)` · `1=1` for an empty list |
| `gt` / `gte` / `lt` / `lte` | `col > ?` / `col >= ?` / `col < ?` / `col <= ?` |
| `contains` | `LOWER(col) LIKE LOWER(? pattern) ESCAPE '\'` (see note) |
| `startsWith` | `LOWER(col) LIKE ? ESCAPE '\'` (see note) |
| `endsWith` | `LOWER(col) LIKE ? ESCAPE '\'` (see note) |
| `isNull` / `isNotNull` | `col IS NULL` / `col IS NOT NULL` |

**Case sensitivity.** For the substring family, matching is case-insensitive via `LOWER()` on both sides unless the field was declared `.caseSensitive()`, in which case `LOWER()` is omitted. `eq`/`neq` never wrap in `LOWER()` (they must stay plain for numeric/date columns).

**Multiple operators on one field** combine with Drizzle's `and(...)` — `?filter[age][gte]=18&filter[age][lt]=65` → `age >= ? AND age < ?`.

**Search** expands to `or(...)` across every searchable field (or the `field:` target), AND-joined with scalar filters. Phrase and bare terms compile to `contains`; `field:value*` to `startsWith`.

**Relation filters** qualify the column with the relation path: `?filter[org][name]=Acme` → `org.name = ?`. In your query, join the related table under an alias matching that path (e.g. `leftJoin(org, eq(users.orgId, org.id))`).

### `toDrizzleSQL(fragment)`

```typescript
import { toDrizzleSQL } from '@queryjs/drizzle';

const text = toDrizzleSQL(where); // e.g. "users.status = 'ACTIVE' AND users.age >= 18"
```

**DEBUG ONLY.** The returned string is a flattened representation of the fragment, not runnable SQL — parameter values are inlined literally without quoting. Use it for tests, logs, and eyeballing; never execute it and never feed it back into `sql.raw()`.

## Error Handling

All parse and validation errors come from `@queryjs/core` as `QueryJSError` (see its [error reference](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#error-handling)). The adapter adds a defensive `QueryJSError` with `ErrorCode.UNSUPPORTED_OPERATOR` if it ever receives an operator it has no SQL for — which cannot happen for queries produced by `parse()`.

```typescript
import { QueryJSError } from '@queryjs/core';

app.setErrorHandler((error, req, reply) => {
  if (error instanceof QueryJSError) {
    return reply.status(error.statusCode).send({ error });
  }
  throw error;
});
```

## Security Notes

- **Parameterized everywhere.** No user input is interpolated into SQL text; values are bound by Drizzle. The only text built from strings is the column name itself — quoted via `quoteIdentifier` (safe identifiers pass through, unsafe ones are double-quoted with escaped `"`).
- **LIKE literal matching.** `%`, `_`, and `\` in user input are escaped via `escapeLikeValue`, and `ESCAPE '\'` is always emitted — required for SQLite, harmless on PostgreSQL/MySQL.
- **Relation filter columns.** The relation path is also identifier-quoted, so it cannot inject SQL.
- **`toDrizzleSQL` is not for production.** It's a debug representation only (see above).
- Respect the core [security notes](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#security-notes), especially `maxPage`/`maxLimit`, so `offset`/`limit` stay bounded.

## Custom Adapters

Don't use Drizzle? The `QueryMapperAdapter` interface in `@queryjs/core/compiler` lets you target any data layer. See the [custom adapter example](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#custom-adapters) in the core README.

## Compatibility

- **Runtime:** Node.js ≥ 18, Bun.
- **Modules:** dual ESM + CJS (`"type": "module"`). `bun run smoke-pack` verifies both `import` and `require` under Bun and Node. Use with Drizzle's own ESM build (or the CJS fallback) together with this package.
- **Peers:** `@queryjs/core` `^0.1.0` and `drizzle-orm` `^0.38.3 || ^0.45.3`.
- **Drivers:** driver-agnostic — the adapter emits `SQL`, so it works with `better-sqlite3`, `node-postgres`, `mysql2`, and the other Drizzle drivers.
- **Types:** the map result is typed with Drizzle's `SQL`, so `where`/`orderBy` type-check against your queries.

## Example Application

Run a full Fastify + Drizzle + SQLite server: [examples/fastify-drizzle](https://github.com/johngech/queryjs/tree/main/examples/fastify-drizzle)

## Links

- QueryJS repo: [github.com/johngech/queryjs](https://github.com/johngech/queryjs)
- Issues: [github.com/johngech/queryjs/issues](https://github.com/johngech/queryjs/issues)
- Core: [`@queryjs/core`](https://github.com/johngech/queryjs/tree/main/packages/core) · Sibling adapters: [`@queryjs/prisma`](https://github.com/johngech/queryjs/tree/main/packages/prisma) · [`@queryjs/typeorm`](https://github.com/johngech/queryjs/tree/main/packages/typeorm)

## License

MIT © Yohannes Getachew — see [LICENSE](https://github.com/johngech/queryjs/blob/main/packages/drizzle/LICENSE).