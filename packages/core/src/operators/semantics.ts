import type { FilterOperator } from './types';

/** Category of a filter operator — determines how its value is treated. */
export type OperatorCategory = 'value' | 'string' | 'null' | 'array';

/** How a null input value is rendered for an operator (only null-aware ops handle SQL nulls). */
export type NullHandling = 'none' | 'isNull' | 'notNull';

/** Semantic description of a single filter operator. */
export interface OperatorSemantics {
  category: OperatorCategory;
  /** Whether the operator expects a user-supplied value. */
  needsValue: boolean;
  /** How a null/undefined input value is treated. */
  nullHandling: NullHandling;
}

/**
 * Single source of truth for operator semantics.
 *
 * The string operator ids (`FilterOperator`) are the canonical wire format;
 * the fluent `op`/`OpBuilder` API is the user-facing lens over them. This
 * registry describes what each operator means so adapters stop reimplementing
 * null handling, LIKE construction, and value policies independently.
 */
export const OPERATOR_SEMANTICS: Record<FilterOperator, OperatorSemantics> = {
  eq: { category: 'value', needsValue: true, nullHandling: 'isNull' },
  neq: { category: 'value', needsValue: true, nullHandling: 'notNull' },
  gt: { category: 'value', needsValue: true, nullHandling: 'none' },
  gte: { category: 'value', needsValue: true, nullHandling: 'none' },
  lt: { category: 'value', needsValue: true, nullHandling: 'none' },
  lte: { category: 'value', needsValue: true, nullHandling: 'none' },
  contains: { category: 'string', needsValue: true, nullHandling: 'none' },
  startsWith: { category: 'string', needsValue: true, nullHandling: 'none' },
  endsWith: { category: 'string', needsValue: true, nullHandling: 'none' },
  in: { category: 'array', needsValue: true, nullHandling: 'none' },
  notIn: { category: 'array', needsValue: true, nullHandling: 'none' },
  isNull: { category: 'null', needsValue: false, nullHandling: 'isNull' },
  isNotNull: { category: 'null', needsValue: false, nullHandling: 'notNull' },
};

/** True for the substring operators (contains/startsWith/endsWith). */
export function isStringOperator(op: FilterOperator): boolean {
  return OPERATOR_SEMANTICS[op].category === 'string';
}

/** The LIKE match family used by substring operators — aliases the FilterOperator names. */
export type LikeMatch = 'contains' | 'startsWith' | 'endsWith';

/**
 * Escape LIKE wildcards (`%`, `_`, `\`) so user-supplied input is matched
 * literally rather than acting as wildcards.
 */
export function escapeLikeValue(value: unknown): string {
  return String(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/**
 * Build an escaped LIKE pattern for the given match type.
 * When `lowercase` is true the value is lowercased first (used for
 * case-insensitive matching where the column is wrapped in LOWER()).
 */
export function buildLikePattern(value: unknown, match: LikeMatch, lowercase = false): string {
  let escaped = escapeLikeValue(value);
  if (lowercase) escaped = escaped.toLowerCase();
  switch (match) {
    case 'contains':
      return `%${escaped}%`;
    case 'startsWith':
      return `${escaped}%`;
    case 'endsWith':
      return `%${escaped}`;
  }
}

/**
 * Returns the SQL-null rendering for an operator when its input value is
 * null/undefined. Undefined means the operator has no null semantics for
 * ordinary values (e.g. `greaterThan` never renders `IS NULL`).
 */
export function nullClauseFor(op: FilterOperator, value: unknown): NullHandling | undefined {
  if (value !== null && value !== undefined) return undefined;
  const { nullHandling } = OPERATOR_SEMANTICS[op];
  return nullHandling === 'none' ? undefined : nullHandling;
}

/**
 * True when a substring operator was given an empty/blank value — such a
 * match (e.g. `LIKE '%%'`) would return the entire table. Non-string
 * operators are never empty-substring.
 */
export function isEmptySubstringValue(op: FilterOperator, value: unknown): boolean {
  if (!isStringOperator(op)) return false;
  return value === undefined || value === null || String(value).trim().length === 0;
}
