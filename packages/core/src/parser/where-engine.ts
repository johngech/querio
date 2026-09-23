import { DEFAULT_MAX_FILTERS, DEFAULT_MAX_NESTING_DEPTH } from '../definition/limits';
import type {
  FilterFieldSpec,
  FilterOperator,
  RelationSpec,
  ResourceQueryDefinition,
} from '../definition/types';
import { isEmptySubstringValue } from '../operators/semantics';
import type { FieldType } from '../operators/types';
import type { FilterExpression, RelationFilterExpression } from '../query/index';
import { ErrorCode, QuerioError } from '../query/querio-error';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strict numeric wire format: optional sign, decimal, or scientific notation.
 * Rejects hex/octal/binary literals (`0x10`, `0b101`, `0o17`), `Infinity`,
 * `NaN`, and embedded garbage — `Number()` alone would silently coerce them.
 */
const NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Cached `Set` lookups so per-parse filter validation stays fast without
 * mutating the public field specs (which stay plain arrays for consumers).
 */
const operatorSets = new WeakMap<FilterFieldSpec, ReadonlySet<FilterOperator>>();
const enumValueSets = new WeakMap<FilterFieldSpec, ReadonlySet<string>>();

function getOperatorSet(spec: FilterFieldSpec): ReadonlySet<FilterOperator> {
  let set = operatorSets.get(spec);
  if (!set) {
    set = new Set(spec.operators);
    operatorSets.set(spec, set);
  }
  return set;
}

function getEnumValueSet(spec: FilterFieldSpec): ReadonlySet<string> | undefined {
  if (!spec.enumValues) return undefined;
  let set = enumValueSets.get(spec);
  if (!set) {
    set = new Set(spec.enumValues);
    enumValueSets.set(spec, set);
  }
  return set;
}

type TypeParser = (value: string, spec: FilterFieldSpec, field: string) => unknown;

const TYPE_PARSERS: Record<FieldType, TypeParser> = {
  string: (str) => str,
  boolean: (str) => {
    const lower = str.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    throw new QuerioError(
      `Invalid boolean value '${str}' (expected true or false)`,
      ErrorCode.INVALID_BOOLEAN,
    );
  },
  number: (str, _spec, field) => {
    const trimmed = str.trim();
    if (trimmed.length === 0) {
      throw new QuerioError(
        `Invalid number value for field '${field}' (empty value)`,
        ErrorCode.INVALID_NUMBER,
        { field },
      );
    }
    if (!NUMBER_REGEX.test(trimmed)) {
      throw new QuerioError(
        `Invalid number value '${str}' for field '${field}'`,
        ErrorCode.INVALID_NUMBER,
        { field },
      );
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      throw new QuerioError(
        `Invalid number value '${str}' for field '${field}'`,
        ErrorCode.INVALID_NUMBER,
        { field },
      );
    }
    return num;
  },
  date: (str, _spec, field) => {
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) {
      throw new QuerioError(
        `Invalid date value '${str}' for field '${field}' (expected ISO 8601)`,
        ErrorCode.INVALID_DATE,
        { field },
      );
    }
    return date.toISOString();
  },
  enum: (str, spec, field) => {
    const allowed = getEnumValueSet(spec);
    if (allowed && !allowed.has(str)) {
      throw new QuerioError(
        `Invalid enum value '${str}' for field '${field}' (allowed: ${spec.enumValues?.join(', ')})`,
        ErrorCode.INVALID_ENUM_VALUE,
        { field, details: { allowed: spec.enumValues } },
      );
    }
    return str;
  },
};

/**
 * Validates parsed value against field constraints (minLength, maxLength, min, max, isInteger, isEmail, pattern).
 *
 * `partial` marks a substring-match value (`contains`/`startsWith`/`endsWith`). Such values are
 * fragments, not instances of the field's domain, so whole-value constraints (length, email,
 * pattern) must not apply to them. Numeric comparisons still guard the field's range.
 */
