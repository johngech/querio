# @queryjs/prisma

[![npm version](https://img.shields.io/npm/v/@queryjs/prisma)](https://www.npmjs.com/package/@queryjs/prisma)
[![CI](https://github.com/johngech/queryjs/actions/workflows/ci.yml/badge.svg)](https://github.com/johngech/queryjs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@queryjs/prisma)](https://github.com/johngech/queryjs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-%23007ACC)](https://github.com/johngech/queryjs)

Prisma adapter for [QueryJS](https://www.npmjs.com/package/@queryjs/core): translates validated `ResourceQuery` objects into Prisma `where`, `orderBy`, `skip`, and `take` arguments.

You define your queryable schema once with `@queryjs/core`, parse request params into a `ResourceQuery`, and let this adapter produce exactly what `prisma.model.findMany({ where, orderBy, skip, take })` expects.

## Why this adapter?

Instead of hand-building `where` objects per controller, you get:

- **One source of truth.** The schema in `defineQuery` decides which fields are filterable, sortable, and searchable.
- **Correct Prisma shapes.** `eq` → `{ equals }`, `gte` → `{ gte }`, string operators → `contains`/`startsWith`/`endsWith` with consistent case handling, multi-operator fields → Prisma `AND` lists, search → `OR`.
- **Relation filters out of the box.** `?filter[org][name]=Acme` nests into `{ org: { name: { equals: 'Acme' } } }` for Prisma's relation filters.
- **No type drift.** `map()` returns `PrismaWhereInput`/`PrismaOrderByInput`-shaped values, so the compiler catches a schema/query mismatch.
- **Identity with the other adapters.** The same query produces semantically identical results across the Prisma, Drizzle, and TypeORM adapters (see the parity tests in [`tests/adapters/operator-parity.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/adapters/operator-parity.spec.ts)).

## Installation

```bash
bun add @queryjs/core @queryjs/prisma
# or
npm install @queryjs/core @queryjs/prisma
# or
pnpm add @queryjs/core @queryjs/prisma
# or
yarn add @queryjs/core @queryjs/prisma
```

`@queryjs/core` is a peer dependency. The adapter deliberately has **no** `prisma`/`@prisma/client` peer dependency — it emits structurally Prisma-compatible objects (the `WhereInput`/`OrderByInput` shapes) so you can use it with any Prisma version. Use your generated client in the final `findMany` call.

## Quick Start

Request: `GET /users?filter[status]=ACTIVE&filter[age][gte]=18&sort=-createdAt&page=2&limit=25`

```typescript
import { defineQuery, q } from '@queryjs/core';
import { prismaQueryAdapter } from '@queryjs/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const usersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    age: q.number().sortable().min(0).max(150),
    createdAt: q.date().sortable(),
  },
});

const query = usersQuery.parse(req.query);
const { where, orderBy, skip, take } = prismaQueryAdapter.map(query);

const rows = await prisma.user.findMany({ where, orderBy, skip, take });

// const query →
// {
//   filters: [
//     { field: 'status', operator: 'eq', value: 'ACTIVE' },
//     { field: 'age', operator: 'gte', value: 18 },
//   ],
//   sort: [{ field: 'createdAt', direction: 'desc' }],
//   pagination: { page: 2, limit: 25 },
//   relations: [], search: undefined,
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

Pass `where` straight to `findMany`; also reuse it for `count()` so counts match the filtered page.

## Full Express Example

```typescript
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { defineQuery, QueryJSError, q } from '@queryjs/core';
import { prismaQueryAdapter } from '@queryjs/prisma';

const prisma = new PrismaClient();
const app = express();

const usersQuery = defineQuery({
  fields: {
    name: q.string()
            .sortable()
            .searchable()
            .max(100)
            .operators(q.op.contains().endsWith().startsWith()),
    email: q.string()
            .sortable()
            .searchable()
            .email(),
    age: q.number()
          .sortable()
          .min(0)
          .max(150)
          .integer(),
    isActive: q.boolean()
                .sortable(),
    role: q.enum(['admin', 'editor', 'viewer'])
           .searchable()
           .sortable(),
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
      const { message, code, field, operator, path, details } = error;
      res.status(error.statusCode).json({ error: { message, code, field, operator, path, details } });
      return;
    }
    throw error;
  }
});

app.listen(3000);
```

## API Reference

### `prismaQueryAdapter.map(query)`

```typescript
import { prismaQueryAdapter } from '@queryjs/prisma';
import type { PrismaOrderByInput, PrismaWhereInput } from '@queryjs/prisma';

const mapped: {
  where: PrismaWhereInput | undefined;
  orderBy: PrismaOrderByInput[] | undefined;
  skip: number;
  take: number;
} = prismaQueryAdapter.map(query);
```

### Operator mapping

The wire ids come from `@queryjs/core` (`FilterOperator`):

| Builder method | Wire id | Example URL → Prisma shape |
| --- | --- | --- |
| `q.op.equal()` | `eq` | `?filter[status][eq]=ACTIVE` → `{ status: { equals: 'ACTIVE' } }` |
| `q.op.notEqual()` | `neq` | `?filter[status][neq]=ACTIVE` → `{ status: { not: 'ACTIVE' } }` |
| `q.op.in()` | `in` | `?filter[status][in]=ACTIVE,INACTIVE` → `{ status: { in: ['ACTIVE','INACTIVE'] } }` |
| `q.op.notIn()` | `notIn` | `?filter[status][notIn]=ACTIVE,INACTIVE` → `{ status: { notIn: ['ACTIVE','INACTIVE'] } }` |
| `q.op.greaterThan()` | `gt` | `?filter[age][gt]=18` → `{ age: { gt: 18 } }` |
| `q.op.greaterThanOrEqual()` | `gte` | `?filter[age][gte]=18` → `{ age: { gte: 18 } }` |
| `q.op.lessThan()` | `lt` | `?filter[age][lt]=65` → `{ age: { lt: 65 } }` |
| `q.op.lessThanOrEqual()` | `lte` | `?filter[age][lte]=65` → `{ age: { lte: 65 } }` |
| `q.op.contains()` | `contains` | `?filter[name][contains]=abe` → `{ name: { contains: 'abe', mode? } }` |
| `q.op.startsWith()` | `startsWith` | `?filter[name][startsWith]=abe` → `{ name: { startsWith: 'abe', mode? } }` |
| `q.op.endsWith()` | `endsWith` | `?filter[name][endsWith]=beke` → `{ name: { endsWith: 'beke', mode? } }` |
| `q.op.isNull()` | `isNull` | `?filter[email][isNull]=true` → `{ email: { equals: null } }` |
| `q.op.isNotNull()` | `isNotNull` | `?filter[email][isNotNull]=true` → `{ email: { not: null } }` |

General mapping — compact form of the same table:

| Wire id | Prisma shape | Notes |
| --- | --- | --- |
| `eq` | `{ equals: v }` | `null` input → `{ equals: null }` (SQL `IS NULL`) |
| `neq` | `{ not: v }` | `null` input → `{ not: null }` (SQL `IS NOT NULL`) |
| `in` | `{ in: [...] }` | |
| `notIn` | `{ notIn: [...] }` | |
| `gt` | `{ gt: v }` | |
| `gte` | `{ gte: v }` | |
| `lt` | `{ lt: v }` | |
| `lte` | `{ lte: v }` | |
| `contains` | `{ contains: v, mode? }` | `mode: 'insensitive'` by default (see caveat below) |
| `startsWith` | `{ startsWith: v, mode? }` | |
| `endsWith` | `{ endsWith: v, mode? }` | |
| `isNull` | `{ equals: null }` | |
| `isNotNull` | `{ not: null }` | |

**Case sensitivity.** String operators emit `mode: 'insensitive'` unless the field was declared `.caseSensitive()`.

> **Provider caveat:** Prisma only supports `mode: 'insensitive'` on PostgreSQL, CockroachDB, and MySQL. SQLite and SQL Server reject it at runtime. If you target those providers, declare string fields `.caseSensitive()` (which suppresses `mode`), or gate the adapter by provider.

**Multiple operators on one field** (`?filter[age][gte]=18&filter[age][lt]=65`) split into separate objects under `AND`:

```typescript
// { where: { AND: [{ age: { gte: 18 } }, { age: { lt: 65 } }] } }
```

**Search** expands to an `OR` over every searchable field (or the `field:` target), still `AND`-combined with scalar filters:

```typescript
// ?search=abe&filter[status]=ACTIVE
// {
//   where: {
//     AND: [
//       { status: { equals: 'ACTIVE' } },
//       { OR: [{ status: { contains: 'abe', mode: 'insensitive' } },
//              { name: { contains: 'abe', mode: 'insensitive' } }] },
//     ],
//   },
// }
```

**Relation filters** (`?filter[org][name]=Acme`) nest under the relation name or dotted path, compatible with Prisma's relation filters and `include`:

```typescript
// { where: { org: { name: { equals: 'Acme' } } } }
```

### Types

`PrismaWhereInput` and `PrismaOrderByInput` are exported for typing controller code without importing your generated Prisma namespace. They are intentionally structural (index signatures + `AND`/`OR`/`NOT`) and can be assigned to your generated `Prisma.UserWhereInput` when you call `findMany`.

## Error Handling

All parse and validation errors come from `@queryjs/core` as `QueryJSError` (see its [error reference](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#error-handling)). This adapter only adds a defensive `QueryJSError` with `ErrorCode.UNSUPPORTED_OPERATOR` if it ever receives an operator it has no mapping for — which cannot happen for queries produced by `parse()`.

```typescript
import { QueryJSError } from '@queryjs/core';

catchError(error) {
  if (error instanceof QueryJSError) {
    return res.status(error.statusCode).json({ error });
  }
}
```

## Security Notes

- Queries are produced by `parse()` from your whitelisted schema, then mapped here — unknown fields never become `where` keys.
- Field names are written into the where object via own-property semantics, so hostile keys such as `__proto__` cannot alter the emitted object's prototype (defense-in-depth for hand-built `ResourceQuery`s).
- Value matching is parameterized by Prisma itself; unlike raw `LIKE` interpolation, Prisma's `contains` matches text literally.
- Account for the provider caveat above — on SQLite/SQL Server, either `.caseSensitive()` your string fields or the generated `mode: 'insensitive'` will throw at query time.
- Respect the core [security notes](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#security-notes), especially `maxPage`/`maxLimit`, so `skip`/`take` stay bounded.

## Custom Adapters

Don't use Prisma? The `QueryMapperAdapter` interface in `@queryjs/core/compiler` lets you target any data layer. See the [custom adapter example](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#custom-adapters) in the core README.

## Compatibility

- **Runtime:** Node.js ≥ 18, Bun.
- **Modules:** dual ESM + CJS (`"type": "module"`). `bun run smoke-pack` verifies both `import` and `require` under Bun and Node. The adapter keeps `@queryjs/core` as the only runtime dependency.
- **Peers:** `@queryjs/core` `^0.1.0`. Prisma itself is intentionally not a peer — the adapter emits structurally Prisma-compatible objects.
- **Types:** exported `PrismaWhereInput`/`PrismaOrderByInput` give you typed `where`/`orderBy` without a Prisma peer type.

## Example Application

Run a full Express + Prisma + SQLite server: [examples/express-prisma](https://github.com/johngech/queryjs/tree/main/examples/express-prisma)

## Links

- QueryJS repo: [github.com/johngech/queryjs](https://github.com/johngech/queryjs)
- Issues: [github.com/johngech/queryjs/issues](https://github.com/johngech/queryjs/issues)
- Core: [`@queryjs/core`](https://github.com/johngech/queryjs/tree/main/packages/core) · Sibling adapters: [`@queryjs/drizzle`](https://github.com/johngech/queryjs/tree/main/packages/drizzle) · [`@queryjs/typeorm`](https://github.com/johngech/queryjs/tree/main/packages/typeorm)

## License

MIT © Yohannes Getachew — see [LICENSE](https://github.com/johngech/queryjs/blob/main/packages/prisma/LICENSE).