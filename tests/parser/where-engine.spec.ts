import { describe, expect, it } from "bun:test";
import {
  defineQuery,
  defineRelation,
  type FilterExpression,
  QuerioError,
} from "../../packages/core/src/index";
import { q } from "../../packages/core/src/operators/q";
import { QueryWhereEngine } from "../../packages/core/src/parser/where-engine";

describe("QueryWhereEngine", () => {
  const TEST_SPEC = defineQuery({
    fields: {
      status: q.enum(["ACTIVE", "INACTIVE", "PENDING"]).sortable().searchable(),
      firstName: q.string().sortable().searchable(),
      lastName: q.string().sortable().searchable(),
      email: q.string().sortable().searchable(),
      age: q.number().sortable(),
      isActive: q.boolean(),
      createdAt: q.date().sortable(),
    },
  });

  describe("empty input", () => {
    const emptyCases: [string, unknown][] = [
      ["undefined", undefined],
      ["null", null],
      ["empty object", {}],
    ];

    for (const [label, input] of emptyCases) {
      it(`returns empty arrays for ${label}`, () => {
        const result = QueryWhereEngine.buildFilters(input as never, TEST_SPEC);
        expect(result.filters).toEqual([]);
        expect(result.relations).toEqual([]);
      });
    }
  });

  describe("implicit equal operator", () => {
    it("creates equal filter for primitive value", () => {
      const result = QueryWhereEngine.buildFilters(
        { status: "ACTIVE" },
        TEST_SPEC,
      );
      expect(result.filters).toEqual([
        {
          field: "status",
          operator: "eq",
          value: "ACTIVE",
          caseSensitive: false,
        },
      ]);
    });

    it("handles null value", () => {
      const result = QueryWhereEngine.buildFilters({ email: null }, TEST_SPEC);
      expect(result.filters).toEqual([
        { field: "email", operator: "eq", value: null, caseSensitive: false },
      ]);
    });
  });

  describe("explicit operators", () => {
    const scalarOperators: [
      string,
      Record<string, unknown>,
      FilterExpression,
    ][] = [
      [
        "eq",
        { status: { eq: "ACTIVE" } },
        {
          field: "status",
          operator: "eq",
          value: "ACTIVE",
          caseSensitive: false,
        },
      ],
      [
        "neq",
        { status: { neq: "ACTIVE" } },
        {
          field: "status",
          operator: "neq",
          value: "ACTIVE",
          caseSensitive: false,
        },
      ],
      [
        "gt",
        { age: { gt: 18 } },
        { field: "age", operator: "gt", value: 18, caseSensitive: false },
      ],
      [
        "gte",
        { age: { gte: 18 } },
        { field: "age", operator: "gte", value: 18, caseSensitive: false },
      ],
      [
        "lt",
        { age: { lt: 65 } },
        { field: "age", operator: "lt", value: 65, caseSensitive: false },
      ],
      [
        "lte",
        { age: { lte: 65 } },
        { field: "age", operator: "lte", value: 65, caseSensitive: false },
      ],
      [
        "contains",
        { firstName: { contains: "abebe" } },
        {
          field: "firstName",
          operator: "contains",
          value: "abebe",
          caseSensitive: false,
        },
      ],
      [
        "startsWith",
        { firstName: { startsWith: "abe" } },
        {
          field: "firstName",
          operator: "startsWith",
          value: "abe",
          caseSensitive: false,
        },
      ],
      [
        "isNull",
        { email: { isNull: true } },
        { field: "email", operator: "isNull", caseSensitive: false },
      ],
      [
        "isNotNull",
        { email: { isNotNull: true } },
        { field: "email", operator: "isNotNull", caseSensitive: false },
      ],
    ];

    for (const [op, input, expected] of scalarOperators) {
      it(`handles ${op} operator`, () => {
        const result = QueryWhereEngine.buildFilters(input, TEST_SPEC);
        expect(result.filters).toEqual([expected]);
      });
    }

    const arrayOperators: [
      string,
      Record<string, unknown>,
      FilterExpression,
    ][] = [
      [
        "in (array)",
        { status: { in: ["ACTIVE", "PENDING"] } },
        {
          field: "status",
          operator: "in",
          value: ["ACTIVE", "PENDING"],
          caseSensitive: false,
        },
      ],
      [
        "notIn (array)",
        { status: { notIn: ["INACTIVE"] } },
        {
          field: "status",
          operator: "notIn",
          value: ["INACTIVE"],
          caseSensitive: false,
        },
      ],
      [
        "in (comma-separated)",
        { status: { in: "ACTIVE,PENDING" } },
        {
          field: "status",
          operator: "in",
          value: ["ACTIVE", "PENDING"],
          caseSensitive: false,
        },
      ],
      [
        "notIn (comma-separated with trimming)",
        { status: { notIn: " INACTIVE , PENDING " } },
        {
          field: "status",
          operator: "notIn",
          value: ["INACTIVE", "PENDING"],
          caseSensitive: false,
        },
      ],
    ];

    for (const [op, input, expected] of arrayOperators) {
      it(`handles ${op} operator`, () => {
        const result = QueryWhereEngine.buildFilters(input, TEST_SPEC);
        expect(result.filters).toEqual([expected]);
      });
    }
  });

  describe("type parsing", () => {
    const typeCases: [string, Record<string, unknown>, unknown][] = [
      ["boolean", { isActive: true }, true],
      ["number", { age: 25 }, 25],
      [
        "date",
        { createdAt: "2026-01-15T10:30:00.000Z" },
        "2026-01-15T10:30:00.000Z",
      ],
    ];

    for (const [type, input, expected] of typeCases) {
      it(`parses ${type} values`, () => {
        const result = QueryWhereEngine.buildFilters(input, TEST_SPEC);
        expect(result.filters[0].value).toBe(expected);
      });
    }

    it("validates enum values", () => {
      expect(() =>
        QueryWhereEngine.buildFilters({ status: "INVALID" }, TEST_SPEC),
      ).toThrow(QuerioError);
    });

    it("rejects empty number values", () => {
      expect(() =>
        QueryWhereEngine.buildFilters({ age: "" }, TEST_SPEC),
      ).toThrow("Invalid number");
      expect(() =>
        QueryWhereEngine.buildFilters({ age: "   " }, TEST_SPEC),
      ).toThrow("Invalid number");
    });

    it("accepts decimal and scientific number formats", () => {
      for (const [input, expected] of [
        ["25", 25],
        ["-2.5", -2.5],
        [".5", 0.5],
        ["+5", 5],
        ["1e3", 1000],
        ["1.5e-2", 0.015],
      ] as const) {
        const result = QueryWhereEngine.buildFilters({ age: input }, TEST_SPEC);
        expect(result.filters[0].value).toBe(expected);
      }
    });

    it("rejects hex, binary, octal, and non-finite number formats", () => {
      for (const input of [
        "0x10",
        "0b101",
        "0o17",
        "Infinity",
        "-Infinity",
        "NaN",
        "12abc",
      ]) {
        expect(() =>
          QueryWhereEngine.buildFilters({ age: input }, TEST_SPEC),
        ).toThrow("Invalid number");
      }
    });
  });

  describe("error handling", () => {
    const errorCases: [string, Record<string, unknown>, string][] = [
      [
        "unknown field",
        { unknown: "value" },
        "Unknown filter field: 'unknown'",
      ],
      ["unsupported operator", { age: { unsupported: 18 } }, "not supported"],
      [
        "invalid boolean value",
        { isActive: "invalid" },
        "Invalid boolean value",
      ],
      ["invalid number value", { age: "not-a-number" }, "Invalid number value"],
      ["invalid date value", { createdAt: "not-a-date" }, "Invalid date value"],
      [
        "in with non-array",
        { status: { in: 123 } },
        "must be an array or a comma-separated list",
      ],
      [
        "notIn with non-array",
        { status: { notIn: 123 } },
        "must be an array or a comma-separated list",
      ],
      [
        "isNull with false flag",
        { email: { isNull: false } },
        "expects the value",
      ],
      [
        "isNotNull with false flag",
        { email: { isNotNull: "false" } },
        "expects the value",
      ],
      [
        "contains with empty value",
        { firstName: { contains: "" } },
        "must not be empty",
      ],
      [
        "startsWith with whitespace",
        { firstName: { startsWith: "   " } },
        "must not be empty",
      ],
      [
        "contains with missing value",
        { firstName: { contains: undefined } },
        "must not be empty",
      ],
    ];

    for (const [label, input, message] of errorCases) {
      it(`throws on ${label}`, () => {
        expect(() => QueryWhereEngine.buildFilters(input, TEST_SPEC)).toThrow(
          message,
        );
      });
    }
  });

  describe("relation filters", () => {
    const SPEC_WITH_RELATION = defineQuery({
      fields: {
        firstName: q.string().sortable().searchable(),
      },
      relations: {
        member: {
          fields: {
            firstName: q.string().sortable(),
            email: q.string(),
          },
        },
      },
    });

    it("throws on relation with non-object value", () => {
      expect(() =>
        QueryWhereEngine.buildFilters(
          { member: "invalid" },
          SPEC_WITH_RELATION,
        ),
      ).toThrow("must be an object");
    });

    it("handles nested relation filters", () => {
      const result = QueryWhereEngine.buildFilters(
        { member: { firstName: "Abebe" } },
        SPEC_WITH_RELATION,
      );
      expect(result.filters).toEqual([]);
      expect(result.relations).toEqual([
        {
          relation: "member",
          filters: [
            {
              field: "firstName",
              operator: "eq",
              value: "Abebe",
              caseSensitive: false,
            },
          ],
        },
      ]);
    });

    it("preserves the full relation path for nested relations", () => {
      const spec = defineQuery({
        fields: { name: q.string() },
        relations: {
          org: defineRelation({
            fields: { name: q.string() },
            relations: {
              parent: defineRelation({ fields: { name: q.string() } }),
            },
          }),
        },
      });
      const result = QueryWhereEngine.buildFilters(
        { org: { parent: { name: "x" } } },
        spec,
      );
      expect(result.relations).toEqual([
        {
          relation: "org.parent",
          filters: [
            { field: "name", operator: "eq", value: "x", caseSensitive: false },
          ],
        },
      ]);
    });
  });

  describe("nesting depth", () => {
    const SPEC_DEEP = defineQuery({
      fields: {},
      relations: {
        level1: {
          fields: {},
          relations: {
            level2: {
              fields: {},
              relations: {
                level3: {
                  fields: {
                    name: q.string(),
                  },
                },
              },
            },
          },
        },
      },
    });

    it("throws when nesting depth exceeds limit", () => {
      expect(() =>
        QueryWhereEngine.buildFilters(
          { level1: { level2: { level3: { name: "test" } } } },
          SPEC_DEEP,
        ),
      ).toThrow("Maximum relation nesting depth");
    });

    it("allows nesting within limit", () => {
      const specWithinLimit = defineQuery({
        fields: {},
        relations: {
          level1: {
            fields: {
              name: q.string(),
            },
          },
        },
      });
      const result = QueryWhereEngine.buildFilters(
        { level1: { name: "test" } },
        specWithinLimit,
      );
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].filters[0].value).toBe("test");
    });
  });

  describe("value constraints", () => {
    const CONSTRAINED_SPEC = defineQuery({
      fields: {
        name: q.string().min(2).max(50),
        email: q.string().email(),
        code: q.string().pattern(/^[A-Z]{3}$/),
        age: q.number().min(0).max(150),
        score: q.number().integer(),
        shortCode: q.string().min(3, "Too short").max(5, "Too long"),
      },
    });

    const constraintErrors: [string, Record<string, unknown>, string][] = [
      ["string shorter than minLength", { name: "a" }, "at least 2 characters"],
      [
        "string longer than maxLength",
        { name: "a".repeat(51) },
        "at most 50 characters",
      ],
      ["invalid email", { email: "not-an-email" }, "valid email address"],
      ["pattern mismatch", { code: "abc" }, "does not match required pattern"],
      ["number below min", { age: -1 }, "at least 0"],
      ["number above max", { age: 151 }, "at most 150"],
      [
        "non-integer when isInteger required",
        { score: 3.5 },
        "must be an integer",
      ],
    ];

    for (const [label, input, message] of constraintErrors) {
      it(`throws on ${label}`, () => {
        expect(() =>
          QueryWhereEngine.buildFilters(input, CONSTRAINED_SPEC),
        ).toThrow(message);
      });
    }

    const validCases: [string, Record<string, unknown>, unknown][] = [
      ["string within length bounds", { name: "valid" }, "valid"],
      ["valid email", { email: "test@example.com" }, "test@example.com"],
      ["matching pattern", { code: "ABC" }, "ABC"],
      ["integer when isInteger required", { score: 100 }, 100],
    ];

    for (const [label, input, expected] of validCases) {
      it(`accepts ${label}`, () => {
        const result = QueryWhereEngine.buildFilters(input, CONSTRAINED_SPEC);
        expect(result.filters[0].value).toBe(expected);
      });
    }

    it("uses custom error messages", () => {
      expect(() =>
        QueryWhereEngine.buildFilters({ shortCode: "ab" }, CONSTRAINED_SPEC),
      ).toThrow("Too short");
      expect(() =>
        QueryWhereEngine.buildFilters(
          { shortCode: "abcdef" },
          CONSTRAINED_SPEC,
        ),
      ).toThrow("Too long");
    });

    it("does not apply whole-value constraints to substring operators", () => {
      const spec = defineQuery({
        fields: {
          email: q
            .string()
            .email()
            .operators(q.op.contains().startsWith().endsWith()),
          shortName: q.string().min(10).operators(q.op.startsWith()),
          code: q
            .string()
            .pattern(/^[A-Z]{3}$/)
            .operators(q.op.endsWith()),
        },
      });
      const result = QueryWhereEngine.buildFilters(
        {
          email: { contains: "foo" },
          shortName: { startsWith: "ab" },
          code: { endsWith: "z1" },
        },
        spec,
      );
      expect(result.filters.map((f) => f.value)).toEqual(["foo", "ab", "z1"]);
    });
  });

  describe("max filter count", () => {
    const makeSpec = () =>
      defineQuery({
        fields: {
          a: q.string(),
          b: q.string(),
        },
      });

    it("throws when filter count exceeds max", () => {
      expect(() =>
        QueryWhereEngine.buildFilters({ a: "1", b: "2" }, makeSpec(), 1),
      ).toThrow("Too many filters");
    });

    it("passes when filter count is within max", () => {
      const result = QueryWhereEngine.buildFilters(
        { a: "1", b: "2" },
        makeSpec(),
        10,
      );
      expect(result.filters).toHaveLength(2);
    });
  });

  describe("prototype-chain keys", () => {
    const hostileKeys = ["constructor", "toString", "valueOf", "__proto__"];

    for (const key of hostileKeys) {
      it(`rejects '${key}' as unknown field instead of crashing`, () => {
        expect(() =>
          QueryWhereEngine.buildFilters({ [key]: 1 }, TEST_SPEC),
        ).toThrow(QuerioError);
      });
    }

    it("rejects a hostile key as an operator", () => {
      expect(() =>
        QueryWhereEngine.buildFilters(
          { status: { constructor: "ACTIVE" } },
          TEST_SPEC,
        ),
      ).toThrow(QuerioError);
    });
  });
});
