/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createRef, type Child, type Component } from "@exact/core";
import { jsx, jsxs } from "@exact/jsx-runtime";
import { flushSync } from "@exact/reactive";
import { render } from "./index.js";

describe("@exact/dom", () => {
  it("mounts and updates a component", () => {
    let instance!: Component<{ count: number }>;
    const rendered = vi.fn();

    function Counter(this: Component<{ count: number }>) {
      instance = this;
      this.state.count = 0;
      return () => {
        rendered();
        return jsx("button", { children: this.state.count });
      };
    }

    const container = document.createElement("div");
    render(jsx(Counter, {}), container);

    expect(container.textContent).toBe("0");
    instance.state.count = 2;
    flushSync();
    expect(container.textContent).toBe("2");
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("delegates events and preserves instance access", () => {
    let clicked = 0;

    function Button(this: Component<{}>) {
      return () => jsx("button", { onClick: () => clicked++, children: "Click" });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(clicked).toBe(1);
  });

  it("replaces delegated event handlers", () => {
    let button!: Component<{ mode: "a" | "b" }>;
    const first = vi.fn();
    const second = vi.fn();

    function Button(this: Component<{ mode: "a" | "b" }>) {
      button = this;
      this.state.mode = "a";

      return () => jsx("button", {
        onClick: this.state.mode == "a" ? first : second,
        children: "Click"
      });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);
    const element = container.querySelector("button")!;

    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.state.mode = "b";
    flushSync();
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("removes delegated event handlers", () => {
    let button!: Component<{ enabled: boolean }>;
    const clicked = vi.fn();

    function Button(this: Component<{ enabled: boolean }>) {
      button = this;
      this.state.enabled = true;

      return () => this.state.enabled == true
        ? jsx("button", { onClick: clicked, children: "Click" })
        : jsx("button", { children: "Click" });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);
    const element = container.querySelector("button")!;

    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.state.enabled = false;
    flushSync();
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("fulfills refs", () => {
    const buttonRef = createRef<HTMLButtonElement>("button");
    let instance!: Component<{}>;

    function Button(this: Component<{}>) {
      instance = this;
      return () => jsx("button", { ref: this.ref(buttonRef), children: "Save" });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);

    expect(instance.refs.get(buttonRef)).toBe(container.querySelector("button"));
  });

  it("clears the previous ref when a DOM node receives a new ref", () => {
    const firstRef = createRef<HTMLButtonElement>("first");
    const secondRef = createRef<HTMLButtonElement>("second");
    let instance!: Component<{ useFirst: boolean }>;

    function Button(this: Component<{ useFirst: boolean }>) {
      instance = this;
      this.state.useFirst = true;

      return () => jsx("button", {
        ref: this.state.useFirst == true ? this.ref(firstRef) : this.ref(secondRef),
        children: "Save"
      });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);
    const button = container.querySelector("button");
    expect(instance.refs.get(firstRef)).toBe(button);

    instance.state.useFirst = false;
    flushSync();

    expect(instance.refs.get(firstRef)).toBeUndefined();
    expect(instance.refs.get(secondRef)).toBe(button);
  });

  it("updates className, boolean properties, and style props", () => {
    let instance!: Component<{ disabled: boolean; tone: string; compact: boolean }>;

    function Button(this: Component<{ disabled: boolean; tone: string; compact: boolean }>) {
      instance = this;
      this.state.disabled = true;
      this.state.tone = "red";
      this.state.compact = false;

      return () => jsx("button", {
        className: this.state.compact == true ? "compact" : "spacious",
        disabled: this.state.disabled,
        style: {
          color: this.state.tone,
          backgroundColor: this.state.compact == true ? "black" : undefined
        },
        children: "Save"
      });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);
    const button = container.querySelector("button")!;

    expect(button.className).toBe("spacious");
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.style.color).toBe("red");
    expect(button.style.backgroundColor).toBe("");

    instance.state.disabled = false;
    instance.state.tone = "blue";
    instance.state.compact = true;
    flushSync();

    expect(button.className).toBe("compact");
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.style.color).toBe("blue");
    expect(button.style.backgroundColor).toBe("black");
  });

  it("removes replaced style object properties", () => {
    let instance!: Component<{ compact: boolean }>;

    function Box(this: Component<{ compact: boolean }>) {
      instance = this;
      this.state.compact = true;

      return () => jsx("div", {
        style: this.state.compact == true
          ? { color: "red", paddingTop: "4px" }
          : { color: "blue" }
      });
    }

    const container = document.createElement("div");
    render(jsx(Box, {}), container);
    const box = container.querySelector("div")!;
    expect(box.style.color).toBe("red");
    expect(box.style.paddingTop).toBe("4px");

    instance.state.compact = false;
    flushSync();

    expect(box.style.color).toBe("blue");
    expect(box.style.paddingTop).toBe("");
  });

  it("updates primitive props.children without rerendering parent or child", () => {
    let instance!: Component<{ message: string }>;
    const parentRendered = vi.fn();
    const childRendered = vi.fn();

    function Wrapper(this: Component<{}>, props: { children?: Child | Child[] }) {
      return () => {
        childRendered();
        return jsx("section", { children: props.children });
      };
    }

    function Parent(this: Component<{ message: string }>) {
      instance = this;
      this.state.message = "Hello";

      return () => {
        parentRendered();
        return jsx(Wrapper, { children: this.state.message });
      };
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);

    expect(container.textContent).toBe("Hello");
    instance.state.message = "Goodbye";
    flushSync();

    expect(container.textContent).toBe("Goodbye");
    expect(parentRendered).toHaveBeenCalledTimes(1);
    expect(childRendered).toHaveBeenCalledTimes(1);
  });

  it("updates a props.children list fragment without rerendering parent or child", () => {
    let instance!: Component<{ items: { id: string; label: string }[] }>;
    const parentRendered = vi.fn();
    const childRendered = vi.fn();

    function Wrapper(this: Component<{}>, props: { children?: Child | Child[] }) {
      return () => {
        childRendered();
        return jsx("section", { children: props.children });
      };
    }

    function Parent(this: Component<{ items: { id: string; label: string }[] }>) {
      instance = this;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ];

      return () => {
        parentRendered();
        return jsx(Wrapper, {
          children: this.map(
            this.state.items,
            item => item.id,
            item => jsx("span", { children: item.label })
          )
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);

    instance.state.items = [
      { id: "b", label: "B" },
      { id: "a", label: "A" },
      { id: "c", label: "C" }
    ];
    flushSync();

    expect(Array.from(container.querySelectorAll("span")).map(item => item.textContent)).toEqual(["B", "A", "C"]);
    expect(parentRendered).toHaveBeenCalledTimes(1);
    expect(childRendered).toHaveBeenCalledTimes(1);
  });

  it("rerenders a wrapper when props.children structure is replaced", () => {
    let parent!: Component<{ mode: "one" | "two" }>;
    const parentRendered = vi.fn();
    const wrapperRendered = vi.fn();

    function One() {
      return () => jsx("span", { children: "one" });
    }

    function Two() {
      return () => jsx("strong", { children: "two" });
    }

    function Wrapper(this: Component<{}>, props: { children?: Child | Child[] }) {
      return () => {
        wrapperRendered();
        return jsx("section", { children: props.children });
      };
    }

    function Parent(this: Component<{ mode: "one" | "two" }>) {
      parent = this;
      this.state.mode = "one";

      return () => {
        parentRendered();
        return jsx(Wrapper, {
          children: this.state.mode == "one" ? jsx(One, {}) : jsx(Two, {})
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    expect(container.innerHTML).toContain("<span>one</span>");

    parent.state.mode = "two";
    flushSync();

    expect(container.textContent).toBe("two");
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelectorAll("strong")).toHaveLength(1);
    expect(parentRendered).toHaveBeenCalledTimes(2);
    expect(wrapperRendered).toHaveBeenCalledTimes(2);
  });

  it("replaces text bindings when a text vnode changes sources", () => {
    let parent!: Component<{ useA: boolean; a: string; b: string }>;

    function Parent(this: Component<{ useA: boolean; a: string; b: string }>) {
      parent = this;
      this.state.useA = true;
      this.state.a = "A";
      this.state.b = "B";

      return () => jsx("span", {
        children: this.state.useA == true ? this.state.a : this.state.b
      });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    expect(container.textContent).toBe("A");

    parent.state.useA = false;
    flushSync();
    expect(container.textContent).toBe("B");

    parent.state.a = "old";
    flushSync();
    expect(container.textContent).toBe("B");

    parent.state.b = "new";
    flushSync();
    expect(container.textContent).toBe("new");
  });

  it("updates primitive child component props without rerendering the child", () => {
    let parent!: Component<{ text: string }>;
    const childRendered = vi.fn();

    function Label(this: Component<{}>, props: { text: string }) {
      return () => {
        childRendered();
        return jsx("span", { children: props.text });
      };
    }

    function Parent(this: Component<{ text: string }>) {
      parent = this;
      this.state.text = "Hello";
      return () => jsx(Label, { text: this.state.text });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);

    expect(container.textContent).toBe("Hello");
    parent.state.text = "Goodbye";
    flushSync();

    expect(container.textContent).toBe("Goodbye");
    expect(childRendered).toHaveBeenCalledTimes(1);
  });

  it("rerenders a child component when updated props drive control flow", () => {
    let parent!: Component<{ mode: "compact" | "full" }>;
    const childRendered = vi.fn();

    function Panel(this: Component<{}>, props: { mode: "compact" | "full" }) {
      return () => {
        childRendered();
        return props.mode == "compact"
          ? jsx("span", { children: "Compact" })
          : jsx("strong", { children: "Full" });
      };
    }

    function Parent(this: Component<{ mode: "compact" | "full" }>) {
      parent = this;
      this.state.mode = "compact";
      return () => jsx(Panel, { mode: this.state.mode });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    const panelNode = container.firstChild;
    expect(container.textContent).toBe("Compact");

    parent.state.mode = "full";
    flushSync();

    expect(container.textContent).toBe("Full");
    expect(container.querySelector("strong")).toBeTruthy();
    expect(childRendered).toHaveBeenCalledTimes(2);
    expect(container.firstChild).toBe(panelNode);
  });

  it("reuses keyed list nodes across reorder", () => {
    let instance!: Component<{ items: { id: string; label: string }[] }>;
    const rendered = vi.fn();

    function List(this: Component<{ items: { id: string; label: string }[] }>) {
      instance = this;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ];

      return () => {
        rendered();
        return jsxs("ul", {
          children: this.map(
            this.state.items,
            item => item.id,
            item => jsx("li", { children: item.label })
          )
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(List, {}), container);
    const firstB = container.querySelectorAll("li")[1];

    instance.state.items = [
      { id: "b", label: "B" },
      { id: "a", label: "A" }
    ];
    flushSync();

    expect(container.querySelectorAll("li")[0]).toBe(firstB);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("adds a keyed child without rerendering the parent", () => {
    let instance!: Component<{ items: { id: string; label: string }[] }>;
    const rendered = vi.fn();

    function List(this: Component<{ items: { id: string; label: string }[] }>) {
      instance = this;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ];

      return () => {
        rendered();
        return jsxs("ul", {
          children: this.map(
            this.state.items,
            item => item.id,
            item => jsx("li", { children: item.label })
          )
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(List, {}), container);

    instance.state.items = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" }
    ];
    flushSync();

    expect(Array.from(container.querySelectorAll("li")).map(item => item.textContent)).toEqual(["A", "B", "C"]);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("removes a keyed child without rerendering the parent", () => {
    let instance!: Component<{ items: { id: string; label: string }[] }>;
    const rendered = vi.fn();

    function List(this: Component<{ items: { id: string; label: string }[] }>) {
      instance = this;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" }
      ];

      return () => {
        rendered();
        return jsxs("ul", {
          children: this.map(
            this.state.items,
            item => item.id,
            item => jsx("li", { children: item.label })
          )
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(List, {}), container);
    const removed = container.querySelectorAll("li")[1];

    instance.state.items = [
      { id: "a", label: "A" },
      { id: "c", label: "C" }
    ];
    flushSync();

    expect(Array.from(container.querySelectorAll("li")).map(item => item.textContent)).toEqual(["A", "C"]);
    expect(Array.from(container.querySelectorAll("li"))).not.toContain(removed);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("preserves keyed child component instances across reorder", () => {
    let list!: Component<{ items: { id: string; label: string }[] }>;
    const constructed: string[] = [];
    const rendered = vi.fn();

    function Row(this: Component<{}>, props: { id: string; label: string }) {
      constructed.push(String(props.id));
      return () => {
        rendered();
        return jsx("li", { children: props.label });
      };
    }

    function List(this: Component<{ items: { id: string; label: string }[] }>) {
      list = this;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ];

      return () => jsxs("ul", {
        children: this.map(
          this.state.items,
          item => item.id,
          item => jsx(Row, { id: item.id, label: item.label })
        )
      });
    }

    const container = document.createElement("div");
    render(jsx(List, {}), container);
    const firstB = container.querySelectorAll("li")[1];

    list.state.items = [
      { id: "b", label: "B" },
      { id: "a", label: "A" }
    ];
    flushSync();

    expect(container.querySelectorAll("li")[0]).toBe(firstB);
    expect(constructed).toEqual(["a", "b"]);
    expect(rendered).toHaveBeenCalledTimes(2);
  });

  it("unmounts keyed child components and aborts their tasks on removal", () => {
    let list!: Component<{ items: { id: string }[] }>;
    const unmounted: string[] = [];
    const aborted: string[] = [];

    function Row(this: Component<{}>, props: { id: string }) {
      this.onUnmount(() => unmounted.push(String(props.id)));
      this.task(({ signal }) => {
        signal.addEventListener("abort", () => aborted.push(String(props.id)));
      });
      return () => jsx("li", { children: props.id });
    }

    function List(this: Component<{ items: { id: string }[] }>) {
      list = this;
      this.state.items = [{ id: "a" }, { id: "b" }];

      return () => jsx("ul", {
        children: this.map(
          this.state.items,
          item => item.id,
          item => jsx(Row, { id: item.id })
        )
      });
    }

    const container = document.createElement("div");
    render(jsx(List, {}), container);

    list.state.items = [{ id: "a" }];
    flushSync();

    expect(container.textContent).toBe("a");
    expect(unmounted).toEqual(["b"]);
    expect(aborted).toEqual(["b"]);
  });

  it("stops removed list fragment watchers", () => {
    let parent!: Component<{ show: boolean; items: { id: string; label: string }[] }>;

    function Parent(this: Component<{ show: boolean; items: { id: string; label: string }[] }>) {
      parent = this;
      this.state.show = true;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ];

      return () => this.state.show == true
        ? jsx("section", {
          children: this.map(
            this.state.items,
            item => item.id,
            item => jsx("span", { children: item.label })
          )
        })
        : jsx("section", { children: "empty" });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    expect(container.textContent).toBe("AB");

    parent.state.show = false;
    flushSync();
    expect(container.textContent).toBe("empty");

    parent.state.items = [{ id: "c", label: "C" }];
    flushSync();
    expect(container.textContent).toBe("empty");
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("clears refs when keyed DOM nodes are removed", () => {
    const itemRef = createRef<HTMLLIElement>("item");
    let list!: Component<{ items: { id: string }[] }>;

    function List(this: Component<{ items: { id: string }[] }>) {
      list = this;
      this.state.items = [{ id: "a" }];

      return () => jsx("ul", {
        children: this.map(
          this.state.items,
          item => item.id,
          item => jsx("li", { ref: this.ref(itemRef), children: item.id })
        )
      });
    }

    const container = document.createElement("div");
    render(jsx(List, {}), container);
    expect(list.refs.get(itemRef)).toBe(container.querySelector("li"));

    list.state.items = [];
    flushSync();

    expect(container.querySelector("li")).toBeNull();
    expect(list.refs.get(itemRef)).toBeUndefined();
  });

  it("clears refs when DOM nodes are replaced", () => {
    const buttonRef = createRef<HTMLButtonElement>("button");
    let parent!: Component<{ mode: "button" | "input" }>;

    function Parent(this: Component<{ mode: "button" | "input" }>) {
      parent = this;
      this.state.mode = "button";

      return () => this.state.mode == "button"
        ? jsx("button", { ref: this.ref(buttonRef), children: "Save" })
        : jsx("input", { value: "Saved" });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    expect(parent.refs.get(buttonRef)).toBe(container.querySelector("button"));

    parent.state.mode = "input";
    flushSync();

    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("input")).toBeTruthy();
    expect(parent.refs.get(buttonRef)).toBeUndefined();
  });

  it("unmounts and removes the previous root when rendering a new root", () => {
    const unmounted = vi.fn();

    function First(this: Component<{}>) {
      this.onUnmount(unmounted);
      return () => jsx("section", { children: jsx("span", { children: "first" }) });
    }

    function Second() {
      return () => jsx("article", { children: "second" });
    }

    const container = document.createElement("div");
    render(jsx(First, {}), container);
    expect(container.textContent).toBe("first");

    render(jsx(Second, {}), container);

    expect(container.textContent).toBe("second");
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("article")).toBeTruthy();
    expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it("does not leave orphan DOM when nested components are replaced", () => {
    let parent!: Component<{ mode: "one" | "two" }>;

    function One() {
      return () => jsx("span", { children: "one" });
    }

    function Two() {
      return () => jsx("strong", { children: "two" });
    }

    function Parent(this: Component<{ mode: "one" | "two" }>) {
      parent = this;
      this.state.mode = "one";

      return () => this.state.mode == "one"
        ? jsx("section", { children: jsx(One, {}) })
        : jsx("section", { children: jsx(Two, {}) });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    expect(container.innerHTML).toContain("<span>one</span>");

    parent.state.mode = "two";
    flushSync();

    expect(container.textContent).toBe("two");
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelectorAll("strong")).toHaveLength(1);
  });
});
