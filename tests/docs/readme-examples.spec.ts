/**
 * Locks the URL examples used throughout the READMEs to real parser output, so
 * the docs cannot drift from what `defineQuery(...).parse()` actually returns.
 *
 * Validated against the printed output of `bun run verify-doc-examples`.
 */
import { describe, expect, it } from 'bun:test';
import { resolveLimits } from '../../packages/core/src/definition/limits';
import type { ResourceQuery } from '../../packages/core/src/index';
import {
  docUsersQuery,
  OPERATOR_URLS,
  PAGINATION_URLS,
  parseBracketQuery,
  SYNTAX_URLS,
} from './readme-examples.fixtures';

describe('docs: readme URL examples match real parser output', () => {
  it('resolves the documented pagination defaults (maxPage=1_000_000, maxLimit=100, defaultLimit=10)', () => {
    const limits = resolveLimits();
    expect(limits.maxPage).toBe(1_000_000);
    expect(limits.maxLimit).toBe(100);
    expect(limits.defaultLimit).toBe(10);
  });

  it('parses every operator-table URL into the documented filter', () => {
    for (const { url, expected } of OPERATOR_URLS) {
      const query = docUsersQuery.parse(parseBracketQuery(url));
      expect(query.filters).toHaveLength(1);
      expect({
        field: query.filters[0]?.field,
        operator: query.filters[0]?.operator,
        value: query.filters[0]?.value,
        caseSensitive: query.filters[0]?.caseSensitive,
      }).toEqual(expected);
    }
  });

  it('parses every syntax URL into the documented ResourceQuery', () => {
    for (const { url, expected } of SYNTAX_URLS) {
      const query = docUsersQuery.parse(parseBracketQuery(url));
      const actual: ResourceQuery = {
        filters: query.filters,
        relations: query.relations,
        sort: query.sort,
        search: query.search,
        pagination: query.pagination,
      };
      expect(actual).toEqual(expected);
    }
  });

  it('documents pagination truthfully: page/limit are coerced and clamped, never errors', () => {
    for (const { url, expected } of PAGINATION_URLS) {
      const query = docUsersQuery.parse(parseBracketQuery(url));
      expect(query.pagination).toEqual(expected);
    }
  });

  it('keeps the operator count in sync with FilterOperator', () => {
    // The README operator table must never silently gain/lose rows.
    expect(OPERATOR_URLS).toHaveLength(13);
  });
});
