# Querio Implementation Plan

## Executive Summary

Querio is being transformed from a functional query parser into a production-quality **declarative query-schema and query-language system**. The core change is replacing the configuration-object API (`field.string({ sortable: true })`) with a fluent schema DSL (`q.string().searchable().sortable().operators(q.op.eq().contains())`), backed by a proper tokenizer/parser pipeline, structured errors, and a compiler-based adapter architecture.

**Current state**: Working single-package library with parser, mapper, and 3 adapters (Prisma, TypeORM, Drizzle). Tests pass. API works but is config-object-based.

**Target state**: Fluent schema DSL with type-safe operators, state-machine tokenizer, clean parser pipeline, structured errors, and adapter-as-compiler architecture.

---

## Gap Analysis: Current vs Spec

| Dimension | Current | Spec Target | Effort |
|-----------|---------|-------------|--------|
| Public API | `field.string({sortable:true})` | `q.string().sortable().operators(q.op.eq())` | Medium — new builder classes |
| Operator declaration | `operators: ['eq','neq']` (string array) | `q.op.eq().neq().done()` (fluent) | Medium — new OpBuilder class |
| Type-safe operators | Runtime-only validation | Compile-time rejection of invalid ops | Low — already planned via builder pattern |
| Validation | None on field definitions | `.required()`, `.min()`, `.max()`, `.email()`, `.integer()` | Medium — add to field builders |
| Error handling | Message-only `QueryValidationError` | Structured `QuerioError` with code/field/path | Low — new error class |
| Tokenizer | Ad-hoc string splitting in search-engine | State-machine scanner | Medium — new file |
| Parser architecture | Monolithic engine classes | Keep engines, add tokenizer dependency | Low — refactor search-engine |
| Adapter contract | `buildWhere/buildOrderBy/buildSkipTake` | `compile(query): CompiledQuery` | Low — rename + consolidate |
| Error aggregation | First error throws | Keep throw-first (can add aggregation later) | None — already decided |
| Package structure | Single package | Keep single package (spec suggests monorepo but premature) | None |

---

## Phase 1 — Structured Error System

Create `src/errors/QuerioError.ts` with all error codes. This is the foundation used by everything else.

```ts
// Error codes organized by category
enum ErrorCode {
  // Syntax
  SYNTAX_ERROR, UNTERMINATED_STRING, UNEXPECTED_TOKEN,
  // Filter
  UNKNOWN_FIELD, UNSUPPORTED_OPERATOR, INVALID_FILTER_VALUE,
  FILTER_DEPTH_EXCEEDED, RELATION_MUST_BE_OBJECT,
  // Sort
  NON_SORTABLE_FIELD, INVALID_SORT_DIRECTION, EMPTY_SORT_FIELD,
  // Search
  NO_SEARCHABLE_FIELDS, SEARCH_TOO_LONG, TOO_MANY_SEARCH_TERMS,
  SEARCH_TERM_TOO_LONG, NON_SEARCHABLE_FIELD, UNKNOWN_SEARCH_FIELD,
  EMPTY_SEARCH_VALUE, EMPTY_SEARCH_QUERY, UNTERMINATED_PHRASE,
  // Value
  INVALID_BOOLEAN, INVALID_NUMBER, INVALID_DATE, INVALID_ENUM_VALUE,
  // Pagination
  INVALID_PAGINATION,
}

class QuerioError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly operator?: string;
  readonly path?: string;
  readonly details?: Record<string, unknown>;
  get statusCode(): number { return 400; }
}
```

Keep `QueryValidationError` as a re-export for backward compat.

**Files**: Create `src/errors/QuerioError.ts`, update `src/errors/QueryValidationError.ts`, create `tests/errors/QuerioError.spec.ts`

---

## Phase 2 — Operator Builders

Design the fluent `q.op` API.

