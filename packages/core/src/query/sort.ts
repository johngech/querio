/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** A single sort expression. */
export interface SortExpression {
  field: string;
  direction: SortDirection;
}
