import { describe, expect, it } from "vitest";
import { getCellVNode, isCellVNode } from "@exact/core";
import { Fragment, jsx, jsxs } from "./jsx-runtime.js";

describe("@exact/jsx-runtime", () => {
  it("creates vnodes and normalizes children", () => {
    const vnode = jsxs("ul", {
      children: [
        jsx("li", { children: "A" }),
        jsx("li", { children: "B" })
      ]
    });

    expect(isCellVNode(vnode)).toBe(true);
    if (!isCellVNode(vnode)) throw new Error("Expected cell vnode");
    const inner = getCellVNode(vnode);
    expect(inner.type).toBe("ul");
    expect(inner.children).toHaveLength(2);
    expect(inner.children.every(isCellVNode)).toBe(true);
  });

  it("supports fragments", () => {
    const vnode = jsxs(Fragment, { children: ["a", "b"] });
    expect(isCellVNode(vnode)).toBe(true);
    if (!isCellVNode(vnode)) throw new Error("Expected cell vnode");
    const inner = getCellVNode(vnode);
    expect(inner.type).toBe(Fragment);
    expect(inner.children).toEqual(["a", "b"]);
  });
});
