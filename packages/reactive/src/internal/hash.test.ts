import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonicalJson, hashStringSequence } from "./hash.js";

describe("canonical reactive hashing", () => {
  it("is stable across object property order and Unicode input", () => {
    const left = { label: "é😀", nested: { second: 2, first: 1 } };
    const right = { nested: { first: 1, second: 2 }, label: "é😀" };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCanonicalJson(left, "test")).toBe(hashCanonicalJson(right, "test"));
    expect(hashCanonicalJson(left, "other")).not.toBe(hashCanonicalJson(right, "test"));
  });

  it("uses JSON number semantics and ordered sequence framing", () => {
    expect(hashCanonicalJson(-0, "number")).toBe(hashCanonicalJson(0, "number"));
    expect(hashStringSequence(["ab", "c"], "items")).not.toBe(hashStringSequence(["a", "bc"], "items"));
    expect(hashStringSequence(["a", "b"], "items")).not.toBe(hashStringSequence(["b", "a"], "items"));
  });

  it("rejects values outside the strict JSON projection", () => {
    expect(() => hashCanonicalJson(undefined, "test")).toThrow();
    expect(() => hashCanonicalJson(Number.NaN, "test")).toThrow();
    expect(() => hashCanonicalJson([, 1], "test")).toThrow();
    expect(() => hashCanonicalJson({ get value() { return 1; } }, "test")).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => hashCanonicalJson(cyclic, "test")).toThrow();
  });
});
