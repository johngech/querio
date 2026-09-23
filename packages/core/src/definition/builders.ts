import { parseQuery } from '../parser';
import type { QueryParams, ResourceQuery } from '../query';
import { FieldBuilder } from './fields';
import type { ResourceQueryLimits } from './limits';
import type { FilterFieldSpec, RelationSpec, ResourceQueryDefinition } from './types';

/** A field entry accepted by `defineQuery` / `defineRelation`. */
export type QueryField = FilterFieldSpec | FieldBuilder;

/** Raw (unresolved) relation input — accepts fluent builders. */
export type QueryRelationInput = {
  fields: Record<string, QueryField>;
  relations?: Record<string, QueryRelationInput>;
};

/**
 * A built resource definition. Exposes the normalized field specs plus a
 * `parse()` helper that turns raw incoming query params into a validated
 * {@link ResourceQuery}.
 */
export interface QueryDefinition extends ResourceQueryDefinition {
  parse(params: QueryParams): ResourceQuery;
}

function resolveFields(fields: Record<string, QueryField>): Record<string, FilterFieldSpec> {
  const resolved: Record<string, FilterFieldSpec> = {};
  for (const [name, value] of Object.entries(fields)) {
    // Detach from any caller-owned references (arrays are copied) and freeze
    // the result so later mutation can't change parsing behavior.
    const spec =
      value instanceof FieldBuilder
        ? value.build()
        : {
            ...value,
            operators: value.operators ? [...value.operators] : value.operators,
            enumValues: value.enumValues ? [...value.enumValues] : value.enumValues,
          };
    Object.freeze(spec);
    if (Array.isArray(spec.operators)) Object.freeze(spec.operators);
    if (Array.isArray(spec.enumValues)) Object.freeze(spec.enumValues);
    resolved[name] = spec;
  }
  return resolved;
}

function resolveRelations(
  relations: Record<string, QueryRelationInput> | undefined,
): Record<string, RelationSpec> | undefined {
  if (!relations) return undefined;

  const resolved: Record<string, RelationSpec> = {};
  for (const [name, relation] of Object.entries(relations)) {
    const spec = {
      fields: resolveFields(relation.fields),
      relations: resolveRelations(relation.relations),
    };
    Object.freeze(spec);
    resolved[name] = spec;
  }
  return resolved;
}

function buildDefinition(def: {
  fields: Record<string, QueryField>;
  relations?: Record<string, QueryRelationInput>;
}): {
  fields: Record<string, FilterFieldSpec>;
  relations: Record<string, RelationSpec> | undefined;
} {
  return {
    fields: resolveFields(def.fields),
    relations: resolveRelations(def.relations),
  };
}

/**
 * Define the queryable surface of a resource.
 *
 * ```ts
 * const usersQuery = defineQuery({
 *   fields: {
 *     name: q.string().searchable().sortable(),
 *     email: q.string().searchable().sortable(),
 *   },
 *   relations: {
 *     member: defineRelation({ fields: { accountNo: q.string() } }),
 *   },
 * });
 *
 * const query: ResourceQuery = usersQuery.parse(req.query);
 * ```
 */
export function defineQuery(def: {
  fields: Record<string, QueryField>;
  relations?: Record<string, QueryRelationInput>;
  limits?: ResourceQueryLimits;
}): QueryDefinition {
  const { fields, relations } = buildDefinition(def);
  return {
    fields,
    relations,
    limits: def.limits,
    parse(params) {
      return parseQuery(params, { fields, relations, limits: def.limits });
    },
  };
}

/** Define a nested relation used inside `defineQuery`. */
export function defineRelation(def: {
  fields: Record<string, QueryField>;
  relations?: Record<string, QueryRelationInput>;
}): RelationSpec {
  return buildDefinition(def);
}
