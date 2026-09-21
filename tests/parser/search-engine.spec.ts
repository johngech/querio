import { describe, expect, it } from 'bun:test';
import { defineQuery, q } from '../../packages/core/src/index';
import { QuerySearchEngine } from '../../packages/core/src/parser/search-engine';

describe('QuerySearchEngine', () => {
  const SEARCHABLE_SPEC = defineQuery({
    fields: {
      firstName: q.string().searchable(),
      lastName: q.string().searchable(),
      email: q.string().searchable(),
      status: q.enum(['ACTIVE', 'INACTIVE']),
      age: q.number(),
    },
  });

  const NO_SEARCH_SPEC = defineQuery({
    fields: {
      firstName: q.string(),
    },
  });

  describe('empty input', () => {
    const emptyCases: [string, unknown][] = [
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['whitespace only', '   '],
    ];

    for (const [label, input] of emptyCases) {
      it(`returns undefined for ${label}`, () => {
        expect(QuerySearchEngine.buildSearch(input as never, SEARCHABLE_SPEC)).toBeUndefined();
      });
    }
  });

  describe('basic search', () => {
    it('parses simple term', () => {
      const result = QuerySearchEngine.buildSearch('abebe', SEARCHABLE_SPEC);
      expect(result).toBeDefined();
      expect(result!.terms).toHaveLength(1);
      expect(result!.terms[0]).toEqual({
        value: 'abebe',
        match: 'contains',
        field: undefined,
        caseSensitive: undefined,
      });
      expect(result!.fields).toEqual(['firstName', 'lastName', 'email']);
    });

    it('trims whitespace', () => {
      const result = QuerySearchEngine.buildSearch('  abebe  ', SEARCHABLE_SPEC);
      expect(result!.terms[0].value).toBe('abebe');
    });

    it('parses multiple terms', () => {
      const result = QuerySearchEngine.buildSearch('abebe beke', SEARCHABLE_SPEC);
      expect(result!.terms).toHaveLength(2);
      expect(result!.terms[0].value).toBe('abebe');
      expect(result!.terms[1].value).toBe('beke');
    });
  });

  describe('phrase search', () => {
    it('parses quoted phrase', () => {
      const result = QuerySearchEngine.buildSearch('"abebe beke"', SEARCHABLE_SPEC);
      expect(result!.terms).toHaveLength(1);
      expect(result!.terms[0]).toEqual({
        value: 'abebe beke',
        match: 'phrase',
        field: undefined,
        caseSensitive: undefined,
      });
    });

    it('parses mixed phrase and term', () => {
      const result = QuerySearchEngine.buildSearch('"abebe beke" john', SEARCHABLE_SPEC);
      expect(result!.terms).toHaveLength(2);
      expect(result!.terms[0].match).toBe('phrase');
      expect(result!.terms[1].match).toBe('contains');
    });

    it('throws on unterminated phrase', () => {
      expect(() => QuerySearchEngine.buildSearch('"abebe beke', SEARCHABLE_SPEC)).toThrow(
        'Unterminated search phrase',
      );
    });
  });

  describe('prefix search', () => {
    it('parses prefix term', () => {
      const result = QuerySearchEngine.buildSearch('abe*', SEARCHABLE_SPEC);
      expect(result!.terms).toHaveLength(1);
      expect(result!.terms[0]).toEqual({
        value: 'abe',
        match: 'prefix',
        field: undefined,
        caseSensitive: undefined,
      });
    });

    it('parses mixed prefix and term', () => {
      const result = QuerySearchEngine.buildSearch('abe* john', SEARCHABLE_SPEC);
      expect(result!.terms).toHaveLength(2);
      expect(result!.terms[0].match).toBe('prefix');
      expect(result!.terms[1].match).toBe('contains');
    });

    it('throws on single * (empty prefix)', () => {
      expect(() => QuerySearchEngine.buildSearch('*', SEARCHABLE_SPEC)).toThrow(
        'Empty search value',
      );
    });

    it('does not parse prefix inside quotes', () => {
      const result = QuerySearchEngine.buildSearch('"abe*"', SEARCHABLE_SPEC);
      expect(result!.terms[0].match).toBe('phrase');
      expect(result!.terms[0].value).toBe('abe*');
    });
  });

  describe('field-specific search', () => {
    it('parses field:value', () => {
      const result = QuerySearchEngine.buildSearch('firstName:abebe', SEARCHABLE_SPEC);
      expect(result!.terms).toHaveLength(1);
      expect(result!.terms[0]).toEqual({
        value: 'abebe',
        match: 'contains',
        field: 'firstName',
        caseSensitive: false,
      });
    });

    it('parses field:prefix', () => {
      const result = QuerySearchEngine.buildSearch('firstName:abe*', SEARCHABLE_SPEC);
      expect(result!.terms[0].field).toBe('firstName');
      expect(result!.terms[0].match).toBe('prefix');
    });

    const fieldErrors: [string, string, string][] = [
      ['non-searchable field', 'status:ACTIVE', 'not a searchable field'],
      ['unknown field', 'foo:bar', 'Unknown search field'],
      ['prototype-chain field', 'constructor:abe', 'Unknown search field'],
    ];

    for (const [label, input, message] of fieldErrors) {
      it(`throws on ${label}`, () => {
        expect(() => QuerySearchEngine.buildSearch(input, SEARCHABLE_SPEC)).toThrow(message);
      });
    }
  });

  describe('error handling', () => {
    it('throws when no searchable fields', () => {
      expect(() => QuerySearchEngine.buildSearch('test', NO_SEARCH_SPEC)).toThrow(
        'Search is not supported',
      );
    });

    const valueErrors: [string, string, string][] = [
      ['empty value', 'firstName:', 'Empty search value'],
      ['empty quoted phrases', '"" ""', 'Search query is empty'],
    ];

    for (const [label, input, message] of valueErrors) {
      it(`throws on ${label}`, () => {
        expect(() => QuerySearchEngine.buildSearch(input, SEARCHABLE_SPEC)).toThrow(message);
      });
    }
  });
});