function validateConstraints(
  value: unknown,
  fieldSpec: FilterFieldSpec,
  field: string,
  partial = false,
): void {
  if (value === null || value === undefined) return;

  const str = String(value);

  if (fieldSpec.type === 'string' && !partial) {
    if (fieldSpec.minLength !== undefined && str.length < fieldSpec.minLength) {
      throw new QuerioError(
        fieldSpec.minLengthMsg ||
          `Value for field '${field}' must be at least ${fieldSpec.minLength} characters (got ${str.length})`,
        ErrorCode.VALUE_TOO_SHORT,
        {
          field,
          details: { minLength: fieldSpec.minLength, actual: str.length },
        },
      );
    }
    if (fieldSpec.maxLength !== undefined && str.length > fieldSpec.maxLength) {
      throw new QuerioError(
        fieldSpec.maxLengthMsg ||
          `Value for field '${field}' must be at most ${fieldSpec.maxLength} characters (got ${str.length})`,
        ErrorCode.VALUE_TOO_LONG,
        {
          field,
          details: { maxLength: fieldSpec.maxLength, actual: str.length },
        },
      );
    }
    if (fieldSpec.isEmail && !EMAIL_REGEX.test(str)) {
      throw new QuerioError(
        fieldSpec.emailMsg || `Value for field '${field}' must be a valid email address`,
        ErrorCode.VALUE_NOT_EMAIL,
        { field },
      );
    }
    if (fieldSpec.pattern && !fieldSpec.pattern.test(str)) {
      throw new QuerioError(
        fieldSpec.patternMsg || `Value for field '${field}' does not match required pattern`,
        ErrorCode.VALUE_PATTERN_MISMATCH,
        { field, details: { pattern: fieldSpec.pattern.source } },
      );
    }
  }

  if (fieldSpec.type === 'number' && typeof value === 'number') {
    if (fieldSpec.min !== undefined && value < fieldSpec.min) {
      throw new QuerioError(
        fieldSpec.minMsg ||
          `Value for field '${field}' must be at least ${fieldSpec.min} (got ${value})`,
        ErrorCode.VALUE_OUT_OF_RANGE,
        { field, details: { min: fieldSpec.min, actual: value } },
      );
    }
    if (fieldSpec.max !== undefined && value > fieldSpec.max) {
      throw new QuerioError(
        fieldSpec.maxMsg ||
          `Value for field '${field}' must be at most ${fieldSpec.max} (got ${value})`,
        ErrorCode.VALUE_OUT_OF_RANGE,
        { field, details: { max: fieldSpec.max, actual: value } },
      );
    }
    if (fieldSpec.isInteger && !Number.isInteger(value)) {
      throw new QuerioError(
        fieldSpec.integerMsg || `Value for field '${field}' must be an integer (got ${value})`,
        ErrorCode.VALUE_NOT_INTEGER,
        { field, details: { actual: value } },
      );
    }
  }
}

/**
 * Validates raw `filter` input from the query string against a
 * {@link ResourceQueryDefinition} and produces application-level
 * {@link FilterExpression}s. No ORM types leak through this engine.
 *
 * @internal — used by {@link parseQuery}.
 *
 * HTTP format:
 *   ?filter[status]=ACTIVE
 *   ?filter[createdAt][gte]=2026-01-01
 *   ?filter[member][firstName][contains]=abebe
 *   ?filter[status][in]=ACTIVE,PENDING        (comma-separated in/notIn list)
 *   ?filter[org][parent][name]=x              → relation path 'org.parent'
 */
