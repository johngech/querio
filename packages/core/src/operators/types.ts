/** Framework-independent filter operators (full names — no short ids). */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull';

/** Supported field types for type-safe value parsing. */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';
