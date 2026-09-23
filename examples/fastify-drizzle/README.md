# fastify-drizzle

QueryJS + [Fastify](https://fastify.dev/) + [Drizzle](https://orm.drizzle.team/) on [Bun's `bun:sqlite`](https://bun.sh/docs/api/sqlite), wired through [`@queryjs/core`](../../packages/core) and [`@queryjs/drizzle`](../../packages/drizzle).

Using `bun:sqlite` keeps the example dependency-free of native builds — no `better-sqlite3` compilation needed.

## Setup

```bash
# 1. Build the QueryJS packages (core + drizzle) so the file: deps resolve their dist/ output
cd ../.. && bun install && bun run build

# 2. Back here: install and seed
cd examples/fastify-drizzle
bun install
bun run seed
```

## Run

```bash
bun run dev       # or: bun run start
```

Server listens on http://localhost:3001.

## Try it

Schema: `User { name, email, age, status, role, createdAt, org }` with `Org { name }`.

```bash
# Filtering
curl 'http://localhost:3001/users?filter[status]=ACTIVE'
curl 'http://localhost:3001/users?filter[age][gte]=30&filter[age][lt]=50'
curl 'http://localhost:3001/users?filter[status][in]=ACTIVE,INACTIVE'
curl 'http://localhost:3001/users?filter[role][isNotNull]=true'

# Relation filter — the adapter emits org.name, so the query joins `org` (alias)
curl 'http://localhost:3001/users?filter[org][name]=Acme'

# Sorting
curl 'http://localhost:3001/users?sort=-age,name'

# Search (case-insensitive via LOWER(); escalating % _ \)
curl 'http://localhost:3001/users?search=edi'
curl 'http://localhost:3001/users?search=chaltu*'
curl 'http://localhost:3001/users?search=role:admin'

# Pagination
curl 'http://localhost:3001/users?page=2&limit=2&sort=age'

# Validation error
curl 'http://localhost:3001/users?filter[email][gte]=x'
curl 'http://localhost:3001/users?filter[org][secret]=Acme'
```

Errors return the structured `QueryJSError`: `{ error: { message, code, field, operator, path } }`. The second error targets an undeclared relation field and reports `path: 'org'`.

### Debugging SQL

The adapter returns Drizzle `SQL` fragments. To see the text form (tests/logs only — never execute it):

```typescript
import { toDrizzleSQL } from '@queryjs/drizzle';
const { where } = drizzleQueryAdapter.map(query);
console.log(toDrizzleSQL(where));
```