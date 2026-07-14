import { describe, expect, it } from "vitest";
import { sameJsonData } from "./json.js";

describe("bounded JSON equality", () => {
  it("compares property-order-independent JSON without requiring shared identity", () => {
    const shared = { value: 1 };
    expect(sameJsonData({ right: shared, left: shared }, { left: { value: 1 }, right: { value: 1 } })).toBe(true);
  });

  it("fails closed for cycles, getters, sparse arrays, and non-JSON scalars", () => {
    const left: Record<string, unknown> = {};
    const right: Record<string, unknown> = {};
    left.self = left;
    right.self = right;
    expect(sameJsonData(left, right)).toBe(false);
    expect(sameJsonData(left, left)).toBe(false);
    expect(sameJsonData(Object.defineProperty({}, "value", { enumerable: true, get: () => 1 }), { value: 1 })).toBe(false);
    expect(sameJsonData(Array(1), Array(1))).toBe(false);
    expect(sameJsonData(undefined, undefined)).toBe(false);
    expect(sameJsonData(Number.NaN, Number.NaN)).toBe(false);
  });

  it("stops at its explicit work budget", () => {
    expect(sameJsonData([1, 2, 3], [1, 2, 3], { maxComparisons: 2 })).toBe(false);
  });
});
