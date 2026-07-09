/** @jsxImportSource @exact/jsx-runtime */
import { describe, expect, it } from "vitest";
import { createRef, getCellVNode, isCellVNode, type Component, type RefBinding } from "@exact/core";
import { _ } from "./jsx-runtime.js";
import type { JSX } from "./jsx-runtime.js";

type LabelProps = {
  text: string;
  children?: JSX.Element;
};

function Label(this: Component<{}>, props: LabelProps) {
  return () => <span className="label">{props.text}{props.children}</span>;
}

describe("@exact/jsx-runtime types", () => {
  it("compiles TSX through the automatic runtime", () => {
    const button = createRef<HTMLButtonElement>("button");
    const ref = { key: button, owner: undefined as never, fulfill() {} } satisfies RefBinding<HTMLButtonElement>;
    const event: JSX.EventHandler = mouseEvent => {
      expect(mouseEvent.type).toBe("click");
    };

    const vnode = (
      <section className="panel" data-kind="example">
        <Label text="Save">
          <button
            ref={ref}
            disabled={false}
            onClick={event}
            style={{ backgroundColor: "black", opacity: 1 }}
          >
            Go
          </button>
        </Label>
        <_ key="tail">tail</_>
      </section>
    );

    expect(isCellVNode(vnode)).toBe(true);
    if (!isCellVNode(vnode)) throw new Error("Expected cell vnode");
    const inner = getCellVNode(vnode);
    expect(inner.type).toBe("section");
    expect(inner.children).toHaveLength(2);
  });
});