export class QueryWhereEngine {
  static buildFilters(
    raw: Record<string, unknown> | undefined,
    spec: ResourceQueryDefinition,
    maxFilters: number = DEFAULT_MAX_FILTERS,
    maxNestingDepth: number = DEFAULT_MAX_NESTING_DEPTH,
  ): { filters: FilterExpression[]; relations: RelationFilterExpression[] } {
    if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
      return { filters: [], relations: [] };
    }
    const { filters, relations } = QueryWhereEngine.walk(
      raw,
      spec,
      '$root',
      0,
      maxNestingDepth,
      '',
    );
    // `maxFilters` limits the total number of filter conditions, including
    // those nested inside relation filters — otherwise a crafted query with
    // many relation branches could build unbounded condition lists.
    const totalCount = filters.length + relations.reduce((sum, rel) => sum + rel.filters.length, 0);
    if (totalCount > maxFilters) {
      throw new QuerioError(
        `Too many filters (${totalCount} exceeds maximum of ${maxFilters})`,
        ErrorCode.TOO_MANY_FILTERS,
        { details: { count: totalCount, max: maxFilters } },
      );
    }
    return { filters, relations };
  }

  private static walk(
    raw: Record<string, unknown>,
    spec: ResourceQueryDefinition,
    path: string,
    depth: number,
    maxNestingDepth: number,
    relationPath: string,
  ): { filters: FilterExpression[]; relations: RelationFilterExpression[] } {
    if (depth > maxNestingDepth) {
      throw new QuerioError(
        `Maximum relation nesting depth (${maxNestingDepth}) exceeded at '${path}'`,
        ErrorCode.FILTER_DEPTH_EXCEEDED,
        { path },
      );
    }

    const filters: FilterExpression[] = [];
    const relations: RelationFilterExpression[] = [];

    for (const [key, value] of Object.entries(raw)) {
      // Relation? (own-property check only — never resolve via the prototype chain)
      const relationSpecs = spec.relations;
      const relationSpec =
        relationSpecs && Object.hasOwn(relationSpecs, key) ? relationSpecs[key] : undefined;
      if (relationSpec) {
        const nested = QueryWhereEngine.handleRelation(
          key,
          value,
          relationSpec,
          path,
          depth,
          maxNestingDepth,
          relationPath,
        );
        relations.push(...nested.relations);
        if (nested.filters.length > 0) {
          relations.push({
            relation: nested.relationPath,
            filters: nested.filters,
          });
        }
        continue;
      }

      // Scalar field? (own-property check only)
      const fieldSpec = Object.hasOwn(spec.fields, key) ? spec.fields[key] : undefined;
      if (!fieldSpec) {
        throw new QuerioError(`Unknown filter field: '${key}'`, ErrorCode.UNKNOWN_FIELD, {
          field: key,
        });
      }

      // Leaf: primitive value → implicit eq
      if (value === null || typeof value !== 'object') {
        filters.push({
          field: key,
          operator: 'eq',
          value: QueryWhereEngine.parseValue(value, fieldSpec, key),
          caseSensitive: fieldSpec.caseSensitive,
        });
        continue;
      }

      // Leaf: operator map
      filters.push(
        ...QueryWhereEngine.buildOperatorFilters(key, value as Record<string, unknown>, fieldSpec),
      );
    }

    return { filters, relations };
  }

  private static handleRelation(
    key: string,
    value: unknown,
    relationSpec: RelationSpec,
    path: string,
    depth: number,
    maxNestingDepth: number,
    parentRelationPath: string,
  ): {
    filters: FilterExpression[];
    relations: RelationFilterExpression[];
    relationPath: string;
  } {
    if (!value || typeof value !== 'object') {
      throw new QuerioError(
        `Relation '${key}' must be an object (e.g. ?filter[${key}][fieldName]=value)`,
        ErrorCode.RELATION_MUST_BE_OBJECT,
        { field: key },
      );
    }

    const relationPath = parentRelationPath ? `${parentRelationPath}.${key}` : key;
    const nested = QueryWhereEngine.walk(
      value as Record<string, unknown>,
      { fields: relationSpec.fields, relations: relationSpec.relations },
      `${path}.${key}`,
      depth + 1,
      maxNestingDepth,
      relationPath,
    );
    return { ...nested, relationPath };
  }

  private static buildOperatorFilters(
    field: string,
    raw: Record<string, unknown>,
    fieldSpec: FilterFieldSpec,
  ): FilterExpression[] {
    const filters: FilterExpression[] = [];

    for (const [operator, val] of Object.entries(raw)) {
      if (!QueryWhereEngine.isAllowedOperator(operator, fieldSpec)) {
        throw new QuerioError(
          `Operator '${operator}' is not supported for field '${field}' (allowed: ${[...fieldSpec.operators].join(', ')})`,
          ErrorCode.UNSUPPORTED_OPERATOR,
          { field, operator, details: { allowed: [...fieldSpec.operators] } },
        );
      }

      // Array operators — accept an array or a comma-separated list (?filter[x][in]=a,b,c)
      if (operator === 'in' || operator === 'notIn') {
        const values = QueryWhereEngine.toArrayValue(val);
        if (!values || values.length === 0) {
          throw new QuerioError(
            !values
              ? `Filter '${field}[${operator}]' must be an array or a comma-separated list`
              : `Filter '${field}[${operator}]' must contain at least one value`,
            ErrorCode.INVALID_FILTER_VALUE,
            { field, operator },
          );
        }
        filters.push({
          field,
          operator,
          value: values.map((v) => QueryWhereEngine.parseValue(v, fieldSpec, field)),
          caseSensitive: fieldSpec.caseSensitive,
        });
        continue;
      }

      // Null-check operators — the flag must be explicitly true. Rejects
      // isNull=false, which would otherwise silently mean 'not null'; clients
      // should use the explicit 'isNotNull' operator for that.
      if (operator === 'isNull' || operator === 'isNotNull') {
        const flag = typeof val === 'boolean' ? val : String(val) === 'true';
        if (flag !== true) {
          throw new QuerioError(
            `Filter '${field}[${operator}]' expects the value 'true'` +
              (operator === 'isNull' ? " (use 'isNotNull' for not-null checks)" : ''),
            ErrorCode.INVALID_FILTER_VALUE,
            { field, operator },
          );
        }
        filters.push({
          field,
          operator,
          caseSensitive: fieldSpec.caseSensitive,
        });
        continue;
      }

      // Scalar operators — substring operators match fragments, so whole-value
      // constraints (minLength, email, pattern) must not apply to them. But an
      // empty substring value would match every row (LIKE '%%'), so reject it.
      const partial =
        operator === 'contains' || operator === 'startsWith' || operator === 'endsWith';
      const parsed = QueryWhereEngine.parseValue(val, fieldSpec, field, partial);
      if (isEmptySubstringValue(operator as FilterOperator, parsed)) {
        throw new QuerioError(
          `Filter '${field}[${operator}]' must not be empty`,
          ErrorCode.INVALID_FILTER_VALUE,
          { field, operator },
        );
      }
      filters.push({
        field,
        operator: operator as FilterOperator,
        value: parsed,
        caseSensitive: fieldSpec.caseSensitive,
      });
    }

    return filters;
  }

  /**
   * Normalize an `in`/`notIn` value: an array passes through, a comma-separated
   * string is split (segments trimmed, empty segments dropped), anything else
   * is rejected.
   */
  private static toArrayValue(val: unknown): unknown[] | undefined {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      return val
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    }
    return undefined;
  }

  private static isAllowedOperator(op: string, fieldSpec: FilterFieldSpec): boolean {
    return getOperatorSet(fieldSpec).has(op as FilterOperator);
  }

  /**
   * Parse a raw query-string value into the appropriate JS type based on
   * the field definition. Rejects values that cannot be coerced.
   */
  private static parseValue(
    raw: unknown,
    fieldSpec: FilterFieldSpec,
    field: string,
    partial = false,
  ): unknown {
    if (raw === null || raw === undefined) return null;

    const str = String(raw);
    const parsed = TYPE_PARSERS[fieldSpec.type](str, fieldSpec, field);
    validateConstraints(parsed, fieldSpec, field, partial);
    return parsed;
  }
}