```ts
// src/types/operators.ts

class OpBuilder {
  private _ops: FilterOperator[] = [];
  private _start: FilterOperator[];

  constructor(start: FilterOperator[]) {
    this._start = start;
    this._ops = [...start];
  }

  eq(): this       { this._ops.push('eq'); return this; }
  neq(): this      { this._ops.push('neq'); return this; }
  gt(): this       { this._ops.push('gt'); return this; }
  gte(): this      { this._ops.push('gte'); return this; }
  lt(): this       { this._ops.push('lt'); return this; }
  lte(): this      { this._ops.push('lte'); return this; }
  contains(): this { this._ops.push('contains'); return this; }
  startsWith(): this { this._ops.push('startsWith'); return this; }
  endsWith(): this { this._ops.push('endsWith'); return this; }
  in(): this       { this._ops.push('in'); return this; }
  nin(): this      { this._ops.push('nin'); return this; }
  isNull(): this   { this._ops.push('isNull'); return this; }
  isNotNull(): this { this._ops.push('isNotNull'); return this; }

  done(): readonly FilterOperator[] { return [...this._ops]; }
}

export const op = {
  eq: () => new OpBuilder(['eq']),
  neq: () => new OpBuilder(['neq']),
  gt: () => new OpBuilder(['gt']),
  gte: () => new OpBuilder(['gte']),
  lt: () => new OpBuilder(['lt']),
  lte: () => new OpBuilder(['lte']),
  contains: () => new OpBuilder(['contains']),
  startsWith: () => new OpBuilder(['startsWith']),
  endsWith: () => new OpBuilder(['endsWith']),
  in: () => new OpBuilder(['in']),
  nin: () => new OpBuilder(['nin']),
  isNull: () => new OpBuilder(['isNull']),
  isNotNull: () => new OpBuilder(['isNotNull']),
};
```

Usage: `q.op.eq().neq().contains().done()` → `['eq', 'neq', 'contains']`

**Files**: Create `src/types/operators.ts`, create `tests/types/operators.spec.ts`

---

## Phase 3 — Field Builders

Each field type gets a builder class with fluent validation and capability methods.

```ts
// src/types/field-builder.ts

// Shared base
abstract class FieldBuilder {
  protected _type: FieldType;
  protected _operators: FilterOperator[];
  protected _sortable = false;
  protected _searchable = false;
  protected _nullable = false;
  protected _caseSensitive = false;

  sortable(): this { this._sortable = true; return this; }
  searchable(): this { this._searchable = true; return this; }
  nullable(): this { this._nullable = true; return this; }
  caseSensitive(): this { this._caseSensitive = true; return this; }

  operators(ops: readonly FilterOperator[]): this {
    this._operators = [...ops];
    return this;
  }

  build(): FilterFieldSpec {
    return {
      type: this._type,
      operators: this._operators,
      sortable: this._sortable,
      searchable: this._searchable,
      nullable: this._nullable,
      caseSensitive: this._caseSensitive,
    };
  }
}

// String-specific
class StringFieldBuilder extends FieldBuilder {
  private _minLength?: number;
  private _maxLength?: number;
  private _pattern?: RegExp;
  private _isEmail = false;
  private _minLengthMsg?: string;
  private _maxLengthMsg?: string;
  private _patternMsg?: string;
  private _emailMsg?: string;

  constructor() {
    super();
    this._type = 'string';
    this._operators = [...STRING_DEFAULT_OPS];
  }

  min(len: number, msg?: string): this { this._minLength = len; this._minLengthMsg = msg; return this; }
  max(len: number, msg?: string): this { this._maxLength = len; this._maxLengthMsg = msg; return this; }
  email(msg?: string): this { this._isEmail = true; this._emailMsg = msg; return this; }
  pattern(re: RegExp, msg?: string): this { this._pattern = re; this._patternMsg = msg; return this; }
}

// Number-specific
class NumberFieldBuilder extends FieldBuilder {
  private _min?: number;
  private _max?: number;
  private _isInteger = false;
  private _minMsg?: string;
  private _maxMsg?: string;
  private _integerMsg?: string;

  constructor() {
    super();
    this._type = 'number';
    this._operators = [...NUMBER_DEFAULT_OPS];
  }

  min(val: number, msg?: string): this { this._min = val; this._minMsg = msg; return this; }
  max(val: number, msg?: string): this { this._max = val; this._maxMsg = msg; return this; }
  integer(msg?: string): this { this._isInteger = true; this._integerMsg = msg; return this; }
}

// Boolean, Date, Enum similarly...
```

**Files**: Create `src/types/field-builder.ts`, create `tests/types/field-builder.spec.ts`

---

## Phase 4 — The `q` Namespace

