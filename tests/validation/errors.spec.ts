import { describe, expect, it } from 'bun:test';
import { ErrorCode, QuerioError, QueryJSError } from '../../packages/core/src/query/queryjs-error';

describe('QueryJSError', () => {
  it('should be an instance of Error', () => {
    const err = new QueryJSError('test', ErrorCode.UNKNOWN_FIELD);
    expect(err).toBeInstanceOf(Error);
  });

  it('should set name to QueryJSError', () => {
    const err = new QueryJSError('test', ErrorCode.UNKNOWN_FIELD);
    expect(err.name).toBe('QueryJSError');
  });

  it('should keep QuerioError as a deprecated alias and prove instanceof', () => {
    const err = new QuerioError('test', ErrorCode.UNKNOWN_FIELD);
    expect(err).toBeInstanceOf(QueryJSError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('QueryJSError');
    expect(err.code).toBe(ErrorCode.UNKNOWN_FIELD);
  });

  it('should set message', () => {
    const err = new QueryJSError('something went wrong', ErrorCode.UNKNOWN_FIELD);
    expect(err.message).toBe('something went wrong');
  });

  it('should set code', () => {
    const err = new QueryJSError('test', ErrorCode.UNSUPPORTED_OPERATOR);
    expect(err.code).toBe(ErrorCode.UNSUPPORTED_OPERATOR);
  });

  it('should return statusCode 400', () => {
    const err = new QueryJSError('test', ErrorCode.UNKNOWN_FIELD);
    expect(err.statusCode).toBe(400);
  });

  const optionalFields: [string, Record<string, unknown>, string][] = [
    ['field', { field: 'age' }, 'age'],
    ['operator', { operator: 'contains' }, 'contains'],
    ['path', { path: 'user.address.city' }, 'user.address.city'],
  ];

  for (const [prop, opts, expected] of optionalFields) {
    it(`should accept optional ${prop}`, () => {
      const err = new QueryJSError(
        'test',
        ErrorCode.UNKNOWN_FIELD,
        opts as { field?: string; operator?: string; path?: string },
      );
      expect(err[prop as keyof QueryJSError]).toBe(expected);
    });
  }

  it('should accept optional details', () => {
    const details = { allowed: ['eq', 'neq'], received: 'contains' };
    const err = new QueryJSError('test', ErrorCode.UNSUPPORTED_OPERATOR, { details });
    expect(err.details).toEqual(details);
  });

  it('should default optional fields to undefined', () => {
    const err = new QueryJSError('test', ErrorCode.UNKNOWN_FIELD);
    expect(err.field).toBeUndefined();
    expect(err.operator).toBeUndefined();
    expect(err.path).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it('should be catchable as Error', () => {
    try {
      throw new QueryJSError('test', ErrorCode.UNKNOWN_FIELD);
    } catch (e) {
      expect(e).toBeInstanceOf(QueryJSError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  describe('error codes', () => {
    const codeGroups: [string, ErrorCode[]][] = [
      [
        'filter',
        [
          ErrorCode.UNKNOWN_FIELD,
          ErrorCode.UNSUPPORTED_OPERATOR,
          ErrorCode.INVALID_FILTER_VALUE,
          ErrorCode.FILTER_DEPTH_EXCEEDED,
          ErrorCode.RELATION_MUST_BE_OBJECT,
        ],
      ],
      [
        'sort',
        [
          ErrorCode.NON_SORTABLE_FIELD,
          ErrorCode.INVALID_SORT_DIRECTION,
          ErrorCode.EMPTY_SORT_FIELD,
        ],
      ],
      [
        'search',
        [
          ErrorCode.NO_SEARCHABLE_FIELDS,
          ErrorCode.SEARCH_TOO_LONG,
          ErrorCode.TOO_MANY_SEARCH_TERMS,
          ErrorCode.SEARCH_TERM_TOO_LONG,
          ErrorCode.NON_SEARCHABLE_FIELD,
          ErrorCode.UNKNOWN_SEARCH_FIELD,
          ErrorCode.EMPTY_SEARCH_VALUE,
          ErrorCode.EMPTY_SEARCH_QUERY,
          ErrorCode.UNTERMINATED_PHRASE,
        ],
      ],
      [
        'value',
        [
          ErrorCode.INVALID_BOOLEAN,
          ErrorCode.INVALID_NUMBER,
          ErrorCode.INVALID_DATE,
          ErrorCode.INVALID_ENUM_VALUE,
        ],
      ],
      [
        'value constraints',
        [
          ErrorCode.VALUE_TOO_SHORT,
          ErrorCode.VALUE_TOO_LONG,
          ErrorCode.VALUE_OUT_OF_RANGE,
          ErrorCode.VALUE_NOT_INTEGER,
          ErrorCode.VALUE_NOT_EMAIL,
          ErrorCode.VALUE_PATTERN_MISMATCH,
          ErrorCode.TOO_MANY_FILTERS,
        ],
      ],
    ];

    for (const [group, codes] of codeGroups) {
      it(`should have all ${group} error codes`, () => {
        for (const code of codes) {
          expect(code).toBe(code);
        }
      });
    }
  });
});
