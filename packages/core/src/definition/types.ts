import type { FieldType, FilterOperator } from '../operators/types';
import type { ResourceQueryLimits } from './limits';

/** Definition of a single filterable/sortable/searchable field. */
export interface FilterFieldSpec {
  type: FieldType;
  operators: readonly FilterOperator[];
  sortable?: boolean;
  searchable?: boolean;
  nullable?: boolean;
  enumValues?: readonly string[];
  /** If true, contains/startsWith/endsWith/search matches are case-sensitive. Defaults to false (insensitive). */
  caseSensitive?: boolean;
  // Value constraints (set by field builders)
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  isInteger?: boolean;
  isEmail?: boolean;
  pattern?: RegExp;
  // Custom error messages
  minLengthMsg?: string;
  maxLengthMsg?: string;
  minMsg?: string;
  maxMsg?: string;
  integerMsg?: string;
  emailMsg?: string;
  patternMsg?: string;
}

// Re-export operator and field types for convenience
export type { FieldType, FilterOperator };

/** Relation definition with nested field specs. */
export interface RelationSpec {
  fields: Record<string, FilterFieldSpec>;
  relations?: Record<string, RelationSpec>;
}

/** Full query specification for a resource. */
export interface ResourceQueryDefinition {
  fields: Record<string, FilterFieldSpec>;
  relations?: Record<string, RelationSpec>;
  limits?: ResourceQueryLimits;
}
