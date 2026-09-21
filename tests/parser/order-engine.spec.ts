import { describe, expect, it } from 'bun:test';
import { defineQuery, q, type SortExpression } from '../../packages/core/src/index';
import { QueryOrderEngine } from '../../packages/core/src/parser/order-engine';

describe('QueryOrderEngine', () => {
  const TEST_SPEC = defineQuery({
    fields: {
      firstName: q.string().sortable(),
      lastName: q.string().sortable(),
      email: q.string().sortable(),
      age: q.number().sortable(),
      createdAt: q.date().sortable(),
      passwordHash: q.string(),
    },
  });

  describe('empty input', () => {
    const emptyCases: [string, unknown][] = [
      ['undefined', undefined],
      ['null', null],
      ['empty object', {}],
    ];

    for (const [label, input] of emptyCases) {
      it(`returns empty array for ${label}`, () => {
        expect(QueryOrderEngine.buildSort(input as never, TEST_SPEC)).toEqual([]);
      });
    }
  });

  describe('comma-separated format', () => {
    const commaCases: [string, string, SortExpression[]][] = [
      ['single field', 'firstName', [{ field: 'firstName', direction: 'asc' }]],
      ['descending field with -', '-createdAt', [{ field: 'createdAt', direction: 'desc' }]],
      [
        'multiple fields',
        '-createdAt,firstName',
        [
          { field: 'createdAt', direction: 'desc' },
          { field: 'firstName', direction: 'asc' },
        ],
      ],
      [
        'handles whitespace',
        ' -createdAt , firstName ',
        [
          { field: 'createdAt', direction: 'desc' },
          { field: 'firstName', direction: 'asc' },
        ],
      ],
      [
        'handles empty parts',
        'firstName,,lastName',
        [
          { field: 'firstName', direction: 'asc' },
          { field: 'lastName', direction: 'asc' },
        ],
      ],
    ];

    for (const [label, input, expected] of commaCases) {
      it(`parses ${label}`, () => {
        expect(QueryOrderEngine.buildSort(input, TEST_SPEC)).toEqual(expected);
      });
    }
  });

  describe('object format', () => {
    it('parses direct object', () => {
      expect(QueryOrderEngine.buildSort({ createdAt: 'desc' }, TEST_SPEC)).toEqual([
        { field: 'createdAt', direction: 'desc' },
      ]);
    });

    it('parses indexed array', () => {
      expect(QueryOrderEngine.buildSort({ '0': { createdAt: 'desc' } }, TEST_SPEC)).toEqual([
        { field: 'createdAt', direction: 'desc' },
      ]);
    });

    it('parses indexed object array', () => {
      expect(
        QueryOrderEngine.buildSort(
          { '0': { createdAt: 'desc' }, '1': { firstName: 'asc' } },
          TEST_SPEC,
        ),
      ).toEqual([
        { field: 'createdAt', direction: 'desc' },
        { field: 'firstName', direction: 'asc' },
      ]);
    });

    it('handles case-insensitive direction', () => {
      expect(QueryOrderEngine.buildSort({ createdAt: 'DESC' }, TEST_SPEC)).toEqual([
        { field: 'createdAt', direction: 'desc' },
      ]);
    });
  });

  describe('error handling', () => {
    const errorCases: [string, unknown, string][] = [
      ['non-sortable field', 'passwordHash', 'not a sortable field'],
      ['empty sort field', '-', 'Empty sort field'],
      ['invalid direction', { createdAt: 'random' }, 'Invalid sort direction'],
      ['non-object indexed value', { '0': 'createdAt' } as never, 'must be an object'],
      [
        'multiple fields in indexed object',
        { '0': { createdAt: 'desc', firstName: 'asc' } },
        'must have exactly one field',
      ],
    ];

    for (const [label, input, message] of errorCases) {
      it(`throws on ${label}`, () => {
        expect(() => QueryOrderEngine.buildSort(input as never, TEST_SPEC)).toThrow(message);
      });
    }
  });
});
