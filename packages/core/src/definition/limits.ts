import { DEFAULT_SEARCH_LIMITS, type SearchLimits } from '../query/search';

/** Default ceiling for any requested page number. */
export const DEFAULT_MAX_PAGE = 1_000_000;
/** Default ceiling for the `limit` parameter. */
export const DEFAULT_MAX_LIMIT = 100;
/** Default `limit` applied when the caller omits it. */
export const DEFAULT_LIMIT = 10;
/** Default maximum number of scalar filters per query. */
export const DEFAULT_MAX_FILTERS = 100;
/** Default maximum relation nesting depth. */
export const DEFAULT_MAX_NESTING_DEPTH = 2;

/** Per-query limits, all optional. Any omitted limit falls back to a default. */
export interface ResourceQueryLimits {
  /** Maximum page number accepted by pagination. Defaults to 1_000_000. */
  maxPage?: number;
  /** Maximum `limit` accepted. Defaults to 100. */
  maxLimit?: number;
  /** Default `limit` used when the caller omits it. Defaults to 10. */
  defaultLimit?: number;
  /** Maximum number of scalar filters in a single query. Defaults to 100. */
  maxFilters?: number;
  /** Maximum relation nesting depth. Defaults to 2. */
  maxNestingDepth?: number;
  /** Search parsing limits. Defaults to {@link DEFAULT_SEARCH_LIMITS}. */
  search?: Partial<SearchLimits>;
}

/** Fully resolved limits with defaults applied, used internally by the parser. */
export interface ResolvedQueryLimits {
  maxPage: number;
  maxLimit: number;
  defaultLimit: number;
  maxFilters: number;
  maxNestingDepth: number;
  search: SearchLimits;
}

function buildResolvedLimits(limits: ResourceQueryLimits): ResolvedQueryLimits {
  const resolved: ResolvedQueryLimits = {
    maxPage: limits.maxPage ?? DEFAULT_MAX_PAGE,
    maxLimit: limits.maxLimit ?? DEFAULT_MAX_LIMIT,
    defaultLimit: limits.defaultLimit ?? DEFAULT_LIMIT,
    maxFilters: limits.maxFilters ?? DEFAULT_MAX_FILTERS,
    maxNestingDepth: limits.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH,
    search: { ...DEFAULT_SEARCH_LIMITS, ...limits.search },
  };
  // Frozen so the shared cached instance (see resolveLimits) cannot be mutated
  // by one caller and change parsing behavior for everyone else.
  Object.freeze(resolved.search);
  return Object.freeze(resolved);
}

/** Shared resolved limits used when the caller supplies no per-query limits. */
const DEFAULT_RESOLVED_LIMITS: ResolvedQueryLimits = Object.freeze(buildResolvedLimits({}));

/** Caches resolved limits per definition so an identical limits object is resolved once. */
const limitsCache = new WeakMap<ResourceQueryLimits, ResolvedQueryLimits>();

/**
 * Merge user-provided limits with the library defaults.
 *
 * The resolved object is frozen and cached per `limits` identity. Defaults cap
 * a single query at `DEFAULT_MAX_PAGE` pages of `DEFAULT_MAX_LIMIT` rows
 * (skip up to ~10^8) and `DEFAULT_MAX_FILTERS` scalar filters — tune these if
 * the parsed queries come from untrusted clients, or the downstream DB query
 * (huge offset, many OR conditions) can degrade. Equivalent limits objects
 * share one frozen instance, so callers must never mutate the result.
 */
export function resolveLimits(limits?: ResourceQueryLimits): ResolvedQueryLimits {
  if (!limits) return DEFAULT_RESOLVED_LIMITS;
  let resolved = limitsCache.get(limits);
  if (!resolved) {
    resolved = buildResolvedLimits(limits);
    limitsCache.set(limits, resolved);
  }
  return resolved;
}