```ts
// src/types/q.ts

import { StringFieldBuilder, NumberFieldBuilder, BooleanFieldBuilder, DateFieldBuilder, EnumFieldBuilder } from './field-builder';
import { op } from './operators';

export const q = {
  string(): StringFieldBuilder { return new StringFieldBuilder(); },
  number(): NumberFieldBuilder { return new NumberFieldBuilder(); },
  boolean(): BooleanFieldBuilder { return new BooleanFieldBuilder(); },
  date(): DateFieldBuilder { return new DateFieldBuilder(); },
  enum(values: readonly string[]): EnumFieldBuilder { return new EnumFieldBuilder(values); },
};

export { op };
```

**Files**: Create `src/types/q.ts`, update `src/types/index.ts` to re-export

---

## Phase 5 — Update `defineQuery`

Accept `FieldBuilder` instances, call `.build()` to produce `FilterFieldSpec`:

```ts
export function defineQuery(def: {
  fields: Record<string, FieldBuilder>;
  relations?: Record<string, RelationSpec>;
}): ResourceQueryDefinition {
  const fields: Record<string, FilterFieldSpec> = {};
  for (const [name, builder] of Object.entries(def.fields)) {
    fields[name] = builder.build();
  }
  return { fields, relations: def.relations };
}
```

**Files**: Update `src/types/index.ts`

---

## Phase 6 — State-Machine Tokenizer

Implement a proper scanner for search strings. The current ad-hoc tokenization in `search-engine.ts` works but isn't structured for extensibility or error reporting.

```ts
// src/parser/tokenizer.ts

enum TokenType {
  IDENTIFIER, VALUE, QUOTED_VALUE, WILDCARD,
  COLON, COMMA, LBRACKET, RBRACKET, EOF,
}

enum TokenState {
  NORMAL, IN_QUOTE, ESCAPED,
}

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

class SearchTokenizer {
  private state: TokenState = TokenState.NORMAL;
  private tokens: Token[] = [];
  private current = '';
  private start = 0;
  private pos = 0;

  tokenize(input: string): Token[] { /* state machine */ }
}
```

**Complexity**: O(n) — single pass through input.

**Files**: Create `src/parser/tokenizer.ts`, create `tests/parser/tokenizer.spec.ts`

---

## Phase 7 — Update Search Engine

Refactor `QuerySearchEngine` to use the new `SearchTokenizer`. The public API stays the same; internal implementation changes.

**Files**: Update `src/parser/search-engine.ts`, update `tests/parser/search-engine.spec.ts`

---

## Phase 8 — New Adapter Contract

```ts
// src/mapper/adapter.ts

export interface CompiledQuery<TWhere = unknown, TOrderBy = unknown> {
  where: TWhere | undefined;
  orderBy: TOrderBy | undefined;
  skip: number;
  take: number;
}

export interface QueryAdapter<TWhere = unknown, TOrderBy = unknown> {
  compile(query: ResourceQuery): CompiledQuery<TWhere, TOrderBy>;
}
```

Update `QueryMapper.map()` to use the new contract:

```ts
static map<TWhere, TOrderBy>(
  query: ResourceQuery,
  adapter: QueryAdapter<TWhere, TOrderBy>,
): CompiledQuery<TWhere, TOrderBy> {
  return adapter.compile(query);
}
```

**Files**: Create `src/mapper/adapter.ts`, update `src/mapper/index.ts`

---

## Phase 9 — Update Adapters

### Prisma Adapter
Wrap existing `QueryMapper` delegation in `compile()`:

```ts
const prismaAdapter: QueryAdapter<PrismaWhereInput, PrismaOrderByInput[]> = {
  compile(query) {
    return {
      where: QueryMapper.toWhere(query) as PrismaWhereInput | undefined,
      orderBy: QueryMapper.toOrderBy(query.sort) as PrismaOrderByInput[] | undefined,
      skip: QueryMapper.toSkipTake(query.pagination.page, query.pagination.limit).skip,
      take: QueryMapper.toSkipTake(query.pagination.page, query.pagination.limit).take,
    };
  },
};
```

### TypeORM Adapter
Wrap existing self-contained logic in `compile()`. Remove dead `buildOperatorClause()` function (lines 14-37).

### Drizzle Adapter
Redesign to produce actual Drizzle-compatible objects instead of the intermediate `{ conditions, type }` format.

