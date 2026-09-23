# QueryJS

[![npm version](https://img.shields.io/npm/v/@queryjs/core)](https://www.npmjs.com/package/@queryjs/core)
[![npm version](https://img.shields.io/npm/v/@queryjs/prisma)](https://www.npmjs.com/package/@queryjs/prisma)
[![npm version](https://img.shields.io/npm/v/@queryjs/drizzle)](https://www.npmjs.com/package/@queryjs/drizzle)
[![npm version](https://img.shields.io/npm/v/@queryjs/typeorm)](https://www.npmjs.com/package/@queryjs/typeorm)
[![CI](https://github.com/johngech/queryjs/actions/workflows/ci.yml/badge.svg)](https://github.com/johngech/queryjs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/johngech/queryjs/blob/main/LICENSE)

Type-safe, declarative query language for TypeScript REST APIs.

QueryJS parses raw HTTP query parameters — `filter`, `sort`, `search`, and pagination — into validated, typed `ResourceQuery` objects, then maps them to your ORM's expected format through pluggable adapters.

## Why QueryJS?

Hand-rolled `req.query` handling is stringly-typed, unvalidated, and coupled to one ORM. QueryJS replaces it with a **declared schema** on each resource, giving you:

- **Framework-agnostic** — no HTTP or backend dependencies. Works with Express, Fastify, Koa, plain Node, Bun, and anything else. Framework examples are included.
- **Schema-first** — define which fields are filterable, sortable, and searchable once, per resource, with `defineQuery` + the fluent `q` builder.
- **Validated & safe** — unknown fields, unsupported operators, malformed values, and hostile inputs (`__proto__`, over-deep relations, oversized filters) are rejected with structured `QueryJSError`s — not passed through to your database.
- **ORM-agnostic output** — parse once, map to Prisma, Drizzle, TypeORM, or your own adapter through the tiny `QueryMapperAdapter` interface.
- **Type-safe end to end** — full TypeScript types on every query object and adapter result.

## Packages

| Package | Description | npm |
| --- | --- | --- |
| [`@queryjs/core`](packages/core) | Schema definition (`defineQuery`, `q`), the query parser, `ResourceQuery` model, and the mapper/compiler. | [npm](https://www.npmjs.com/package/@queryjs/core) |
| [`@queryjs/prisma`](packages/prisma) | Prisma adapter — maps queries to `where`, `orderBy`, `skip`, `take`. | [npm](https://www.npmjs.com/package/@queryjs/prisma) |
| [`@queryjs/drizzle`](packages/drizzle) | Drizzle adapter — maps queries to SQL `where`/`orderBy` fragments. | [npm](https://www.npmjs.com/package/@queryjs/drizzle) |
| [`@queryjs/typeorm`](packages/typeorm) | TypeORM adapter — maps queries to `where`/`order` built from real `FindOperator`s. | [npm](https://www.npmjs.com/package/@queryjs/typeorm) |

Each package has a focused README with its full API reference:

- [@queryjs/core](packages/core/README.md) — **start here**
- [@queryjs/prisma](packages/prisma/README.md)
- [@queryjs/drizzle](packages/drizzle/README.md)
- [@queryjs/typeorm](packages/typeorm/README.md)

## Quick Start

```bash
bun add @queryjs/core @queryjs/prisma
# or: @queryjs/drizzle / @queryjs/typeorm
```

```typescript
import { defineQuery, defineRelation, q } from '@queryjs/core';
import { prismaQueryAdapter } from '@queryjs/prisma';

const usersQuery = defineQuery({
  fields: {
    status: q.enum(['ACTIVE', 'INACTIVE']).sortable().searchable(),
    name: q.string().sortable().searchable(),
    email: q.string().sortable(),
    age: q.number().sortable(),
    createdAt: q.date().sortable(),
  },
  relations: {
    member: defineRelation({
      fields: { accountNo: q.string().sortable().searchable() },
    }),
  },
});

// In your route:
function listUsers(params: Record<string, unknown>) {
  const query = usersQuery.parse(params); // → validated ResourceQuery
  const { where, orderBy, skip, take } = prismaQueryAdapter.map(query);
  return prisma.user.findMany({ where, orderBy, skip, take });
}
```

See the [@queryjs/core README](packages/core/README.md#quick-start) for a full input → parse → map walkthrough.

## Query Syntax

The wire format is compact and URL-friendly. `parse` turns these into validated `ResourceQuery` objects, then adapters translate them to your ORM. Every example below is asserted against real parser output by [`tests/docs/readme-examples.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/docs/readme-examples.spec.ts).

### Filtering

```
?filter[status]=ACTIVE                     → { field: 'status', operator: 'eq', value: 'ACTIVE' }
?filter[age][gte]=18&filter[age][lt]=65    → two eq/gte/lt filters on age, AND-ed
&sort=-createdAt&page=2&limit=25
?filter[status][in][]=ACTIVE&filter[status][in][]=INACTIVE
                                             → { field: 'status', operator: 'in', value: ['ACTIVE', 'INACTIVE'] }
?filter[email][isNull]=true                → { field: 'email', operator: 'isNull' }
?filter[member][accountNo]=AC-1            → relation 'member', filters: [accountNo eq 'AC-1']
?filter[org][parent][name]=Acme            → nested relation 'org.parent', filters: [name eq 'Acme']
```

Operators (wire ids): `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `isNull`, `isNotNull`.

**Null handling:** `isNull`/`isNotNull` are the way to query `NULL` over HTTP. Operators that accept a value (`eq`, `neq`, …) also interpret a literal `null` input as `IS NULL` / `IS NOT NULL`.

### Sorting

```
?sort=-createdAt                           → [{ field: 'createdAt', direction: 'desc' }]
?sort=status,-createdAt                    → [{ field: 'status', direction: 'asc' }, { field: 'createdAt', direction: 'desc' }]
?sort[createdAt]=desc                      → [{ field: 'createdAt', direction: 'desc' }]
```

Prefix a field with `-` for descending order (or use the object form).

### Searching

```
?search=abebe                             → contains match on every searchable field
?search="abebe beke"                      → phrase match (contiguous substring)
?search=abe*                              → prefix match
?search=name:abebe                        → contains match on name only
?search=name:abe*                         → prefix match on name only
?search=name:abebe status:ACTIVE          → AND across terms
```

### Pagination

```
?page=2&limit=25                            → { page: 2, limit: 25 }
?page=abc                                   → { page: 1, limit: 10 }  (coerced, never errors)
?page=1000001&limit=9999                    → { page: 1000000, limit: 100 }  (clamped)
```

Defaults: `page = 1`, `limit = 10`. Page and limit are coerced and clamped into `[1, cap]` (defaults: `maxPage = 1_000_000`, `maxLimit = 100`).

### Example applications

Live, runnable servers that wire each adapter to a real framework and database:

- [examples/express-prisma](https://github.com/johngech/queryjs/tree/main/examples/express-prisma) — Express + Prisma + SQLite
- [examples/fastify-drizzle](https://github.com/johngech/queryjs/tree/main/examples/fastify-drizzle) — Fastify + Drizzle + SQLite
- [examples/express-typeorm](https://github.com/johngech/queryjs/tree/main/examples/express-typeorm) — Express + TypeORM + SQLite

Each example includes a seed script and `curl` examples covering filters, sort, search, pagination, and validation errors.

## Adapters

| Adapter package | Map result | README |
| --- | --- | --- |
| `@queryjs/prisma` | `{ where: PrismaWhereInput, orderBy: PrismaOrderByInput[], skip, take }` | [README](packages/prisma/README.md) |
| `@queryjs/drizzle` | `{ where: SQL, orderBy: SQL[], skip, take }` | [README](packages/drizzle/README.md) |
| `@queryjs/typeorm` | `{ where: TypeORMWhere \| TypeORMWhere[], orderBy: TypeORMOrderBy, skip, take }` | [README](packages/typeorm/README.md) |

All three share identical semantics for the same query (see the operator parity tests in [`tests/adapters/operator-parity.spec.ts`](https://github.com/johngech/queryjs/blob/main/tests/adapters/operator-parity.spec.ts)). Bring your own ORM with a [custom adapter](packages/core/README.md#custom-adapters).

## Error Handling

Every parse/validation failure throws a single, structured exception:

```typescript
class QueryJSError extends Error {
  readonly code: ErrorCode;        // e.g. 'UNKNOWN_FIELD', 'INVALID_NUMBER', ...
  readonly field?: string;         // offending field, when relevant
  readonly operator?: string;      // offending operator, when relevant
  readonly path?: string;          // relation path, when relevant
  readonly details?: unknown;      // extra context
  get statusCode(): number;        // → 400
}
```

Map `ErrorCode` to HTTP responses in your error middleware:

```typescript
import { QueryJSError } from '@queryjs/core';

app.use((err, req, res, next) => {
  if (err instanceof QueryJSError) {
    const { message, code, field, operator, path, details } = err;
    return res.status(400).json({ error: { message, code, field, operator, path, details } });
  }
  next(err);
});
```

## Security Notes

QueryJS is designed to be safe when parsing untrusted query strings:

- **Whitelist only.** Only fields declared in your schema can appear in a query; unknown fields are rejected before they reach the database.
- **Hostile keys.** `__proto__`, `constructor`, etc. are handled via own-property semantics so they cannot corrupt the emitted where objects.
- **Hard caps by default.** `maxFilters = 100`, `maxNestingDepth = 2`, `maxPage = 1_000_000`, `maxLimit = 100`, and bounded search lengths/term counts prevent query blow-up (huge OR lists, deep nesting, long offsets). Tune per query with `limits` in `defineQuery`.
- **LIKE injection.** Substring operators escape `%`, `_`, and `\` so user input is matched literally, and values are passed through each adapter's parameterized SQL.

## Compatibility

- **Runtime:** Node.js ≥ 18, Bun. No runtime HTTP dependency.
- **Modules:** all four packages ship dual ESM + CJS (adapter ESM/CJS keep `@queryjs/core`, `@queryjs/core/compiler`, and the host ORM as externals/peers).
- **TypeScript:** strictly typed declarations, compiled with modern TS (verified with TypeScript 5+ and 7).

## Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets) and gated on CI — publishing never happens without a green check (lint, typecheck, tests, build, packaging smoke test).

1. Add a changeset:

   ```bash
   bun changeset    # patch / minor / major + summary
   ```

2. Commit and push to `main`. The `version` workflow opens (or updates) a **Version Packages** PR.
3. Merge that PR — versions are bumped and CHANGELOGs generated for all four packages at once.
4. Tag the release and push the tag:

   ```bash
   git tag v0.2.0                  # must match packages/core/package.json version
   git push origin v0.2.0
   ```

   All four packages version in lockstep (one changeset `fixed` group), so the tag must match every package's `version` — the release workflow verifies all four before publishing.

5. The `release` workflow runs the full CI (including the packaging smoke test that installs the packed tarballs) and, only if it passes, publishes `@queryjs/core`, `@queryjs/prisma`, `@queryjs/drizzle`, and `@queryjs/typeorm` to npm and creates a GitHub Release.

## Documentation

- [docs/architecture.md](https://github.com/johngech/queryjs/blob/main/docs/architecture.md) — design notes, wire protocol, parser/engine breakdown
- [docs/IMPLEMENTATION_PLAN.md](https://github.com/johngech/queryjs/blob/main/docs/IMPLEMENTATION_PLAN.md) — roadmap and history

## Contributing

- Repo: [github.com/johngech/queryjs](https://github.com/johngech/queryjs)
- Issues: [github.com/johngech/queryjs/issues](https://github.com/johngech/queryjs/issues)
- Core conventions live in [AGENTS.md](https://github.com/johngech/queryjs/blob/main/AGENTS.md). Pre-commit order: `bun run lint` → `bun run typecheck` → `bun test`.

## License

MIT © Yohannes Getachew