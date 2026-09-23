# express-prisma

QueryJS + [Express](https://expressjs.com/) + [Prisma](https://www.prisma.io/) on SQLite, wired through [`@queryjs/core`](../../packages/core) and [`@queryjs/prisma`](../../packages/prisma).

## Setup

```bash
# 1. Build the QueryJS packages (core + prisma) so the file: deps resolve their dist/ output
cd ../.. && bun install && bun run build

# 2. Back here: install, push the schema (Prisma 7: db push does NOT generate the client,
#    so prisma:push = `prisma db push && prisma generate`), then seed
cd examples/express-prisma
bun install
bun run prisma:push
bun run seed
```

Prisma 7 already moved the database `url` out of the schema and into `prisma.config.ts`; the client is generated into `src/generated/prisma` and talks to SQLite through the WebAssembly `@prisma/adapter-libsql` adapter (the `better-sqlite3` adapter's native addon can't load under Bun).

## Run

```bash
bun run dev       # or: bun run start
```

Server listens on http://localhost:3000.

## Try it

Schema: `User { name, email, age, status, role, createdAt, org }` with `Org { name }`.

```bash
# Filtering
curl 'http://localhost:3000/users?filter[status]=ACTIVE'
curl 'http://localhost:3000/users?filter[age][gte]=30&filter[age][lt]=50'
curl 'http://localhost:3000/users?filter[status][in]=ACTIVE,INACTIVE'
curl 'http://localhost:3000/users?filter[role][isNotNull]=true'

# Relation filter (Prisma nests into { org: { name: { equals: 'Acme' } } })
curl 'http://localhost:3000/users?filter[org][name]=Acme'

# Sorting (pad with - for descending)
curl 'http://localhost:3000/users?sort=createdAt'
curl 'http://localhost:3000/users?sort=-age,name'

# Search — field-scoped (global search emits mode:'insensitive', which SQLite rejects; see note below)
curl 'http://localhost:3000/users?search=role:admin'
curl 'http://localhost:3000/users?search=name:fik*'

# Pagination (defaults: page=1&limit=10)
curl 'http://localhost:3000/users?page=2&limit=2&sort=age'

# Validation error (unknown field / bad value)
curl 'http://localhost:3000/users?filter[password]=hunter2'
curl 'http://localhost:3000/users?filter[age]=old'
```

The error responses show the structured `QueryJSError`: `{ error: { message, code, field, operator } }`.

> **Express 5 note:** Express 5's default `query` parser is flat-only (`simple`), so the server sets `app.set('query parser', 'extended')` (qs) to parse QueryJS's nested `filter[age][gte]=30` syntax.
>
> **SQLite note:** Prisma rejects `mode: 'insensitive'` on SQLite, so this example declares its string fields with `.caseSensitive()` — substring/search matching is case-sensitive here. Field-scoped search (`search=role:admin`) resolves the field's case setting, so it compiles without `mode`. **Global search** (`search=admin`) always emits `mode: 'insensitive'` (the search term targets all fields at once), which SQLite rejects at runtime — the 500 handler turns it into a JSON error rather than a crash. On PostgreSQL/MySQL you can drop `.caseSensitive()` and global search works as-is.
> See the [adapter caveat](../../packages/prisma/README.md#operator-mapping).