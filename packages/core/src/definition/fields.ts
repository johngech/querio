import { DEFAULT_OPERATORS } from '../operators/defaults';
import { OpBuilder } from '../operators/operators';
import type { FieldType, FilterFieldSpec, FilterOperator } from './types';

// ── Base field builder ────────────────────────────────────────────────────────

/**
 * Abstract base for all field builders.
 *
 * Three distinct responsibilities (architecture §4):
 * 1. Value Constraints — `.min()`, `.max()`, `.pattern()`, `.email()`
 * 2. Query Capabilities — `.searchable()`, `.sortable()`
 * 3. Allowed Operators — `.operators(q.op.equal()...)`
 */
abstract class FieldBuilder {
  protected _type: FieldType;
  protected _operators: readonly FilterOperator[];
  protected _sortable = false;
  protected _searchable = false;
  protected _nullable = false;
  protected _caseSensitive = false;

  constructor(type: FieldType, defaultOps: readonly FilterOperator[] = DEFAULT_OPERATORS[type]) {
    this._type = type;
    this._operators = defaultOps;
  }

  /** Allow this field to be sorted. */
  sortable(): this {
    this._sortable = true;
    return this;
  }

  /** Allow this field to be searched (global or field-specific). */
  searchable(): this {
    this._searchable = true;
    return this;
  }

  /**
   * Allow null values for this field.
   *
   * Note: null *matching* (equality against null, `isNull`/`isNotNull`) is always
   * available via the field's allowed operators. This flag is recorded on the
   * field spec as field metadata; it does not currently restrict filter values.
   */
  nullable(): this {
    this._nullable = true;
    return this;
  }

  /** Enable case-sensitive contains/startsWith/endsWith/search matching. */
  caseSensitive(): this {
    this._caseSensitive = true;
    return this;
  }

  /**
   * Explicitly set the allowed operators for this field.
   * Accepts an `OpBuilder` directly (e.g. `op.equal().notIn()`) or a raw array.
   */
  operators(ops: readonly FilterOperator[] | OpBuilder): this {
    // Copy on entry so later mutation of the caller's array can't change the
    // built definition (and stale cached operator sets in the where engine).
    this._operators = ops instanceof OpBuilder ? ops.done() : [...ops];
    return this;
  }

  /** Resolve this builder into a flat field specification. */
  build(): FilterFieldSpec {
    return {
      type: this._type,
      operators: [...this._operators],
      sortable: this._sortable,
      searchable: this._searchable,
      nullable: this._nullable,
      caseSensitive: this._caseSensitive,
    };
  }
}

// ── String field builder ──────────────────────────────────────────────────────

class StringFieldBuilder extends FieldBuilder {
  private _minLength?: number;
  private _maxLength?: number;
  private _pattern?: RegExp;
  private _isEmail = false;
  private _minLengthMsg?: string;
  private _maxLengthMsg?: string;
  private _patternMsg?: string;
  private _emailMsg?: string;

  constructor() {
    super('string');
  }

  /** Minimum string length constraint. */
  min(len: number, msg?: string): this {
    this._minLength = len;
    this._minLengthMsg = msg;
    return this;
  }

  /** Maximum string length constraint. */
  max(len: number, msg?: string): this {
    this._maxLength = len;
    this._maxLengthMsg = msg;
    return this;
  }

  /** Require a valid email format. */
  email(msg?: string): this {
    this._isEmail = true;
    this._emailMsg = msg;
    return this;
  }

  /** Require the value to match a regex pattern. */
  pattern(re: RegExp, msg?: string): this {
    this._pattern = re;
    this._patternMsg = msg;
    return this;
  }

  override build(): FilterFieldSpec {
    const spec = super.build();
    return {
      ...spec,
      minLength: this._minLength,
      maxLength: this._maxLength,
      pattern: this._pattern,
      isEmail: this._isEmail,
      minLengthMsg: this._minLengthMsg,
      maxLengthMsg: this._maxLengthMsg,
      patternMsg: this._patternMsg,
      emailMsg: this._emailMsg,
    };
  }
}

// ── Number field builder ──────────────────────────────────────────────────────

class NumberFieldBuilder extends FieldBuilder {
  private _min?: number;
  private _max?: number;
  private _isInteger = false;
  private _minMsg?: string;
  private _maxMsg?: string;
  private _integerMsg?: string;

  constructor() {
    super('number');
  }

  /** Minimum numeric value constraint. */
  min(val: number, msg?: string): this {
    this._min = val;
    this._minMsg = msg;
    return this;
  }

  /** Maximum numeric value constraint. */
  max(val: number, msg?: string): this {
    this._max = val;
    this._maxMsg = msg;
    return this;
  }

  /** Require an integer value. */
  integer(msg?: string): this {
    this._isInteger = true;
    this._integerMsg = msg;
    return this;
  }

  override build(): FilterFieldSpec {
    const spec = super.build();
    return {
      ...spec,
      min: this._min,
      max: this._max,
      isInteger: this._isInteger,
      minMsg: this._minMsg,
      maxMsg: this._maxMsg,
      integerMsg: this._integerMsg,
    };
  }
}

// ── Boolean field builder ─────────────────────────────────────────────────────

class BooleanFieldBuilder extends FieldBuilder {
  constructor() {
    super('boolean');
  }
}

// ── Date field builder ────────────────────────────────────────────────────────

class DateFieldBuilder extends FieldBuilder {
  constructor() {
    super('date');
  }
}

// ── Enum field builder ────────────────────────────────────────────────────────

class EnumFieldBuilder extends FieldBuilder {
  private _values: readonly string[];

  constructor(values: readonly string[]) {
    super('enum');
    this._values = values;
  }

  override build(): FilterFieldSpec {
    const spec = super.build();
    return {
      ...spec,
      enumValues: [...this._values],
    };
  }
}

export {
  BooleanFieldBuilder,
  DateFieldBuilder,
  EnumFieldBuilder,
  FieldBuilder,
  NumberFieldBuilder,
  StringFieldBuilder,
};
