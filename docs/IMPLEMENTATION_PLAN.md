# QueryJS — Implementation Status & Roadmap

> **Status doc, not a plan-doc.** This file describes what is shipped and what is
> intentionally deferred. Anything marked "planned" is not yet implemented.
> Architecture truth lives in [architecture.md](./architecture.md).

---

## Current Status

QueryJS is a shipped, tested monorepo library reconstructing a declarative
query-schema and query-language system. The configuration-object API
(`field.string({ sortable: true })`) was fully replaced by a fluent schema DSL
(`q.string().sortable().operators(q.op.equal())`) with a compiler-based adapter
architecture.

### Implemented

| Area | State |
|------|-------|
| Fluent field builders | `q.string()`, `q.number()`, `q.boolean()`, `q.date()`, `q.enum()`, `.min/.max/.pattern/.email/.integer`, `.sortable()`, `.searchable()`, `.operators(...)` |
| Operator builders | `q.op` namespace; OpBuilder composes `FilterOperator[]`; `.done()` optional |
| Wire format | Short operator ids (`eq`, `neq`, `gt`, `gte`, ...) — the canonical HTTP format |
| Query definition | `defineQuery` / `defineRelation`; `parse(params)` helper; definitions normalized + frozen at build time |
| Parser engines | `QueryWhereEngine`, `QueryOrderEngine`, `QuerySearchEngine`, `parsePagination` — parse and validate per concern, no AST/tokenizer stage |
| Validation | Capability, value/type, constraint, null, and complexity validation |
| Query Model | `ResourceQuery` — filters, relations, sort, search, pagination (plain data, ORM-free) |
| Errors | Single `QueryJSError` + `ErrorCode` enum, `statusCode: 400`, structured `field`/`operator`/`path`/`details` |
| Limits | `maxFilters` (100), `maxNestingDepth` (2), `maxPage`/`maxLimit`/`defaultLimit` (100), search length/terms caps |
| Security | `Object.hasOwn` own-property lookups, strict coercion, LIKE escaping, capabilities whitelisted |
| Operators semantics | `OPERATOR_SEMANTICS` registry + shared helpers (`nullClauseFor`, `buildLikePattern`, `escapeLikeValue`, `isStringOperator`, `isEmptySubstringValue`) |
| Adapteers | Prisma, Drizzle, TypeORM via `QueryMapperAdapter` (`buildWhere`/`buildOrderBy`/`buildSkipTake`), `mapQuery`, per-adapter `.map()` |
| Drizzle adapter | Emits runnable `SQL` fragments (`where`, `orderBy`) — `.where(where).orderBy(...(orderBy ?? []))`; `toDrizzleSQL` flattens to plain SQL; LOWER() case-insensitive; `ESCAPE '\'` |
| Build | Bun workspaces, dual ESM/CJS output for all four packages (adapter + compiler runtime files `bun build` with peers external; `tsc` emits declarations), per-package `tsconfig.build.json`, adapters typecheck against core dist |
| Packaging smoke test | `bun run smoke-pack` — packs the four tarballs, installs them + peer ORMs into a throwaway project, imports/requires every package (incl. `@queryjs/core/compiler`) under Bun and Node |
| Docs drift guard | Every URL example in the READMEs is asserted by `tests/docs/readme-examples.spec.ts` against real parser output (`bun run verify-doc-examples`) |

### Test coverage

```
tests/definition/  definition.spec.ts · operators.spec.ts
tests/parser/      parser · where-engine · order-engine · search-engine · fuzz
tests/validation/  errors.spec.ts
tests/compiler/    compiler.spec.ts
tests/adapters/    prisma · drizzle · typeorm · operator-parity
```

Fuzz tests assert invariants (no unknown fields, disallowed operators rejected,
typed values, bounded pagination). Operator-parity tests drive every operator
through all three adapters so null handling, empty-array semantics, LIKE
escaping, and case behavior cannot drift.

---

## Deliberately Deferred (Future Roadmap)

The following are **not** implemented. Do not assume they exist.

### Query language features

- [ ] **OR / NOT filter groups** — currently filters are implicitly AND-ed;
      grouped `(a|b)` conditions are not supported.
- [ ] **`isNull` / negated search** in more adapters / edge combinations (value
      policy coverage across ORMs is tested but not exhaustive).
- [ ] **Cursor-based pagination** — page/limit only.
- [ ] **Aggregations / count helper** — no `count()` support yet.
- [ ] **`q.datetime()` field type** — only `q.date()`.
- [ ] **Case-sensitive search option per query** (beyond the per-field
      `caseSensitive` spec).

### API / ergonomics

- [ ] **Type-level field coupling** — definitions are runtime objects; compile-
      time projection of the exact declared field/operator set (`typeof defineQuery(...)`)
      is not exposed.
- [ ] **Error aggregation** — throw-first remains the behavior.

### Distribution / operations

- [ ] **Node-version CI matrix** (runtime is Bun-only today); all four packages already ship dual ESM/CJS verified under Node.
- [x] **Publish workflow** — changesets versioning (`version.yml`) plus a
      tag-gated release pipeline (`release.yml`): pushing a `v*` tag runs CI and,
      only on pass, publishes `@queryjs/*` to npm via `bun publish`.
- [ ] **Real-DB integration tests** — adapter tests use typed structural mocks,
      not a live database.

### Extensibility

- [ ] Custom (third-party) field types beyond the five built-ins.
- [ ] Custom operators registered outside the `q.op` core set.

---

## Implementation Notes (History)

The original plan prescribed a tokenizer → AST → validator pipeline with distinct
error types (`TokenizerError`, `ParserError`, `ValidationError`, ...). During
implementation this was intentionally simplified:

- **No tokenizer/AST stage.** Tokenization, grammar, and validation are folded
  into the `where`/`order`/`search` engines. The public surface is smaller and
  there is only one structured error type, `QuerioError`.
- **Adapter contract stayed `buildWhere/buildOrderBy/buildSkipTake`** (returning
  `where`/`orderBy`/`skip`/`take`), rather than a renamed `compile()`.

Prior decisions that still hold:

- Keep `defineQuery()` and `ResourceQuery` names and the HTTP query syntax
  (`?filter[age][gte]=18`, `?sort=-createdAt`, `?search=name:abe*`).
- All 13 operators, all 5 field types.
- Dual ESM/CJS build output for core, Biome linting/formatting, Bun runtime and
  test runner.

---

## Next Recommended Steps

Highest-value, lowest-risk follow-ups, in order:

1. **Add a real `count`/aggregation helper** the adapters agree on.
2. **OR / NOT filter groups** with a backward-compatible extension to the filter
   wire format.
3. **Node CI matrix** (packaging is already dual ESM/CJS and smoke-tested under
   Node; CI itself runs only on Bun).
4. **Real-DB integration tests** (SQLite-at-minimum) behind a CI flag.