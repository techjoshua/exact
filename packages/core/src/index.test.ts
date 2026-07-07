import { describe, expect, it, vi } from "vitest";
import { createComponentInstance, createContext, createRef, createVNode, isVNode, renderInstance, type Component } from "./index.js";
import { flushSync, unwrap } from "@exact/reactive";

describe("@exact/core", () => {
  it("constructs once and renders repeatedly from tracked state", () => {
    const constructed = vi.fn();
    const rendered = vi.fn();

    function Counter(this: Component<{ count: number }>) {
      constructed();
      this.state.count = 0;
      return () => {
        rendered();
        return Number(this.state.count) > 0
          ? createVNode("span", null, "positive")
          : createVNode("span", null, "zero");
      };
    }

    const instance = createComponentInstance(Counter, {});
    renderInstance(instance, () => renderInstance(instance, () => undefined));
    instance.state.count = 1;
    flushSync();

    expect(constructed).toHaveBeenCalledTimes(1);
    expect(rendered).toHaveBeenCalledTimes(2);
  });

  it("reruns task dependencies and aborts previous work", () => {
    const aborts: boolean[] = [];

    function Search(this: Component<{ query: string }>) {
      this.state.query = "a";
      this.task(this.state.query, (query, { signal }) => {
        expect(typeof query).toBe("string");
        signal.addEventListener("abort", () => aborts.push(true));
      });
      return () => null;
    }

    const instance = createComponentInstance(Search, {});
    instance.state.query = "b";
    flushSync();

    expect(aborts).toEqual([true]);
  });

  it("scopes contexts to descendants and stores refs", () => {
    const token = createContext<{ name: string }>("user");
    const input = createRef<{ focus(): void }>("input");

    function Parent(this: Component<{}>) {
      this.setContext(token, { name: "Ada" });
      return () => null;
    }

    const parent = createComponentInstance(Parent, {});
    const child = createComponentInstance(function Child(this: Component<{}>) {
      const binding = this.ref(input);
      binding.fulfill({ focus() {} });
      expect(unwrap(this.getContext(token).name)).toBe("Ada");
      return () => null;
    }, {}, parent);

    expect(child.refs.get(input)).toBeDefined();
  });

  it("creates a keyed list fragment through this.map", () => {
    const instance = createComponentInstance(function List(this: Component<{}>) {
      return () => this.map(
        [{ id: "a" }, { id: "b" }],
        item => item.id,
        item => createVNode("li", null, item.id)
      );
    }, {});

    const nodes = renderInstance(instance, () => undefined);
    expect(nodes).toHaveLength(1);
    expect(isVNode(nodes[0])).toBe(true);
    expect(isVNode(nodes[0]) ? nodes[0].type : undefined).toBe(Symbol.for("exact.fragment"));
  });

  it("prevents child components from writing to parent-owned props", () => {
    function Child(this: Component<{}>, props: { text: string }) {
      return () => {
        expect(() => {
          props.text = "changed";
        }).toThrow(TypeError);
        return createVNode("span", null, props.text);
      };
    }

    const instance = createComponentInstance(Child, { text: "original" });
    const nodes = renderInstance(instance, () => undefined);

    expect(unwrap(isVNode(nodes[0]) ? nodes[0].children[0] : undefined)).toBe("original");
  });
});
