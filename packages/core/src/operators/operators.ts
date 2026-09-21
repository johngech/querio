import type { FilterOperator } from './types';

/**
 * Fluent builder for composing filter operators.
 *
 * Usage:
 * ```ts
 * // Use directly with field builders — no .done() needed
 * q.string().operators(op.equal().notEqual().contains())
 *
 * // Or call .done() to get the raw array
 * op.equal().notEqual().contains().done() // → ['eq', 'neq', 'contains']
 * ```
 */
export class OpBuilder {
  private _ops: FilterOperator[];

  constructor(start: readonly FilterOperator[]) {
    this._ops = [...start];
  }

  equal(): this {
    this._ops.push('eq');
    return this;
  }

  notEqual(): this {
    this._ops.push('neq');
    return this;
  }

  greaterThan(): this {
    this._ops.push('gt');
    return this;
  }

  greaterThanOrEqual(): this {
    this._ops.push('gte');
    return this;
  }

  lessThan(): this {
    this._ops.push('lt');
    return this;
  }

  lessThanOrEqual(): this {
    this._ops.push('lte');
    return this;
  }

  contains(): this {
    this._ops.push('contains');
    return this;
  }

  startsWith(): this {
    this._ops.push('startsWith');
    return this;
  }

  endsWith(): this {
    this._ops.push('endsWith');
    return this;
  }

  in(): this {
    this._ops.push('in');
    return this;
  }

  notIn(): this {
    this._ops.push('nin');
    return this;
  }

  isNull(): this {
    this._ops.push('isNull');
    return this;
  }

  isNotNull(): this {
    this._ops.push('isNotNull');
    return this;
  }

  /** @internal — resolve the composed operator list. */
  done(): readonly FilterOperator[] {
    return [...this._ops];
  }
}

/** Fluent operator namespace for composing allowed operators. */
export const op = {
  equal: () => new OpBuilder(['eq']),
  notEqual: () => new OpBuilder(['neq']),
  greaterThan: () => new OpBuilder(['gt']),
  greaterThanOrEqual: () => new OpBuilder(['gte']),
  lessThan: () => new OpBuilder(['lt']),
  lessThanOrEqual: () => new OpBuilder(['lte']),
  contains: () => new OpBuilder(['contains']),
  startsWith: () => new OpBuilder(['startsWith']),
  endsWith: () => new OpBuilder(['endsWith']),
  in: () => new OpBuilder(['in']),
  notIn: () => new OpBuilder(['nin']),
  isNull: () => new OpBuilder(['isNull']),
  isNotNull: () => new OpBuilder(['isNotNull']),
};
