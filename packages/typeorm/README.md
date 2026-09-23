# @queryjs/typeorm

[![npm version](https://img.shields.io/npm/v/@queryjs/typeorm)](https://www.npmjs.com/package/@queryjs/typeorm)
[![CI](https://github.com/johngech/queryjs/actions/workflows/ci.yml/badge.svg)](https://github.com/johngech/queryjs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@queryjs/typeorm)](https://github.com/johngech/queryjs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-%23007ACC)](https://github.com/johngech/queryjs)

TypeORM adapter for [QueryJS](https://www.npmjs.com/package/@queryjs/core): translates validated `ResourceQuery` objects into TypeORM `where`, `order`, `skip`, and `take` arguments built from real `FindOperator`s (`In`, `Not`, `MoreThan`, `ILike`, `IsNull`, …).

You keep your `EntityRepository`/`dataSource.getRepository()` flow — QueryJS just builds the `find` options for you.

## Why this adapter?

- **Real FindOperators.** `in` → `In([…])`, `gte` → `MoreThanOrEqual(value)`, `contains` → `ILike(pattern)` (or `Like` with `.caseSensitive()`), `isNull` → `IsNull()`. Nothing stringly-typed.
- **Correct multi-operator combining.** `?filter[age][gte]=18&filter[age][lt]=65` → `{ age: And(MoreThanOrEqual(18), LessThan(65)) }` using TypeORM's `And()` operator.
- **Search via array-where.** Search conditions become TypeORM's array-where form (alternatives OR-joined across fields), each AND-joined with the scalar filters — even when a search term targets a field that already has a filter (merged per-field with `And()`).
- **Relation filters with nesting.** `?filter[org][parent][name]=Acme` → `{ org: { parent: { name: … } } }`, matching TypeORM's nested relation where.
- **Identity with the other adapters.** The same query produces semantically identical results across the Prisma, Drizzle, and TypeORM adapters (parity tests in [`tests/adapters/operator-parity.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/adapters/operator-parity.spec.ts)).

## Installation

```bash
bun add @queryjs/core @queryjs/typeorm typeorm
# or
npm install @queryjs/core @queryjs/typeorm typeorm
# or
pnpm add @queryjs/core @queryjs/typeorm typeorm
# or
yarn add @queryjs/core @queryjs/typeorm typeorm
```

`@queryjs/core` and `typeorm` are peer dependencies. Use any TypeORM driver you like on top (`sqlite3`, `pg`, `mysql2`, …).

## Quick Start

Request: `GET /users?filter[status]=ACTIVE&filter[age][gte]=18&sort=-createdAt&page=2&limit=25`

```typescript
import { defineQuery, q } from '@queryjs/core';
import { typeormQueryAdapter } from '@queryjs/typeorm';
import { AppDataSource, User } from './entities';

const usersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    age: q.number().sortable().min(0).max(150),
    createdAt: q.date().sortable(),
  },
});

const query = usersQuery.parse(req.query);
const { where, orderBy, skip, take } = typeormQueryAdapter.map(query);

const repo = AppDataSource.getRepository(User);
const [rows, total] = await repo.findAndCount({ where, order: orderBy, skip, take });

// const { where, orderBy, skip, take } →
// {
//   where: { status: 'ACTIVE', age: MoreThanOrEqual(18) },
//   orderBy: { createdAt: 'DESC' },
//   skip: 25,
//   take: 25,
// }
```

Note the translation details: a single `eq` renders as the bare value (`{ status: 'ACTIVE' }`), and `orderBy` uses TypeORM's object form (`{ createdAt: 'DESC' }`) — pass it as the `order` option.

## Full Express Example

```typescript
import express from 'express';
import { defineQuery, QueryJSError, q } from '@queryjs/core';
import { typeormQueryAdapter } from '@queryjs/typeorm';
import { User } from './entities/User';

const app = express();

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

app.get('/users', async (req, res) => {
  try {
    const query = usersQuery.parse(req.query);
    const { where, orderBy, skip, take } = typeormQueryAdapter.map(query);
    const repo = AppDataSource.getRepository(User);
    const [data, total] = await repo.findAndCount({
      where,        // FindOptionsWhere | FindOptionsWhere[]
      order: orderBy,
      skip,
      take,
      relations: { org: true },
    });
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

### `typeormQueryAdapter.map(query)`

```typescript
import { typeormQueryAdapter } from '@queryjs/typeorm';
import type { TypeORMOrderBy, TypeORMWhere } from '@queryjs/typeorm';

const mapped: {
  where: TypeORMWhere | TypeORMWhere[] | undefined;
  orderBy: TypeORMOrderBy | undefined;
  skip: number;
  take: number;
} = typeormQueryAdapter.map(query);
```

`where` can be a single object or an array (when search conditions produce multiple alternatives) — both are valid TypeORM `FindOptionsWhere`. `orderBy` is the TypeORM `order` object shape.

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

FindOperator translation:

| Wire id | TypeORM `FindOperator` / value |
| --- | --- |
| `eq` | bare value (e.g. `'ACTIVE'`) · `IsNull()` for a `null` input |
| `neq` | `Not(value)` · `Not(IsNull())` for a `null` input |
| `in` | `In([…])` |
| `notIn` | `Not(In([…]))` |
| `gt` | `MoreThan(v)` |
| `gte` | `MoreThanOrEqual(v)` |
| `lt` | `LessThan(v)` |
| `lte` | `LessThanOrEqual(v)` |
| `contains` | `ILike('%…%')` · `Like('%…%')` with `.caseSensitive()` |
| `startsWith` | `ILike('…%')` · `Like('…%')` with `.caseSensitive()` |
| `endsWith` | `ILike('%…')` · `Like('%…')` with `.caseSensitive()` |
| `isNull` | `IsNull()` |
| `isNotNull` | `Not(IsNull())` |

**Case sensitivity.** Substring operators use `ILike` (case-insensitive) by default and `Like` when the field is declared `.caseSensitive()`.

**Multiple operators on one field** combine with TypeORM's `And()`:

```typescript
// { where: { age: And(MoreThanOrEqual(18), LessThan(65)) } }
```

**Search** produces TypeORM's array-where form, OR-joining terms across fields and AND-joining each alternative with the scalar filters:

```typescript
// ?search=abe&filter[status]=ACTIVE on searchable `name`
// { where: [{ status: 'ACTIVE', name: ILike('%abe%') }] }
```

**Relation filters** nest under the relation name or dotted path:

```typescript
// { where: { org: { name: 'Acme' } } }
```

### Types

`TypeORMWhere` and `TypeORMOrderBy` are exported for typing controller code. They are deliberately structural (`Record<string, unknown>` / `Record<string, 'ASC' | 'DESC'>`), so they assign to TypeORM's `FindOptionsWhere<T>` in practice.

## Error Handling

All parse and validation errors come from `@queryjs/core` as `QueryJSError` (see its [error reference](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#error-handling)). The adapter adds a defensive `QueryJSError` with `ErrorCode.UNSUPPORTED_OPERATOR` if it ever receives an operator it has no mapping for — which cannot happen for queries produced by `parse()`.

```typescript
import { QueryJSError } from '@queryjs/core';

app.use((err, req, res, next) => {
  if (err instanceof QueryJSError) {
    return res.status(err.statusCode).json({ error: err });
  }
  next(err);
});
```

## Security Notes

- **Parameterized values.** Values are bound through TypeORM; `ILike`/`Like` patterns are escaped (`%`, `_`, `\`) by the shared `buildLikePattern` so user input matches literally.
- **Own-property semantics.** Where keys are assigned via own-property operations, so hostile keys such as `__proto__` cannot corrupt the object prototype.
- **Search alternatives are bounded** by the core `maxTerms`/`maxLength` limits.
- Respect the core [security notes](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#security-notes), especially `maxPage`/`maxLimit`, so `skip`/`take` stay bounded.

## Custom Adapters

Don't use TypeORM? The `QueryMapperAdapter` interface in `@queryjs/core/compiler` lets you target any data layer. See the [custom adapter example](https://github.com/johngech/queryjs/blob/main/packages/core/README.md#custom-adapters) in the core README.

## Compatibility

- **Runtime:** Node.js ≥ 18, Bun.
- **Modules:** dual ESM + CJS (`"type": "module"`). `bun run smoke-pack` verifies both `import` and `require` under Bun and Node. Use with TypeORM's own ESM-compatible build (or CJS) together with this package.
- **Peers:** `@queryjs/core` `^0.1.0` and `typeorm` `^0.3.20 || ^1.0.0`.
- **Types:** the map result is typed (`TypeORMWhere | TypeORMWhere[]`, `TypeORMOrderBy`), so it assigns to `FindOptionsWhere`/`order` in `find`, `findAndCount`, etc.

## Example Application

Run a full Express + TypeORM + SQLite server: [examples/express-typeorm](https://github.com/johngech/queryjs/tree/main/examples/express-typeorm)

## Links

- QueryJS repo: [github.com/johngech/queryjs](https://github.com/johngech/queryjs)
- Issues: [github.com/johngech/queryjs/issues](https://github.com/johngech/queryjs/issues)
- Core: [`@queryjs/core`](https://github.com/johngech/queryjs/tree/main/packages/core) · Sibling adapters: [`@queryjs/prisma`](https://github.com/johngech/queryjs/tree/main/packages/prisma) · [`@queryjs/drizzle`](https://github.com/johngech/queryjs/tree/main/packages/drizzle)

## License

MIT © Yohannes Getachew — see [LICENSE](https://github.com/johngech/queryjs/blob/main/packages/typeorm/LICENSE).