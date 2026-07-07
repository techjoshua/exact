import { describe, expect, it } from "vitest";
import { Fragment, jsx, jsxs } from "./jsx-runtime.js";

describe("@exact/jsx-runtime", () => {
  it("creates vnodes and normalizes children", () => {
    const vnode = jsxs("ul", {
      children: [
        jsx("li", { children: "A" }),
        jsx("li", { children: "B" })
      ]
    });

    expect(vnode.type).toBe("ul");
    expect(vnode.children).toHaveLength(2);
  });

  it("supports fragments", () => {
    const vnode = jsxs(Fragment, { children: ["a", "b"] });
    expect(vnode.type).toBe(Fragment);
    expect(vnode.children).toEqual(["a", "b"]);
  });
});
