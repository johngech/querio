import {
  BooleanFieldBuilder,
  DateFieldBuilder,
  EnumFieldBuilder,
  NumberFieldBuilder,
  StringFieldBuilder,
} from '../definition/fields';
import { op } from './operators';

/**
 * Schema-first fluent API for defining query capabilities.
 *
 * Usage:
 * ```ts
 * import { defineQuery, q } from '@queryjs/core';
 *
 * const userQuery = defineQuery({
 *   fields: {
 *     name: q.string().max(100).searchable().sortable(),
 *     age: q.number().min(0).max(150).sortable(),
 *     isActive: q.boolean().sortable(),
 *     createdAt: q.date().sortable(),
 *     role: q.enum(['admin', 'user']).searchable().operators(q.op.equal().in()),
 *   },
 * });
 * ```
 */
export const q = {
  string(): StringFieldBuilder {
    return new StringFieldBuilder();
  },
  number(): NumberFieldBuilder {
    return new NumberFieldBuilder();
  },
  boolean(): BooleanFieldBuilder {
    return new BooleanFieldBuilder();
  },
  date(): DateFieldBuilder {
    return new DateFieldBuilder();
  },
  enum(values: readonly string[]): EnumFieldBuilder {
    return new EnumFieldBuilder(values);
  },
  /** Fluent operator factory — `q.op.equal().contains()` */
  op,
};

export { op };
