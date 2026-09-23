import { describe, expect, it } from "bun:test";
import { OpBuilder, op } from "../../packages/core/src/operators/operators";
import type { FilterOperator } from "../../packages/core/src/operators/types";

describe("OpBuilder", () => {
  it("should create a builder with eq", () => {
    const builder = new OpBuilder(["eq"]);
    expect(builder.done()).toEqual(["eq"]);
  });

  it("should chain multiple operators", () => {
    const builder = new OpBuilder(["eq"]);
    builder.notEqual().contains();
    expect(builder.done()).toEqual(["eq", "neq", "contains"]);
  });

  const singleOps: [keyof typeof op, FilterOperator][] = [
    ["equal", "eq"],
    ["notEqual", "neq"],
    ["greaterThan", "gt"],
    ["greaterThanOrEqual", "gte"],
    ["lessThan", "lt"],
    ["lessThanOrEqual", "lte"],
    ["contains", "contains"],
    ["startsWith", "startsWith"],
    ["endsWith", "endsWith"],
    ["in", "in"],
    ["notIn", "notIn"],
    ["isNull", "isNull"],
    ["isNotNull", "isNotNull"],
  ];

  for (const [method, expected] of singleOps) {
    it(`op.${method}() should produce ['${expected}']`, () => {
      expect(op[method]().done()).toEqual([expected]);
    });
  }

  it("should chain multiple operators from a starting point", () => {
    const result = op.equal().notEqual().contains().startsWith().done();
    expect(result).toEqual(["eq", "neq", "contains", "startsWith"]);
  });

  it("should return a copy of the operators array", () => {
    const builder = op.equal();
    const result1 = builder.done();
    const result2 = builder.done();
    expect(result1).toEqual(result2);
    expect(result1).not.toBe(result2);
  });
});
