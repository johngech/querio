import { resolveLimits } from '../definition/limits';
import type { ResourceQueryDefinition } from '../definition/types';
import type { QueryParams, RawParamValue, ResourceQuery } from '../query';
import { QueryOrderEngine } from './order-engine';
import { QuerySearchEngine } from './search-engine';
import { QueryWhereEngine } from './where-engine';

/**
 * Parses raw HTTP query parameters into a validated, application-level
 * {@link ResourceQuery} against a resource definition built with
 * `defineQuery` (or a raw {@link ResourceQueryDefinition}).
 *
 * ```ts
 * import { defineQuery, parseQuery } from '@querio/core';
 *
 * const query = parseQuery(params, usersQuery);
 * ```
 */
export function parseQuery(raw: QueryParams, spec: ResourceQueryDefinition): ResourceQuery {
  const limits = resolveLimits(spec.limits);
  const { filters, relations } = QueryWhereEngine.buildFilters(
    raw.filter,
    spec,
    limits.maxFilters,
    limits.maxNestingDepth,
  );
  const sort = QueryOrderEngine.buildSort(raw.sort, spec);
  const search = QuerySearchEngine.buildSearch(raw.search, spec, limits.search);
  const pagination = parsePagination(raw.page, raw.limit, limits);

  return { filters, relations, sort, search, pagination };
}

function parsePagination(
  page: RawParamValue,
  limit: RawParamValue,
  limits: ReturnType<typeof resolveLimits>,
): { page: number; limit: number } {
  const coerceInt = (value: RawParamValue, fallback: number): number => {
    const n = typeof value === 'string' ? Number(value) : (value ?? Number.NaN);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  };

  return {
    page: Math.min(limits.maxPage, Math.max(1, coerceInt(page, 1))),
    limit: Math.min(limits.maxLimit, Math.max(1, coerceInt(limit, limits.defaultLimit))),
  };
}
