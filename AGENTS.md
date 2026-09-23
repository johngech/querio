# AGENTS.md

## Project

Querio — type-safe, declarative query language for TypeScript APIs. Monorepo built with Bun.

## Commands

```bash
bun run build       # builds all packages (core + adapters)
bun test            # runs all .spec.ts files
bun run lint        # biome check .
bun run lint:fix    # biome check --write .
bun run format      # biome format --write .
bun run typecheck   # tsc --noEmit
```

Pre-commit order: `lint → typecheck → test`

To run a single test file: `bun test tests/parser/parser.spec.ts`

## Structure

```
packages/
  core/src/
    definition/       # defineQuery, defineRelation, q builders, query definition types
    operators/        # q.op namespace, OpBuilder, FilterOperator/FieldType types
    parser/           # QueryParser + where/order/search engines (internal)
    query/            # Query Model / IR types (Filter, Search, Sort, Pagination, ResourceQuery)
    compiler/         # QueryMapper, mapQuery, QueryMapperAdapter/MappableAdapter (internal)
    index.ts          # PUBLIC BARREL — the only safe public surface
  prisma/src/         # Prisma adapter (isolated)
  drizzle/src/        # Drizzle adapter (isolated)
  typeorm/src/        # TypeORM adapter (isolated)
tests/
  definition/         # definition.spec.ts, operators.spec.ts
  parser/             # parser, where-engine, order-engine, search-engine specs
  validation/         # errors.spec.ts
  compiler/           # compiler.spec.ts (QueryMapper tests)
  adapters/           # prisma.spec.ts, drizzle.spec.ts, typeorm.spec.ts
```

## Conventions

- **Runtime**: Bun (bun-types, `bun test`, `bun build`)
- **Linter/formatter**: Biome 2.5.12 — single quotes, semicolons always, trailing commas, 100-char line width, space indent (2)
- **Biome rules**: `useImportType: off`, `noNonNullAssertion: off`, `noStaticOnlyClass: off`
- **Build**: per-package `tsconfig.build.json` excludes tests from dist output
- **Output**: dual ESM + CJS via `bun build` (core), `tsc` only (adapters)
- **Tests**: `.spec.ts` files, Bun's built-in test runner (no Jest/Vitest)
- **Module format**: ESM (`"type": "module"` in all package.json files)
- **Workspaces**: Bun workspaces via `"workspaces": ["packages/*"]` in root package.json

## Gotchas

- `index.ts` is the ONLY public surface for core. Import `parser/`, `compiler/`, `definition/`, `operators/` internals only from within core or from tests (never in public-facing code)
- Core adapter subpath exports (`@queryjs/core/compiler`) map to `packages/core/dist/`
- Adapter `tsconfig.build.json` sets `paths` to `../core/dist` for `@queryjs/core` — adapters typecheck against core's **built** declarations, so core must be built first (`bun run build` handles the order). Do NOT point these paths at `../core/src` or tsc drags the whole core source into the adapter program and fails on `rootDir`
- Adapter packages (`@queryjs/prisma`, `@queryjs/drizzle`, `@queryjs/typeorm`) depend on `@queryjs/core` as a peer dependency; workspace symlinks therefore do NOT exist in node_modules, which is why the `paths` → dist mapping is required
- Tests import directly from source (`../../packages/core/src/`) not from built dist
- `dist/` directories are gitignored but are the published artifacts
- Never let `tsc` emit into `packages/*/src/` (declaration/js files next to sources) — they trip biome's `useLiteralKeys` and pollute the build. Remove any `*.js`, `*.js.map`, `*.d.ts`, `*.d.ts.map` found under `src/`
- Root `package.json` is `"private": true` — it's the workspace root, not published
