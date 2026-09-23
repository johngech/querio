/**
 * Prints the real `defineQuery(...).parse()` results for every README URL
 * example. Run with `bun run verify-doc-examples` and paste the output into the
 * READMEs so every documented example matches the actual parser behavior.
 */
import {
  docUsersQuery,
  OPERATOR_URLS,
  PAGINATION_URLS,
  parseBracketQuery,
  SYNTAX_URLS,
} from '../tests/docs/readme-examples.fixtures.ts';

function print(url: string, result: unknown): void {
  console.log(`GET /users?${url}`);
  console.log(`→   ${JSON.stringify(result)}`);
  console.log();
}

for (const { url } of OPERATOR_URLS) {
  const query = docUsersQuery.parse(parseBracketQuery(url));
  print(url, { filters: query.filters });
}

for (const { url } of SYNTAX_URLS) {
  const query = docUsersQuery.parse(parseBracketQuery(url));
  print(url, {
    filters: query.filters,
    relations: query.relations,
    sort: query.sort,
    search: query.search,
    pagination: query.pagination,
  });
}

for (const { url } of PAGINATION_URLS) {
  const query = docUsersQuery.parse(parseBracketQuery(url));
  print(url, { pagination: query.pagination });
}
