/** Framework-independent filter operators. */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
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
