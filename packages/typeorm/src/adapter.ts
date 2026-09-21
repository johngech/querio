import type {
  FilterExpression,
  FilterOperator,
  ResourceQuery,
  SearchQuery,
  SortExpression,
} from "@querio/core";
import type { MappableAdapter } from "@querio/core/compiler";
import { QueryMapper } from "@querio/core/compiler";
import {
  And,
  FindOperator,
  ILike,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Not,
} from "typeorm";

// ── TypeORM types ─────────────────────────────────────────────────────────────

/** TypeORM-compatible WhereOptions shape. */
type TypeORMWhere = Record<string, unknown>;

/** TypeORM-compatible OrderBy shape. */
type TypeORMOrderBy = Record<string, "ASC" | "DESC">;

// ── TypeORM Adapter ───────────────────────────────────────────────────────────

/**
 * Adapter for TypeORM.
 * Translates Querio's application-level queries to TypeORM-compatible
 * `where`, `order`, and `skip/take` arguments using real `FindOperator`s
 * (`In`, `Not`, `MoreThan`, `ILike`, `IsNull`, ...).
 *
 * Multiple operators on the same field are combined with TypeORM's `And()`
 * (e.g. `age[gte]=18&age[lt]=65` → `{ age: And(MoreThanOrEqual(18), LessThan(65)) }`).
 * Search conditions are OR-joined using TypeORM's array-where form.
 */
export const typeormAdapter = {
  /** Map a parsed query to `{ where, orderBy, skip, take }` for TypeORM. */
  map(query: ResourceQuery): {
    where: TypeORMWhere | TypeORMWhere[] | undefined;
    orderBy: TypeORMOrderBy | undefined;
    skip: number;
    take: number;
  } {
    return QueryMapper.map(query, typeormAdapter);
  },

  buildWhere(query: ResourceQuery): TypeORMWhere | TypeORMWhere[] | undefined {
    return buildWhereFromQuery(query);
  },

  buildOrderBy(sort: SortExpression[]): TypeORMOrderBy | undefined {
    if (sort.length === 0) return undefined;
    const order: TypeORMOrderBy = {};
    for (const s of sort) {
      order[s.field] = directionToTypeORM(s.direction);
    }
    return order;
  },

  buildSkipTake(page: number, limit: number): { skip: number; take: number } {
    return QueryMapper.toSkipTake(page, limit);
  },
} satisfies MappableAdapter<TypeORMWhere | TypeORMWhere[], TypeORMOrderBy>;

// ── Internal helpers ──────────────────────────────────────────────────────────

function directionToTypeORM(direction: "asc" | "desc"): "ASC" | "DESC" {
  return direction === "asc" ? "ASC" : "DESC";
}

function buildWhereFromQuery(
  query: ResourceQuery,
): TypeORMWhere | TypeORMWhere[] | undefined {
  const base: TypeORMWhere = {};

  if (query.filters.length > 0) {
    Object.assign(base, buildScalarWhere(query.filters));
  }
  for (const rel of query.relations) {
    setNestedWhere(base, rel.relation, buildScalarWhere(rel.filters));
  }

  const searchAlternatives = query.search ? searchToWhere(query.search) : [];
  if (searchAlternatives.length === 0) {
    return Object.keys(base).length === 0 ? undefined : base;
  }

  const combined = searchAlternatives.map((alt) => ({ ...base, ...alt }));
  return combined.length === 1 ? combined[0] : combined;
}

/** Group filters per field, AND-combining multiple operators on the same field. */
function buildScalarWhere(filters: FilterExpression[]): TypeORMWhere {
  const grouped = new Map<string, unknown[]>();

  for (const f of filters) {
    const op = OPERATORS[f.operator](f.value, f.caseSensitive);
    const list = grouped.get(f.field) ?? [];
    list.push(op);
    grouped.set(f.field, list);
  }

  const where: TypeORMWhere = {};
  for (const [field, ops] of grouped) {
    where[field] =
      ops.length === 1
        ? ops[0]
        : (And(...(ops as FindOperator<unknown>[])) as unknown);
  }
  return where;
}

/** Assign `value` at a dotted path in `target`, creating intermediate objects. */
function setNestedWhere(
  target: TypeORMWhere,
  key: string,
  value: unknown,
): void {
  const segments = key.split(".");
  let node: TypeORMWhere = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const existing = node[segments[i]];
    if (typeof existing !== "object" || existing === null) {
      node[segments[i]] = {};
    }
    node = node[segments[i]] as TypeORMWhere;
  }
  node[segments[segments.length - 1]] = value;
}

const OPERATORS: Record<
  FilterOperator,
  (value: unknown, caseSensitive?: boolean) => unknown
> = {
  eq: (value) => (value === null ? IsNull() : value),
  neq: (value) => (value === null ? Not(IsNull()) : Not(value)),
  in: (value) => In(value as unknown[]),
  nin: (value) => Not(In(value as unknown[])),
  gt: (value) => MoreThan(value),
  gte: (value) => MoreThanOrEqual(value),
  lt: (value) => LessThan(value),
  lte: (value) => LessThanOrEqual(value),
  contains: (value, caseSensitive) => like(caseSensitive)(`%${value}%`),
  startsWith: (value, caseSensitive) => like(caseSensitive)(`${value}%`),
  endsWith: (value, caseSensitive) => like(caseSensitive)(`%${value}`),
  isNull: () => IsNull(),
  isNotNull: () => Not(IsNull()),
};

function like(
  caseSensitive?: boolean,
): (pattern: string) => FindOperator<string> {
  return caseSensitive === true ? Like : ILike;
}

/** Build one where-alternative per (term, field) — TypeORM's array-where OR. */
function searchToWhere(search: SearchQuery): TypeORMWhere[] {
  const alternatives: TypeORMWhere[] = [];

  for (const term of search.terms) {
    const targetFields = term.field ? [term.field] : search.fields;
    const op = like(term.caseSensitive);
    for (const f of targetFields) {
      alternatives.push({
        [f]:
          term.match === "prefix"
            ? op(`${term.value}%`)
            : op(`%${term.value}%`),
      });
    }
  }

  return alternatives;
}

export type { TypeORMOrderBy, TypeORMWhere };
