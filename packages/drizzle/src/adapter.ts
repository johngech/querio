import type {
  FilterOperator,
  RelationFilterExpression,
  ResourceQuery,
  SearchQuery,
  SortExpression,
} from '@querio/core';
import type { MappableAdapter } from '@querio/core/compiler';
import { QueryMapper } from '@querio/core/compiler';
import { and, or, type SQL, sql } from 'drizzle-orm';

// ── Drizzle types ────────────────────────────────────────────────────────────

/** Drizzle-compatible OrderBy item. */
interface DrizzleOrderByItem {
  column: string;
  order: 'asc' | 'desc';
}

// ── Drizzle Adapter ──────────────────────────────────────────────────────

/**
 * Adapter for Drizzle ORM.
 * Translates Querio's application-level queries to Drizzle-compatible
 * where, orderBy, and skip/take arguments.
 */
export const drizzleAdapter = {
  /** Map a parsed query to `{ where, orderBy, skip, take }` for Drizzle. */
  map(query: ResourceQuery): {
    where: SQL | undefined;
    orderBy: DrizzleOrderByItem[] | undefined;
    skip: number;
    take: number;
  } {
    return QueryMapper.map(query, drizzleAdapter);
  },

  buildWhere(query: ResourceQuery): SQL | undefined {
    return buildWhereFromQuery(query);
  },

  buildOrderBy(sort: SortExpression[]): DrizzleOrderByItem[] | undefined {
    if (sort.length === 0) return undefined;
    return sort.map((s) => ({
      column: s.field,
      order: s.direction,
    }));
  },

  buildSkipTake(page: number, limit: number): { skip: number; take: number } {
    return QueryMapper.toSkipTake(page, limit);
  },
} satisfies MappableAdapter<SQL, DrizzleOrderByItem[]>;

// ── Internal helpers ─────────────────────────────────────────────────────

function buildWhereFromQuery(query: ResourceQuery): SQL | undefined {
  const conditions: SQL[] = [];

  // Scalar filters
  for (const f of query.filters) {
    conditions.push(conditionFor(f.field, f.operator, f.value, f.caseSensitive));
  }

  // Relation filters
  for (const rel of query.relations) {
    conditions.push(...relationConditions(rel));
  }

  // Search → OR conditions
  const searchCondition = buildSearchCondition(query.search);
  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

function relationConditions(rel: RelationFilterExpression): SQL[] {
  const conditions: SQL[] = [];
  for (const f of rel.filters) {
    conditions.push(conditionFor(f.field, f.operator, f.value, f.caseSensitive, rel.relation));
  }
  return conditions;
}

function buildSearchCondition(search: SearchQuery | undefined): SQL | undefined {
  if (!search) return undefined;
  const parts: SQL[] = [];
  for (const term of search.terms) {
    const targetFields = term.field ? [term.field] : search.fields;
    const op = term.match === 'prefix' ? 'startsWith' : 'contains';
    for (const f of targetFields) {
      parts.push(conditionFor(f, op, term.value, term.caseSensitive));
    }
  }
  if (parts.length === 0) return undefined;
  return or(...parts);
}

function conditionFor(
  field: string,
  operator: FilterOperator,
  value?: unknown,
  caseSensitive?: boolean,
  relation?: string,
): SQL {
  const qualifiers = relation ? relation.split('.') : [];
  const colName = [...qualifiers, field].map(quoteIdentifier).join('.');
  const col = sql.raw(colName);
  // Case-insensitive string matching uses LOWER() on both sides — portable
  // across SQLite, PostgreSQL, and MySQL without database-specific collations.
  // Only applied to the LIKE family (string-only operators); `caseSensitive`
  // is emitted on every filter, so eq/neq must stay plain to avoid LOWER() on
  // numeric/date columns.
  // LIKE always emits ESCAPE '\' so user-supplied % / _ are treated literally —
  // required because SQLite has no implicit backslash escaping (unlike PG/MySQL).
  const likeInsensitive =
    !caseSensitive &&
    (operator === 'contains' || operator === 'startsWith' || operator === 'endsWith');
  const likeTarget = likeInsensitive ? sql`LOWER(${col})` : sql`${col}`;
  const likeTerm = (val: unknown): string => {
    const term = String(val);
    return likeInsensitive ? term.toLowerCase() : term;
  };

  const build = OPERATOR_SQL[operator];
  if (!build) {
    throw new Error(`Unsupported operator '${operator}'`);
  }
  return build({ col, likeTarget, likeTerm, value });
}

interface OperatorContext {
  col: SQL;
  likeTarget: SQL;
  likeTerm: (val: unknown) => string;
  value?: unknown;
}

const OPERATOR_SQL: Record<FilterOperator, (ctx: OperatorContext) => SQL> = {
  eq: ({ col, value }) => (value === null ? sql`${col} IS NULL` : sql`${col} = ${value}`),
  neq: ({ col, value }) => (value === null ? sql`${col} IS NOT NULL` : sql`${col} != ${value}`),
  gt: ({ col, value }) => sql`${col} > ${value}`,
  gte: ({ col, value }) => sql`${col} >= ${value}`,
  lt: ({ col, value }) => sql`${col} < ${value}`,
  lte: ({ col, value }) => sql`${col} <= ${value}`,
  contains: ({ likeTarget, likeTerm, value }) => {
    const pattern = `%${escapeLike(likeTerm(value))}%`;
    return sql`${likeTarget} LIKE ${pattern} ESCAPE '\\'`;
  },
  startsWith: ({ likeTarget, likeTerm, value }) => {
    const pattern = `${escapeLike(likeTerm(value))}%`;
    return sql`${likeTarget} LIKE ${pattern} ESCAPE '\\'`;
  },
  endsWith: ({ likeTarget, likeTerm, value }) => {
    const pattern = `%${escapeLike(likeTerm(value))}`;
    return sql`${likeTarget} LIKE ${pattern} ESCAPE '\\'`;
  },
  in: ({ col, value }) => {
    const arr = value as unknown[];
    if (arr.length === 0) return sql`1=0`;
    const chunks = arr.map((v) => sql`${v}`);
    return sql`${col} IN (${sql.join(chunks, sql`, `)})`;
  },
  nin: ({ col, value }) => {
    const arr = value as unknown[];
    if (arr.length === 0) return sql`1=1`;
    const chunks = arr.map((v) => sql`${v}`);
    return sql`${col} NOT IN (${sql.join(chunks, sql`, `)})`;
  },
  isNull: ({ col }) => sql`${col} IS NULL`,
  isNotNull: ({ col }) => sql`${col} IS NOT NULL`,
};

export type { DrizzleOrderByItem };

const SAFE_IDENTIFIER = /^[a-zA-Z_]\w*$/;

function quoteIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid identifier '${name}' in Drizzle where clause`);
  }
  return name;
}

/** Escape LIKE wildcards so user input is treated literally. */
function escapeLike(value: unknown): string {
  const backslash = String.raw`\\`.charAt(0);
  return String(value)
    .replaceAll(backslash, String.raw`\\`)
    .replaceAll('%', String.raw`\%`)
    .replaceAll('_', String.raw`\_`);
}
