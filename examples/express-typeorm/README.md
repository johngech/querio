# express-typeorm

QueryJS + [Express](https://expressjs.com/) + [TypeORM](https://typeorm.io/) on SQLite, wired through [`@queryjs/core`](../../packages/core) and [`@queryjs/typeorm`](../../packages/typeorm).

Uses the `sqljs` driver (`sql.js`, SQLite in WASM) so the example needs no native compilation. Runs on TypeORM 1.x and Express 5 — Express 5's default `query` parser is flat-only, so the server sets `app.set('query parser', 'extended')` (qs) to parse QueryJS's nested `filter[age][gte]=30` syntax.

## Setup

```bash
# 1. Build the QueryJS packages (core + typeorm) so the file: deps resolve their dist/ output
cd ../.. && bun install && bun run build

# 2. Back here: install and seed
cd examples/express-typeorm
bun install
bun run seed
```

## Run

```bash
bun run dev       # or: bun run start
```

Server listens on http://localhost:3002.

## Try it

Schema: `User { name, email, age, status, role, createdAt, org }` with `Org { name }`.

```bash
# Filtering
curl 'http://localhost:3002/users?filter[status]=ACTIVE'
curl 'http://localhost:3002/users?filter[age][gte]=30&filter[age][lt]=50'
curl 'http://localhost:3002/users?filter[status][in]=ACTIVE,INACTIVE'
curl 'http://localhost:3002/users?filter[role][isNotNull]=true'

# Multiple operators on one field → TypeORM And(MoreThanOrEqual(30), LessThan(50))
curl 'http://localhost:3002/users?filter[age][gte]=30&filter[age][lt]=50'

# Relation filter (nested where: { org: { name: 'Acme' } })
curl 'http://localhost:3002/users?filter[org][name]=Acme'

# Sorting
curl 'http://localhost:3002/users?sort=-createdAt'
curl 'http://localhost:3002/users?sort=-age,name'

# Search (ILike by default, case-insensitive)
curl 'http://localhost:3002/users?search=abe'
curl 'http://localhost:3002/users?search=role:admin'

# Pagination
curl 'http://localhost:3002/users?page=2&limit=2&sort=age'

# Validation error
curl 'http://localhost:3002/users?filter[age]=old'
```

Errors return the structured `QueryJSError`: `{ error: { message, code, field, operator } }`. Search responses use TypeORM's array-where OR form, so a search term on a filtered field is AND-merged with `And()`.