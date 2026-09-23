import { describe, expect, it } from "bun:test";
import type { ResourceQueryDefinition } from "../../packages/core/src/definition/types";
import type {
  FilterExpression,
  RelationFilterExpression,
  SearchQuery,
  SortExpression,
} from "../../packages/core/src/index";
import {
  defineQuery,
  defineRelation,
  QuerioError,
  q,
} from "../../packages/core/src/index";
import { QueryOrderEngine } from "../../packages/core/src/parser/order-engine";
import { parseQuery } from "../../packages/core/src/parser/parser";
import { QuerySearchEngine } from "../../packages/core/src/parser/search-engine";
import { QueryWhereEngine } from "../../packages/core/src/parser/where-engine";

/**
 * Property/fuzz tests for the parsing engines.
 *
 * Uses a seeded PRNG so runs are deterministic and reproducible. Invariants:
 *  - where engine: success never leaks unknown fields, disallowed operators, or
 *    prototype-chain keys; parsed values are typed per the field spec.
 *  - order engine: success only references sortable fields with valid directions.
 *  - search engine: success yields terms with non-empty values and known matches.
 *  - pagination: page/limit always land in [1, cap].
 */

/** Deterministic 32-bit PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_- .:*";

function randomString(rand: () => number, maxLength = 20): string {
  const len = Math.floor(rand() * maxLength);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}

function randomPrimitive(rand: () => number): unknown {
  const r = rand();
  if (r < 0.2) return null;
  if (r < 0.4) return String(Math.floor(rand() * 200));
  if (r < 0.6) return String(rand() * 100);
  if (r < 0.8) return randomString(rand);
  return "true";
}

const FUZZ_SPEC = defineQuery({
  fields: {
    status: q.enum(["ACTIVE", "INACTIVE", "PENDING"]).sortable().searchable(),
    firstName: q.string().sortable().searchable(),
    lastName: q.string().sortable().searchable(),
    email: q.string().sortable().searchable(),
    age: q.number().sortable(),
    isActive: q.boolean(),
    createdAt: q.date().sortable(),
  },
  relations: {
    member: defineRelation({
      fields: { accountNo: q.string().sortable().searchable() },
    }),
  },
});

const MEMBER_FIELDS = FUZZ_SPEC.relations!.member.fields;

const OPERATORS_BY_TYPE: Record<string, string[]> = {
  string: [
    "eq",
    "neq",
    "contains",
    "startsWith",
    "endsWith",
    "in",
    "notIn",
    "isNull",
    "isNotNull",
  ],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "isNull", "isNotNull"],
  boolean: ["eq", "isNull", "isNotNull"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "isNull", "isNotNull"],
  enum: ["eq", "neq", "in", "notIn", "isNull", "isNotNull"],
};

const OP_TO_TUPLE: Record<
  FilterExpression["operator"],
  "array" | "no_val" | "scalar"
> = {
  eq: "scalar",
  neq: "scalar",
  gt: "scalar",
  gte: "scalar",
  lt: "scalar",
  lte: "scalar",
  contains: "scalar",
  startsWith: "scalar",
  endsWith: "scalar",
  in: "array",
  notIn: "array",
  isNull: "no_val",
  isNotNull: "no_val",
};

/** Build a random, potentially-malformed filter payload for the fuzz spec. */
function randomWhere(
  rand: () => number,
  depth = 0,
  fields: Record<string, unknown> = FUZZ_SPEC.fields as unknown as Record<
    string,
    unknown
  >,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const known = Object.keys(fields);
  const keys =
    rand() < 0.8 ? known : ["nonexistent", "toString", "constructor"];
  const count = Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const field = keys[Math.floor(rand() * keys.length)];
    if (depth === 0 && fields === FUZZ_SPEC.fields && rand() < 0.15) {
      out.member = randomWhere(
        rand,
        depth + 1,
        MEMBER_FIELDS as unknown as Record<string, unknown>,
      );
      continue;
    }
    const spec = Object.hasOwn(fields, field) ? fields[field] : undefined;
    if (!spec) {
      out[field] = randomPrimitive(rand);
      continue;
    }
    if (rand() < 0.4) {
      out[field] = randomPrimitive(rand);
      continue;
    }
    const fs = spec as { type: string };
    const ops = OPERATORS_BY_TYPE[fs.type];
    const opset: Record<string, unknown> = {};
    const opCount = Math.floor(rand() * 2) + 1;
    for (let j = 0; j < opCount; j++) {
      const op = ops[Math.floor(rand() * ops.length)];
      if (op === "in" || op === "notIn") {
        opset[op] = Array.from({ length: Math.floor(rand() * 3) }, () =>
          randomPrimitive(rand),
        );
      } else if (op === "isNull" || op === "isNotNull") {
        opset[op] = "true";
      } else {
        opset[op] = randomPrimitive(rand);
      }
    }
    out[field] = opset;
  }
  return out;
}

