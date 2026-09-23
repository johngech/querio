import { describe, expect, it } from 'bun:test';
import { defineQuery } from '../../packages/core/src/definition/index';
import { op, q } from '../../packages/core/src/operators/q';

describe('StringFieldBuilder', () => {
  it('should build a string field with default operators', () => {
    const spec = q.string().build();
    expect(spec.type).toBe('string');
    expect(spec.operators).toEqual([
      'eq',
      'neq',
      'contains',
      'startsWith',
      'in',
      'notIn',
      'isNull',
      'isNotNull',
    ]);
  });

  const booleanProps: [string, (s: ReturnType<typeof q.string>) => ReturnType<typeof q.string>][] =
    [
      ['sortable', (s) => s.sortable()],
      ['searchable', (s) => s.searchable()],
      ['nullable', (s) => s.nullable()],
      ['caseSensitive', (s) => s.caseSensitive()],
    ];

  for (const [prop, builder] of booleanProps) {
    it(`should set ${prop}`, () => {
      const spec = builder(q.string()).build();
      expect(spec).toHaveProperty(prop, true);
    });
  }

  const constraintTests: [string, () => ReturnType<typeof q.string>, string, number][] = [
    ['min length', () => q.string().min(3), 'minLength', 3],
    ['max length', () => q.string().max(100), 'maxLength', 100],
  ];

  for (const [label, builder, key, value] of constraintTests) {
    it(`should set ${label}`, () => {
      const spec = builder().build();
      expect(spec).toHaveProperty(key, value);
    });
  }

  it('should set pattern', () => {
    const pattern = /^[a-z]+$/;
    const spec = q.string().pattern(pattern).build();
    expect(spec.pattern).toBe(pattern);
  });

  it('should set email', () => {
    const spec = q.string().email().build();
    expect(spec.isEmail).toBe(true);
  });

  it('should set custom operators via OpBuilder (no .done() needed)', () => {
    const spec = q.string().operators(op.equal().notEqual().contains()).build();
    expect(spec.operators).toEqual(['eq', 'neq', 'contains']);
  });

  it('should chain q.string().min().max().searchable().sortable().caseSensitive().operators()', () => {
    const spec = q
      .string()
      .min(1)
      .max(200)
      .searchable()
      .sortable()
      .caseSensitive()
      .operators(op.contains().startsWith().endsWith())
      .build();

    expect(spec.type).toBe('string');
    expect(spec.minLength).toBe(1);
    expect(spec.maxLength).toBe(200);
    expect(spec.searchable).toBe(true);
    expect(spec.sortable).toBe(true);
    expect(spec.caseSensitive).toBe(true);
    expect(spec.operators).toEqual(['contains', 'startsWith', 'endsWith']);
  });

  it('should chain q.number().min().max().integer().sortable().operators()', () => {
    const spec = q
      .number()
      .min(0)
      .max(100)
      .integer()
      .sortable()
      .operators(op.equal().greaterThan().lessThanOrEqual())
      .build();

    expect(spec.type).toBe('number');
    expect(spec.min).toBe(0);
    expect(spec.max).toBe(100);
    expect(spec.isInteger).toBe(true);
    expect(spec.sortable).toBe(true);
    expect(spec.operators).toEqual(['eq', 'gt', 'lte']);
  });

  it('should chain q.enum().searchable().sortable().operators()', () => {
    const spec = q
      .enum(['ADMIN', 'USER', 'GUEST'])
      .searchable()
      .sortable()
      .operators(op.equal().in())
      .build();

    expect(spec.type).toBe('enum');
    expect(spec.enumValues).toEqual(['ADMIN', 'USER', 'GUEST']);
    expect(spec.searchable).toBe(true);
    expect(spec.sortable).toBe(true);
    expect(spec.operators).toEqual(['eq', 'in']);
  });

  it('should chain multiple constraints', () => {
    const spec = q.string().min(1).max(100).searchable().sortable().build();
    expect(spec.minLength).toBe(1);
    expect(spec.maxLength).toBe(100);
    expect(spec.searchable).toBe(true);
    expect(spec.sortable).toBe(true);
  });
});

describe('NumberFieldBuilder', () => {
  it('should build a number field with default operators', () => {
    const spec = q.number().build();
    expect(spec.type).toBe('number');
    expect(spec.operators).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isNull', 'isNotNull']);
  });

  const numberProps: [string, () => ReturnType<typeof q.number>, string, number][] = [
    ['min value', () => q.number().min(0), 'min', 0],
    ['max value', () => q.number().max(150), 'max', 150],
  ];

  for (const [label, builder, key, value] of numberProps) {
    it(`should set ${label}`, () => {
      const spec = builder().build();
      expect(spec).toHaveProperty(key, value);
    });
  }

  it('should set integer', () => {
    const spec = q.number().integer().build();
    expect(spec.isInteger).toBe(true);
  });

  it('should set sortable', () => {
    const spec = q.number().sortable().build();
    expect(spec.sortable).toBe(true);
  });
});

