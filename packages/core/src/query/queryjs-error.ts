/**
 * Structured error codes for QueryJS, organized by category.
 */
export enum ErrorCode {
  // Filter
  UNKNOWN_FIELD = 'UNKNOWN_FIELD',
  UNSUPPORTED_OPERATOR = 'UNSUPPORTED_OPERATOR',
  INVALID_FILTER_VALUE = 'INVALID_FILTER_VALUE',
  FILTER_DEPTH_EXCEEDED = 'FILTER_DEPTH_EXCEEDED',
  RELATION_MUST_BE_OBJECT = 'RELATION_MUST_BE_OBJECT',

  // Sort
  NON_SORTABLE_FIELD = 'NON_SORTABLE_FIELD',
  INVALID_SORT_DIRECTION = 'INVALID_SORT_DIRECTION',
  EMPTY_SORT_FIELD = 'EMPTY_SORT_FIELD',

  // Search
  NO_SEARCHABLE_FIELDS = 'NO_SEARCHABLE_FIELDS',
  SEARCH_TOO_LONG = 'SEARCH_TOO_LONG',
  TOO_MANY_SEARCH_TERMS = 'TOO_MANY_SEARCH_TERMS',
  SEARCH_TERM_TOO_LONG = 'SEARCH_TERM_TOO_LONG',
  NON_SEARCHABLE_FIELD = 'NON_SEARCHABLE_FIELD',
  UNKNOWN_SEARCH_FIELD = 'UNKNOWN_SEARCH_FIELD',
  EMPTY_SEARCH_VALUE = 'EMPTY_SEARCH_VALUE',
  EMPTY_SEARCH_QUERY = 'EMPTY_SEARCH_QUERY',
  UNTERMINATED_PHRASE = 'UNTERMINATED_PHRASE',

  // Value
  INVALID_BOOLEAN = 'INVALID_BOOLEAN',
  INVALID_NUMBER = 'INVALID_NUMBER',
  INVALID_DATE = 'INVALID_DATE',
  INVALID_ENUM_VALUE = 'INVALID_ENUM_VALUE',

  // Value constraints
  VALUE_TOO_SHORT = 'VALUE_TOO_SHORT',
  VALUE_TOO_LONG = 'VALUE_TOO_LONG',
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  VALUE_NOT_INTEGER = 'VALUE_NOT_INTEGER',
  VALUE_NOT_EMAIL = 'VALUE_NOT_EMAIL',
  VALUE_PATTERN_MISMATCH = 'VALUE_PATTERN_MISMATCH',
  TOO_MANY_FILTERS = 'TOO_MANY_FILTERS',
}

/**
 * Structured, developer-friendly error for QueryJS query parsing and validation.
 *
 * Contains a machine-readable error code, optional field/operator/path context,
 * and an HTTP-compatible status code.
 */
export class QueryJSError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly operator?: string;
  readonly path?: string;
  readonly details?: Record<string, unknown>;

  get statusCode(): number {
    return 400;
  }

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      field?: string;
      operator?: string;
      path?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'QueryJSError';
    this.code = code;
    this.field = options?.field;
    this.operator = options?.operator;
    this.path = options?.path;
    this.details = options?.details;
  }
}

/** @deprecated Use QueryJSError. Will be removed in a future minor release. */
export const QuerioError = QueryJSError;
export type QuerioError = QueryJSError;
