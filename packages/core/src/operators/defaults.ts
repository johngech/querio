import type { FieldType, FilterOperator } from './types';

/**
 * Default operator sets per field type. Single source of truth — used by the
 * field builders when `.operators()` is not called explicitly.
 */
export const DEFAULT_OPERATORS: Record<FieldType, readonly FilterOperator[]> = {
  string: ['eq', 'neq', 'contains', 'startsWith', 'in', 'notIn', 'isNull', 'isNotNull'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isNull', 'isNotNull'],
  boolean: ['eq', 'isNull', 'isNotNull'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isNull', 'isNotNull'],
  enum: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
};
