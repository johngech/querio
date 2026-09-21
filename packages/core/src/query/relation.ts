import type { FilterExpression } from './filter';

/**
 * A filter condition scoped to a relation.
 * `relation` is the relation name — a dotted path (e.g. `'org.parent'`) when the
 * filter targets a nested relation.
 */
export interface RelationFilterExpression {
  relation: string;
  filters: FilterExpression[];
}
