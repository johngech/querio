import type { FilterExpression } from './filter';
import type { Pagination } from './pagination';
import type { RelationFilterExpression } from './relation';
import type { SearchQuery } from './search';
import type { SortExpression } from './sort';

/** A raw (un-coerced) query parameter value — a string from the HTTP layer, or a number for programmatic callers. */
export type RawParamValue = number | string | undefined;

/** Raw incoming query params accepted by list endpoints. */
export interface QueryParams {
  page?: RawParamValue;
  limit?: RawParamValue;
  filter?: Record<string, unknown>;
  sort?: Record<string, unknown> | string;
  search?: string;
}

/** A fully parsed, validated application-level query. */
export interface ResourceQuery {
  filters: FilterExpression[];
  relations: RelationFilterExpression[];
  sort: SortExpression[];
  search?: SearchQuery;
  pagination: Pagination;
}