describe('BooleanFieldBuilder', () => {
  it('should build a boolean field with equal operator', () => {
    const spec = q.boolean().build();
    expect(spec.type).toBe('boolean');
    expect(spec.operators).toEqual(['eq', 'isNull', 'isNotNull']);
  });

  it('should set sortable', () => {
    const spec = q.boolean().sortable().build();
    expect(spec.sortable).toBe(true);
  });
});

describe('DateFieldBuilder', () => {
  it('should build a date field with default operators', () => {
    const spec = q.date().build();
    expect(spec.type).toBe('date');
    expect(spec.operators).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isNull', 'isNotNull']);
  });

  it('should set sortable', () => {
    const spec = q.date().sortable().build();
    expect(spec.sortable).toBe(true);
  });
});

describe('EnumFieldBuilder', () => {
  it('should build an enum field with default operators', () => {
    const spec = q.enum(['ACTIVE', 'INACTIVE']).build();
    expect(spec.type).toBe('enum');
    expect(spec.enumValues).toEqual(['ACTIVE', 'INACTIVE']);
    expect(spec.operators).toEqual(['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull']);
  });

  it('should set searchable', () => {
    const spec = q.enum(['ACTIVE', 'INACTIVE']).searchable().build();
    expect(spec.searchable).toBe(true);
  });
});

describe('defineQuery', () => {
  it('should auto-build field builders (no .build() needed by users)', () => {
    const query = defineQuery({
      fields: {
        name: q.string().max(100).searchable().sortable(),
        age: q.number().min(0).max(150).sortable(),
        isActive: q.boolean().sortable(),
        createdAt: q.date().sortable(),
        role: q.enum(['admin', 'user']).searchable(),
      },
    });

    expect(query.fields.name).toBeDefined();
    expect(query.fields.name.type).toBe('string');
    expect(query.fields.name.maxLength).toBe(100);
    expect(query.fields.name.searchable).toBe(true);
    expect(query.fields.name.sortable).toBe(true);

    expect(query.fields.age).toBeDefined();
    expect(query.fields.age.type).toBe('number');
    expect(query.fields.age.min).toBe(0);
    expect(query.fields.age.max).toBe(150);

    expect(query.fields.isActive).toBeDefined();
    expect(query.fields.isActive.type).toBe('boolean');

    expect(query.fields.createdAt).toBeDefined();
    expect(query.fields.createdAt.type).toBe('date');

    expect(query.fields.role).toBeDefined();
    expect(query.fields.role.type).toBe('enum');
    expect(query.fields.role.enumValues).toEqual(['admin', 'user']);
  });

  it('should accept raw FilterFieldSpec objects', () => {
    const query = defineQuery({
      fields: {
        name: {
          type: 'string',
          operators: ['eq', 'neq'],
        },
      },
    });

    expect(query.fields.name.type).toBe('string');
    expect(query.fields.name.operators).toEqual(['eq', 'neq']);
  });

  it('should preserve a field literally named __proto__', () => {
    // A computed key is required — `__proto__: value` in an object literal is
    // prototype-setter syntax and would never become an own property.
    const query = defineQuery({
      fields: { ['__proto__']: q.string(), name: q.string() },
      relations: {
        meta: {
          fields: { ['__proto__']: q.string() },
        },
      },
    });

    expect(Object.hasOwn(query.fields, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(query.fields, '__proto__')?.value.type).toBe('string');
    expect(
      Object.getOwnPropertyDescriptor(query.relations!.meta.fields, '__proto__')?.value.type,
    ).toBe('string');

    // JSON.parse produces a genuine own `__proto__` key.
    const filter = JSON.parse('{"__proto__": "x", "name": "y"}') as Record<string, unknown>;
    const parsed = query.parse({ filter });
    expect(parsed.filters.map((f) => f.field).sort()).toEqual(['__proto__', 'name']);

    const relationFilter = JSON.parse('{"meta": {"__proto__": "t"}}') as Record<string, unknown>;
    const parsedRelation = query.parse({ filter: relationFilter });
    expect(parsedRelation.relations[0].filters[0].field).toBe('__proto__');
  });
});