**Files**: Update all 3 adapter files, update all 3 adapter test files

---

## Phase 10 — Update Tests

### Existing Tests to Update
- `tests/parser/parser.spec.ts` — Update `defineQuery` calls to use `q.string()` etc.
- `tests/parser/where-engine.spec.ts` — Update schema definitions
- `tests/parser/order-engine.spec.ts` — Update schema definitions
- `tests/parser/search-engine.spec.ts` — Update schema definitions
- `tests/mapper/mapper.spec.ts` — Update for new adapter contract
- `tests/mapper/prisma-adapter.spec.ts` — Update for `compile()`
- `tests/mapper/typeorm-adapter.spec.ts` — Update for `compile()`
- `tests/mapper/drizzle-adapter.spec.ts` — Update for redesigned adapter

### New Tests to Add
- `tests/errors/QuerioError.spec.ts` — All error codes, structured fields
- `tests/types/q.spec.ts` — Field builders, `defineQuery` with new API
- `tests/types/operators.spec.ts` — OpBuilder chaining, `done()` output
- `tests/parser/tokenizer.spec.ts` — All token types, edge cases, unicode, escapes

---

## Phase 11 — Benchmarks

Create `benchmarks/tokenizer.bench.ts`:

```ts
import { bench, describe } from 'bun:test';
import { SearchTokenizer } from '../src/parser/tokenizer';

const tokenizer = new SearchTokenizer();

describe('tokenizer', () => {
  bench('simple term', () => tokenizer.tokenize('abebe'));
  bench('multiple terms', () => tokenizer.tokenize('abebe kebede takele'));
  bench('quoted phrase', () => tokenizer.tokenize('"abebe beke"'));
  bench('prefix', () => tokenizer.tokenize('abe*'));
  bench('field:value', () => tokenizer.tokenize('firstName:abebe'));
  bench('complex', () => tokenizer.tokenize('"abebe beke" firstName:take* age:25'));
  bench('malformed', () => tokenizer.tokenize('"unterminated'));
});
```

---

## Phase 12 — Update AGENTS.md

Document the new architecture, API, and conventions.

---

## Implementation Order (Recommended)

| Step | What | Files Changed | Depends On |
|------|------|--------------|------------|
| 1 | QuerioError | errors/ | None |
| 2 | OpBuilder | types/operators.ts | None |
| 3 | FieldBuilder | types/field-builder.ts | None |
| 4 | q namespace | types/q.ts | Steps 2,3 |
| 5 | defineQuery update | types/index.ts | Step 4 |
| 6 | Tokenizer | parser/tokenizer.ts | None |
| 7 | Search engine update | parser/search-engine.ts | Step 6 |
| 8 | Adapter contract | mapper/adapter.ts | None |
| 9 | Prisma adapter | mapper/adapters/prisma-adapter.ts | Step 8 |
| 10 | TypeORM adapter | mapper/adapters/typeorm-adapter.ts | Step 8 |
| 11 | Drizzle adapter | mapper/adapters/drizzle-adapter.ts | Step 8 |
| 12 | Update all tests | tests/** | Steps 1-11 |
| 13 | Add new tests | tests/** | Steps 1-11 |
| 14 | Benchmarks | benchmarks/ | Step 6 |
| 15 | AGENTS.md | AGENTS.md | All |

Steps 1-3 can run in parallel. Steps 9-11 can run in parallel.

---

## What Stays the Same

- `defineQuery()` function name (signature changes slightly)
- `ResourceQuery` intermediate representation
- `QueryParser.parse()` static method
- `QueryMapper.map()` static method
- Filter/sort/search/pagination HTTP syntax (`?filter[age][gte]=18`)
- All 13 operators
- All 5 field types
- Dual ESM/CJS build output
- Biome linting/formatting config
- Bun runtime and test runner

## Breaking Changes (v0.1.0 → v0.2.0)

1. `field.string()` → `q.string()` (import path changes)
2. `field.enum()` → `q.enum()` (import path changes)
3. Operator declaration: `{ operators: ['eq'] }` → `.operators(q.op.eq().done())`
4. `QueryValidationError` → `QuerioError` (alias kept for compat)
5. `QueryMapperAdapter` → `QueryAdapter` with `compile()` method
6. Field builders now have validation methods (`.min()`, `.max()`, `.email()`)
