import type { FilterOperator } from '../operators/types';

/** A single filter condition on a field. */
export interface FilterExpression {
  field: string;
  operator: FilterOperator;
  value?: unknown;
  /** Resolved from the field spec at parse time — true = case-sensitive matching. */
  caseSensitive?: boolean;
}
