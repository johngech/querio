/**
 * Querio public API.
 *
 * The intended surface is deliberately tiny:
 *   q, defineQuery, defineRelation, ResourceQuery, adapters
 *
 * The query-model types (FilterExpression, SortExpression, ...) are the
 * building blocks of {@link ResourceQuery} and are exported so adapter
 * authors and controllers can type their code. Everything else (parsers,
 * engines, builders, mappers) is internal.
 */

export type { MappedQuery, QueryMapperAdapter } from "./compiler/compiler";
export { mapQuery } from "./compiler/compiler";
export type { QueryDefinition } from "./definition/builders";
export { defineQuery, defineRelation } from "./definition/builders";
export type { ResourceQueryLimits } from "./definition/limits";
export { q } from "./operators/q";
export type {
  LikeMatch,
  NullHandling,
  OperatorCategory,
  OperatorSemantics,
} from "./operators/semantics";
export {
  buildLikePattern,
  escapeLikeValue,
  isEmptySubstringValue,
  isStringOperator,
  nullClauseFor,
  OPERATOR_SEMANTICS,
} from "./operators/semantics";
export type { FieldType, FilterOperator } from "./operators/types";
export type {
  FilterExpression,
  Pagination,
  QueryParams,
  RawParamValue,
  RelationFilterExpression,
  ResourceQuery,
  SearchLimits,
  SearchMatch,
  SearchQuery,
  SearchTerm,
  SortDirection,
  SortExpression,
} from "./query/index";
export { ErrorCode, QuerioError } from "./query/querio-error";
