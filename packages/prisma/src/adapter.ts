import type {
  FilterExpression,
  FilterOperator,
  RelationFilterExpression,
  ResourceQuery,
  SearchQuery,
  SortExpression,
} from '@querio/core';
import type { MappableAdapter } from '@querio/core/compiler';
import { QueryMapper } from '@querio/core/compiler';

// ── Prisma types (inline to avoid peer dep) ──────────────────────────────

/** Prisma-compatible WhereInput shape. */
interface PrismaWhereInput {
  [key: string]: unknown;
  AND?: PrismaWhereInput[];
  OR?: PrismaWhereInput[];
  NOT?: PrismaWhereInput[];
}

/** Prisma-compatible OrderByInput shape. */
interface PrismaOrderByInput {
  [key: string]: 'asc' | 'desc';
}

// ── Internal Helpers ───────────────────────────────────────────────────────

const OPERATOR_MAP: Record<
  FilterOperator,
  (value: unknown, caseSensitive?: boolean) => Record<string, unknown>
> = {
  eq: (value) => (value === null ? { equals: null } : { equals: value }),
  neq: (value) => (value === null ? { not: null } : { not: value }),
  in: (value) => ({ in: value }),
  nin: (value) => ({ notIn: value }),
  gt: (value) => ({ gt: value }),
  gte: (value) => ({ gte: value }),
  lt: (value) => ({ lt: value }),
  lte: (value) => ({ lte: value }),
  contains: (value, caseSensitive) => ({ contains: value, ...modeClause(caseSensitive) }),
  startsWith: (value, caseSensitive) => ({ startsWith: value, ...modeClause(caseSensitive) }),
  endsWith: (value, caseSensitive) => ({ endsWith: value, ...modeClause(caseSensitive) }),
  isNull: () => ({ equals: null }),
  isNotNull: () => ({ not: null }),
};

function modeClause(caseSensitive?: boolean): Record<string, string> {
  return caseSensitive ? {} : { mode: 'insensitive' };
}

function buildScalarWhere(filters: FilterExpression[]): Record<string, unknown> {
  const where: Record<string, Record<string, unknown>> = {};

  for (const f of filters) {
    const clause = OPERATOR_MAP[f.operator](f.value, f.caseSensitive);
    const existing = where[f.field];

    if (existing) {
      where[f.field] = { ...existing, ...clause };
    } else {
      where[f.field] = clause;
    }
  }

  return where;
}

function searchToWhere(search: SearchQuery): Record<string, unknown> {
  const fieldClauses: Record<string, unknown>[] = [];

  for (const term of search.terms) {
    const targetFields = term.field ? [term.field] : search.fields;

    for (const f of targetFields) {
      if (term.match === 'prefix') {
        fieldClauses.push({ [f]: { startsWith: term.value, ...modeClause(term.caseSensitive) } });
      } else {
        fieldClauses.push({ [f]: { contains: term.value, ...modeClause(term.caseSensitive) } });
      }
    }
  }

  if (fieldClauses.length === 1) return fieldClauses[0];
  return { OR: fieldClauses };
}

/** Build a nested relation where clause from a (possibly dotted) relation path. */
function relationToWhere(rel: RelationFilterExpression): Record<string, unknown> {
  const segments = rel.relation.split('.');
  let node: Record<string, unknown> = buildScalarWhere(rel.filters);
  for (let i = segments.length - 1; i >= 0; i--) {
    node = { [segments[i]]: node };
  }
  return node;
}

function toWhere(query: ResourceQuery): PrismaWhereInput | undefined {
  const parts: Record<string, unknown>[] = [];

  if (query.filters.length > 0) {
    parts.push(buildScalarWhere(query.filters));
  }

  for (const rel of query.relations) {
    parts.push(relationToWhere(rel));
  }

  if (query.search) {
    parts.push(searchToWhere(query.search));
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0] as PrismaWhereInput;
  return { AND: parts as PrismaWhereInput[] };
}

// ── Prisma Adapter ───────────────────────────────────────────────────────

/**
 * Adapter for Prisma ORM.
 * Translates Querio's application-level queries to Prisma-compatible
 * `where`, `orderBy`, and `skip/take` arguments.
 */
export const prismaAdapter = {
  /** Map a parsed query to `{ where, orderBy, skip, take }` for Prisma. */
  map(query: ResourceQuery): {
    where: PrismaWhereInput | undefined;
    orderBy: PrismaOrderByInput[] | undefined;
    skip: number;
    take: number;
  } {
    return QueryMapper.map(query, prismaAdapter);
  },

  buildWhere(query: ResourceQuery): PrismaWhereInput | undefined {
    return toWhere(query);
  },

  buildOrderBy(sort: SortExpression[]): PrismaOrderByInput[] | undefined {
    const orderBy = QueryMapper.toOrderBy(sort);
    return orderBy as PrismaOrderByInput[] | undefined;
  },

  buildSkipTake(page: number, limit: number): { skip: number; take: number } {
    return QueryMapper.toSkipTake(page, limit);
  },
} satisfies MappableAdapter<PrismaWhereInput, PrismaOrderByInput[]>;

export type { PrismaOrderByInput, PrismaWhereInput };
