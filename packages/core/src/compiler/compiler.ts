import type { ResourceQuery, SortExpression } from '../query';

// ── Adapter interface ──────────────────────────────────────────────────────

/**
 * Interface for ORM-specific query mapping adapters.
 * Implement this to translate Querio's application-level query objects
 * into your ORM's expected format.
 */
export interface QueryMapperAdapter<TWhere = unknown, TOrderBy = unknown> {
  /** Build a WHERE clause from application filter expressions. */
  buildWhere(query: ResourceQuery): TWhere | undefined;
  /** Build an ORDER BY clause from application sort expressions. */
  buildOrderBy(sort: SortExpression[]): TOrderBy | undefined;
  /** Convert page/limit to skip/take (or offset/limit for other ORMs). */
  buildSkipTake(page: number, limit: number): { skip: number; take: number };
}

/** Result of mapping a {@link ResourceQuery} through an adapter. */
export interface MappedQuery<TWhere = unknown, TOrderBy = unknown> {
  where: TWhere | undefined;
  orderBy: TOrderBy | undefined;
  skip: number;
  take: number;
}

/** An adapter that also exposes the ergonomic `map(query)` entry point. */
export type MappableAdapter<TWhere = unknown, TOrderBy = unknown> = QueryMapperAdapter<
  TWhere,
  TOrderBy
> & {
  map(query: ResourceQuery): MappedQuery<TWhere, TOrderBy>;
};

/**
 * Map a parsed query to ORM-native clauses via an adapter.
 *
 * This is the canonical mapper. {@link QueryMapper.map} and each adapter's
 * `map(query)` are thin conveniences that delegate here, so the behavior is
 * identical no matter which entry point you use.
 */
export function mapQuery<TWhere, TOrderBy>(
  query: ResourceQuery,
  adapter: QueryMapperAdapter<TWhere, TOrderBy>,
): MappedQuery<TWhere, TOrderBy> {
  const { skip, take } = adapter.buildSkipTake(query.pagination.page, query.pagination.limit);
  return {
    where: adapter.buildWhere(query),
    orderBy: adapter.buildOrderBy(query.sort),
    skip,
    take,
  };
}

/**
 * Static convenience facade over {@link mapQuery}.
 *
 * `QueryMapper.map` is equivalent to `mapQuery(query, adapter)`; the static
 * helpers (`toOrderBy`, `toSkipTake`) are shared utilities used by the
 * built-in adapters. Prefer taking adapters (which expose `.map()`) for new code.
 */
export class QueryMapper {
  /**
   * Map a ResourceQuery to ORM-specific using the provided adapter.
   */
  static map<TWhere, TOrderBy>(
    query: ResourceQuery,
    adapter: QueryMapperAdapter<TWhere, TOrderBy>,
  ): MappedQuery<TWhere, TOrderBy> {
    return mapQuery(query, adapter);
  }

  /** Build an `orderBy` array from application sort expressions. */
  static toOrderBy(sort: SortExpression[]): Record<string, string>[] | undefined {
    if (sort.length === 0) return undefined;
    return sort.map((s) => ({ [s.field]: s.direction }));
  }

  /** Convert page/limit to skip/take. */
  static toSkipTake(page: number, limit: number): { skip: number; take: number } {
    return { skip: (page - 1) * limit, take: limit };
  }
}
