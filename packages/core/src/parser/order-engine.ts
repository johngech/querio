import type { ResourceQueryDefinition } from '../definition/types';
import type { SortDirection, SortExpression } from '../query/index';
import { ErrorCode, QueryJSError } from '../query/queryjs-error';

/**
 * Validates raw `sort` input from the query string against a
 * {@link ResourceQueryDefinition} and produces application-level
 * {@link SortExpression}s. No ORM types leak through this engine.
 *
 * Accepted formats:
 *   ?sort=-createdAt,accountNo           (comma-separated, - = desc)
 *   ?sort[0]=-createdAt&sort[1]=accountNo (indexed array)
 *   ?sort[createdAt]=desc               (direct object)
 *   ?sort[0][createdAt]=desc            (indexed object array)
 */
export class QueryOrderEngine {
  static buildSort(
    raw: Record<string, unknown> | string | undefined,
    spec: ResourceQueryDefinition,
  ): SortExpression[] {
    if (raw === undefined || raw === null) return [];

    // Comma-separated string: "-createdAt,accountNo"
    if (typeof raw === 'string') {
      return QueryOrderEngine.parseCommaSeparated(raw, spec);
    }

    if (typeof raw !== 'object' || Object.keys(raw).length === 0) return [];

    const entries = QueryOrderEngine.normalizeEntries(raw);
    const result: SortExpression[] = [];

    for (const [field, direction] of entries) {
      QueryOrderEngine.assertSortableField(field, spec);
      result.push({ field, direction });
    }

    return result;
  }

  // ── internal ────────────────────────────────────────────────────────────

  private static assertSortableField(field: string, spec: ResourceQueryDefinition): void {
    if (!Object.hasOwn(spec.fields, field) || !spec.fields[field].sortable) {
      throw new QueryJSError(
        `Cannot sort by '${field}' (not a sortable field)`,
        ErrorCode.NON_SORTABLE_FIELD,
        { field },
      );
    }
  }

  private static parseCommaSeparated(raw: string, spec: ResourceQueryDefinition): SortExpression[] {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const result: SortExpression[] = [];

    for (const part of parts) {
      const direction: SortDirection = part.startsWith('-') ? 'desc' : 'asc';
      const field = part.startsWith('-') ? part.slice(1) : part;

      if (!field) {
        throw new QueryJSError('Empty sort field in sort parameter', ErrorCode.EMPTY_SORT_FIELD);
      }

      QueryOrderEngine.assertSortableField(field, spec);

      result.push({ field, direction });
    }

    return result;
  }

  /**
   * Normalize the various shapes `qs` can produce for sort into
   * `[fieldName, direction]` tuples.
   */
  private static normalizeEntries(raw: Record<string, unknown>): [string, SortDirection][] {
    const entries: [string, SortDirection][] = [];
    const firstKey = Object.keys(raw)[0];

    // Indexed array: { '0': { createdAt: 'desc' } } or { '0': '-createdAt' }
    if (firstKey !== undefined && /^\d+$/.test(firstKey)) {
      const indices = Object.keys(raw).sort((a, b) => Number(a) - Number(b));
      for (const idx of indices) {
        const entry = raw[idx];

        // String form (matches the JSDoc's `?sort[0]=-createdAt` format):
        // parse direction from a leading '-', tackling string and array inputs.
        if (typeof entry === 'string') {
          const parts = entry
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (parts.length === 0) {
            throw new QueryJSError(`Empty sort field in sort[${idx}]`, ErrorCode.EMPTY_SORT_FIELD, {
              path: `sort[${idx}]`,
            });
          }
          for (const part of parts) {
            const direction: SortDirection = part.startsWith('-') ? 'desc' : 'asc';
            const field = part.startsWith('-') ? part.slice(1) : part;
            if (!field) {
              throw new QueryJSError(
                `Empty sort field in sort[${idx}]`,
                ErrorCode.EMPTY_SORT_FIELD,
                { path: `sort[${idx}]` },
              );
            }
            entries.push([field, direction]);
          }
          continue;
        }

        if (!entry || typeof entry !== 'object') {
          throw new QueryJSError(
            `sort[${idx}] must be an object like { fieldName: 'asc' }`,
            ErrorCode.INVALID_SORT_DIRECTION,
            { path: `sort[${idx}]` },
          );
        }
        const innerKeys = Object.keys(entry as Record<string, unknown>);
        if (innerKeys.length !== 1) {
          throw new QueryJSError(
            `sort[${idx}] must have exactly one field`,
            ErrorCode.INVALID_SORT_DIRECTION,
            { path: `sort[${idx}]` },
          );
        }
        const field = innerKeys[0];
        const dir = (entry as Record<string, unknown>)[field];
        const normalized = QueryOrderEngine.normalizeDirection(String(dir));
        if (!normalized) {
          throw new QueryJSError(
            `Invalid sort direction '${dir}' for field '${field}' (use 'asc' or 'desc')`,
            ErrorCode.INVALID_SORT_DIRECTION,
            { field },
          );
        }
        entries.push([field, normalized]);
      }
      return entries;
    }

    // Direct object: { createdAt: 'desc' }
    for (const [field, dir] of Object.entries(raw)) {
      const normalized = QueryOrderEngine.normalizeDirection(String(dir));
      if (!normalized) {
        throw new QueryJSError(
          `Invalid sort direction '${dir}' for field '${field}' (use 'asc' or 'desc')`,
          ErrorCode.INVALID_SORT_DIRECTION,
          { field },
        );
      }
      entries.push([field, normalized]);
    }

    return entries;
  }

  private static normalizeDirection(value: string): SortDirection | undefined {
    const lower = value.toLowerCase();
    if (lower === 'asc' || lower === 'desc') return lower;
    return undefined;
  }
}