describe("fuzz — where engine invariants", () => {
  it("never leaks unknown fields, disallowed operators, or prototype keys", () => {
    const rand = mulberry32(0xc0ffee);
    for (let i = 0; i < 1500; i++) {
      const input = randomWhere(rand);
      let result:
        | { filters: FilterExpression[]; relations: RelationFilterExpression[] }
        | undefined;
      try {
        result = QueryWhereEngine.buildFilters(
          input,
          FUZZ_SPEC as ResourceQueryDefinition,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(QuerioError);
        continue;
      }

      const { filters, relations } = result;
      for (const filter of filters) {
        const spec = FUZZ_SPEC.fields[filter.field];
        expect(
          spec,
          `field ${filter.field} must exist for input ${JSON.stringify(input)}`,
        ).toBeDefined();
        expect(spec!.operators).toContain(filter.operator);
        if (OP_TO_TUPLE[filter.operator] === "scalar") {
          expect(filter).toHaveProperty("value");
        } else if (OP_TO_TUPLE[filter.operator] === "no_val") {
          expect(filter).not.toHaveProperty("value");
        }
      }
      for (const relation of relations) {
        expect(relation.relation).toBe("member");
        const fieldNames = Object.keys(
          FUZZ_SPEC.relations?.member.fields ?? {},
        );
        for (const filter of relation.filters) {
          expect(fieldNames).toContain(filter.field);
        }
      }
      expect(filters.length + relations.length).toBeLessThanOrEqual(100);
    }
  });

  it("types parsed values per field spec", () => {
    const rand = mulberry32(0xbeef);
    for (let i = 0; i < 800; i++) {
      const input = randomWhere(rand);
      let result:
        | { filters: FilterExpression[]; relations: RelationFilterExpression[] }
        | undefined;
      try {
        result = QueryWhereEngine.buildFilters(
          input,
          FUZZ_SPEC as ResourceQueryDefinition,
        );
      } catch {
        continue;
      }
      for (const filter of result.filters) {
        const spec = FUZZ_SPEC.fields[filter.field]!;
        if (!filter.value) continue;
        if (Array.isArray(filter.value)) continue;
        if (spec.type === "number") {
          expect(typeof filter.value).toBe("number");
        } else if (spec.type === "boolean") {
          expect(typeof filter.value).toBe("boolean");
        } else if (spec.type === "enum") {
          expect(spec.enumValues).toContain(String(filter.value));
        } else {
          expect(typeof filter.value).toBe("string");
        }
      }
    }
  });
});

describe("fuzz — order engine invariants", () => {
  it("success only yields sortable fields with valid directions", () => {
    const rand = mulberry32(0xf00d);
    const SORTABLE = [
      "status",
      "firstName",
      "lastName",
      "email",
      "age",
      "createdAt",
    ];
    for (let i = 0; i < 300; i++) {
      const clauses = Array.from(
        { length: Math.floor(rand() * 6) },
        () =>
          `${rand() < 0.5 ? "-" : ""}${SORTABLE[Math.floor(rand() * SORTABLE.length)]}`,
      );
      const raw = clauses.join(",");
      let result: SortExpression[] | undefined;
      try {
        result = QueryOrderEngine.buildSort(
          raw,
          FUZZ_SPEC as ResourceQueryDefinition,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(QuerioError);
        continue;
      }
      for (const sort of result) {
        expect(SORTABLE).toContain(sort.field);
        expect(["asc", "desc"]).toContain(sort.direction);
      }
    }
  });
});

describe("fuzz — search engine invariants", () => {
  it("success yields terms with non-empty values and known match types", () => {
    const rand = mulberry32(0x5eed);
    for (let i = 0; i < 400; i++) {
      const raw = randomString(rand, 40);
      let result: SearchQuery | undefined;
      try {
        result = QuerySearchEngine.buildSearch(
          raw === "" ? undefined : raw,
          FUZZ_SPEC as ResourceQueryDefinition,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(QuerioError);
        continue;
      }
      if (!result) continue;
      for (const term of result.terms) {
        expect(term.value.length).toBeGreaterThan(0);
        expect(["contains", "prefix", "phrase"]).toContain(term.match);
        if (term.field) {
          expect(FUZZ_SPEC.fields[term.field]?.searchable).toBe(true);
        }
      }
    }
  });
});

describe("fuzz — pagination invariants", () => {
  it("page and limit always land in [1, cap]", () => {
    const rand = mulberry32(0xdead);
    for (let i = 0; i < 500; i++) {
      const page = Math.floor(rand() * 1_000_000) - 500_000;
      const limit = Math.floor(rand() * 500) - 200;
      const result = parseQuery({ page, limit }, FUZZ_SPEC);
      expect(result.pagination.page).toBeGreaterThanOrEqual(1);
      expect(result.pagination.page).toBeLessThanOrEqual(1_000_000);
      expect(result.pagination.limit).toBeGreaterThanOrEqual(1);
      expect(result.pagination.limit).toBeLessThanOrEqual(100);
    }
  });
});
