/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  createCompiledVNode,
  createVNode,
  createDynamicChild,
  createExpression,
  ErrorContext,
  Fragment,
  createErrorContext,
  createRef,
  type Child,
  type Component,
  type ErrorContextValue,
  type ErrorReport,
  type LogEvent,
  type Logger
} from "@exact/core";
import { jsx, jsxs } from "@exact/jsx";
import { createEffectScope, flushSync, watch } from "@exact/reactive";
import { adoptStatic, percent, px, rem, render, unmount } from "./index.js";
import { mountedDomNodes, placeMountedBefore } from "./placement.js";

describe("@exact/dom", () => {
  it("moves an adopted boundary as one start-to-end DOM range", () => {
    const container = document.createElement("div");
    const start = document.createComment("exact:component:0");
    const child = document.createElement("p");
    const end = document.createComment("/exact:component:0");
    const anchor = document.createElement("i");
    container.append(start, child, end, anchor);
    function Boundary() { return null; }
    const mounted = {
      vnode: createVNode(Boundary, null),
      dom: start,
      end,
      scope: createEffectScope(),
      children: [{ vnode: createVNode("p", null), dom: child, scope: createEffectScope(), children: [] }]
    };
    placeMountedBefore({ debugMarkers: false } as any, container, mounted, anchor);
    expect(mountedDomNodes(mounted)).toEqual([start, child, end]);
    expect(Array.from(container.childNodes)).toEqual([start, child, end, anchor]);
  });
  it("moves only the out-of-order keyed range for a simple rotation", () => {
    const container = document.createElement("div");
    let list!: Component<{ items: string[] }>;
    function List(this: Component<{ items: string[] }>) {
      list = this;
      this.state.items = ["a", "b", "c"];
      return () => jsx("ul", { children: this.map(this.state.items, item => item, item => jsx("li", { children: item })) });
    }
    render(jsx(List, {}), container);
    const original = Node.prototype.insertBefore;
    let placements = 0;
    Node.prototype.insertBefore = function<T extends Node>(this: Node, node: T, before: Node | null): T {
      if (this === container.querySelector("ul")) placements++;
      return original.call(this, node, before) as T;
    };
    try {
      list.state.items.splice(0, 3, "c", "a", "b");
      flushSync();
    } finally {
      Node.prototype.insertBefore = original;
    }
    expect(Array.from(container.querySelectorAll("li"), item => item.textContent)).toEqual(["c", "a", "b"]);
    // One keyed range moves; compiled cells own an anchor and an element.
    expect(placements).toBe(2);
  });
  it("reuses keyed list render results across unrelated parent rerenders", () => {
    const container = document.createElement("div");
    const itemRender = vi.fn((item: { id: string }) => jsx("li", { children: item.id }));
    function List(this: Component<{ tick: number; items: { id: string }[] }>) {
      this.state.tick = 0;
      this.state.items = [{ id: "a" }, { id: "b" }];
      return () => jsx("button", {
        onClick: () => this.state.tick++,
        children: [String(this.state.tick), this.map(this.state.items, item => item.id, itemRender)]
      });
    }
    render(jsx(List, {}), container);
    expect(itemRender).toHaveBeenCalledTimes(2);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();
    expect(itemRender).toHaveBeenCalledTimes(2);
  });
  it("rejects duplicate this.map keys deterministically", () => {
    const container = document.createElement("div");
    function List(this: Component<{ items: { id: string }[] }>) {
      this.state.items = [{ id: "same" }, { id: "same" }];
      return () => jsx("ul", { children: this.map(this.state.items, item => item.id, item => jsx("li", { children: item.id })) });
    }
    render(jsx(List, {}), container);
    expect(container.textContent).toContain('Duplicate key "same"');
  });
  it("treats an empty string as a stable keyed-list identity", () => {
    const container = document.createElement("div");
    let list!: Component<{ items: string[] }>;
    function List(this: Component<{ items: string[] }>) {
      list = this;
      this.state.items = ["", "a"];
      return () => jsx("ul", { children: this.map(this.state.items, item => item, item => jsx("li", { children: item || "empty" })) });
    }
    render(jsx(List, {}), container);
    const empty = container.querySelectorAll("li")[0];
    list.state.items.reverse();
    flushSync();
    expect(container.querySelectorAll("li")[1]).toBe(empty);
  });
  it("rejects duplicate ordinary vnode keys", () => {
    const container = document.createElement("div");
    function List() {
      return () => jsx("ul", { children: [jsx("li", { key: "same", children: "a" }), jsx("li", { key: "same", children: "b" })] });
    }
    render(jsx(List, {}), container);
    expect(container.textContent).toContain('Duplicate key "same"');
  });
  it("normalizes JSX double-click handlers to the browser dblclick event", () => {
    const container = document.createElement("div");
    let calls = 0;
    render(jsx("button", { onDoubleClick: () => calls++, children: "Double" }), container);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(calls).toBe(1);
  });

  it("preserves the delegated event path when an inner handler removes DOM", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    render(jsx("section", {
      onClick: () => calls.push("outer"),
      children: jsx("button", {
        onClick: () => {
          calls.push("inner");
          container.querySelector("section")!.remove();
        },
        children: "remove"
      })
    }), container);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["inner", "outer"]);
  });

  it("publishes all synchronous event writes as one reactive transition", () => {
    const container = document.createElement("div");
    const scheduled = vi.fn();
    function Form(this: Component<{ first: number; second: number }>) {
      this.state.first = 0;
      this.state.second = 0;
      watch(() => void `${this.state.first}:${this.state.second}`, undefined, { onSchedule: scheduled });
      return () => jsx("button", {
        onClick: () => {
          this.state.first = 1;
          this.state.second = 2;
        },
        children: "update"
      });
    }
    render(jsx(Form, {}), container);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(scheduled).toHaveBeenCalledTimes(1);
  });

  it("runs capture handlers without relying on bubbling delegation", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    render(jsx("section", { onClickCapture: () => calls.push("capture"), children: jsx("button", { children: "Click" }) }), container);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["capture"]);
  });

  it("uses direct listeners for non-bubbling events and cleans them on unmount", () => {
    const container = document.createElement("div");
    let calls = 0;
    render(jsx("input", { onFocus: () => calls++ }), container);
    const input = container.querySelector("input")!;
    input.dispatchEvent(new FocusEvent("focus"));
    render(jsx("p", { children: "removed" }), container);
    input.dispatchEvent(new FocusEvent("focus"));
    expect(calls).toBe(1);
  });
  it("keeps pointer lifecycle handlers direct across keyed movement", () => {
    const container = document.createElement("div");
    let list!: Component<{ items: string[] }>;
    const moves = vi.fn();
    function List(this: Component<{ items: string[] }>) {
      list = this;
      this.state.items = ["a", "b"];
      return () => jsx("section", { children: this.map(this.state.items, item => item, item => jsx("button", { onPointerMove: moves, children: item })) });
    }
    render(jsx(List, {}), container);
    const button = container.querySelectorAll("button")[0]!;
    list.state.items.splice(0, 2, "b", "a");
    flushSync();
    button.dispatchEvent(new Event("pointermove", { bubbles: true }));
    expect(moves).toHaveBeenCalledTimes(1);
  });
  it("normalizes pointer-capture lifecycle events without treating them as capture-phase handlers", () => {
    const container = document.createElement("div");
    const lost = vi.fn();
    render(jsx("button", { onLostPointerCapture: lost, children: "drag" }), container);
    container.querySelector("button")!.dispatchEvent(new Event("lostpointercapture"));
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it("updates a derived prop collection when a canonical record changes membership", () => {
    const container = document.createElement("div");
    let board!: Component<{ tasks: { id: string; status: string }[] }>;
    function Column(this: Component<{}>, props: { tasks: { id: string; status: string }[]; status: string }) {
      // This mirrors compiler output for a component-local filtered list.
      const columnTasks = this.reactive(() => props.tasks.filter(task => task.status === props.status));
      return () => jsx("ul", { children: this.map(columnTasks, task => task.id, task => jsx("li", { children: task.id })) });
    }
    function Board(this: Component<{ tasks: { id: string; status: string }[] }>) {
      board = this;
      this.state.tasks = [{ id: "a", status: "todo" }, { id: "b", status: "done" }];
      return () => jsx("section", { children: [jsx(Column, { tasks: this.state.tasks, status: "todo" }), jsx(Column, { tasks: this.state.tasks, status: "done" })] });
    }
    render(jsx(Board, {}), container);
    board.state.tasks[1]!.status = "todo";
    flushSync();
    expect(Array.from(container.querySelectorAll("ul"), list => list.textContent)).toEqual(["ab", ""]);
  });

  it("does not move keyed cards when an unkeyed marker is inserted beside one", () => {
    const container = document.createElement("div");
    let board!: Component<{ marker?: string }>;
    function Board(this: Component<{ marker?: string }>) {
      board = this;
      this.state.marker = undefined;
      const cards = this.reactive(() => [
        this.state.marker === "a" ? jsx("i", { children: "marker" }) : null,
        jsx("button", { "data-card": "a", children: "a" }),
        jsx("button", { "data-card": "b", children: "b" })
      ]);
      return () => jsx("section", { children: createDynamicChild(() => cards.get()) });
    }
    render(jsx(Board, {}), container);
    const firstCard = container.querySelector('[data-card="a"]');
    board.state.marker = "a";
    flushSync();
    expect(Array.from(container.querySelectorAll("i, button"), node => node.textContent)).toEqual(["marker", "a", "b"]);
    expect(container.querySelector('[data-card="a"]')).toBe(firstCard);
  });

  it("replaces direct event handlers without retaining the previous callback", () => {
    const container = document.createElement("div");
    const first = vi.fn();
    const second = vi.fn();
    render(jsx("input", { onFocus: first }), container);
    render(jsx("input", { onFocus: second }), container);
    container.querySelector("input")!.dispatchEvent(new FocusEvent("focus"));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("uses a direct listener for scroll handlers", () => {
    const container = document.createElement("div");
    const scrolled = vi.fn();
    render(jsx("div", { onScroll: scrolled, children: "Scroll" }), container);
    container.firstElementChild!.dispatchEvent(new Event("scroll"));
    expect(scrolled).toHaveBeenCalledTimes(1);
  });
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
    expect(rendered).toHaveBeenCalledTimes(2);
  });

  it("uses quiet runtime anchors by default", () => {
    function Child() {
      return () => jsx("span", { children: "child" });
    }

    function Parent() {
      return () => jsx("main", { children: jsx(Child, {}) });
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container);

    expect(commentData(container)).toEqual([]);
    expect(container.textContent).toBe("child");
  });

  it("can expose named boundary comments for renderer debugging", () => {
    function Child() {
      return () => jsx("span", { children: "child" });
    }

    function Parent() {
      return () => jsx("main", { children: jsx(Child, {}) });
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container, { debugMarkers: true });

    expect(commentData(container)).toEqual(expect.arrayContaining([
      "exact-component",
      "exact-cell"
    ]));
    expect(container.textContent).toBe("child");
  });

  it("uses the root logger for framework diagnostics", () => {
    const events: LogEvent[] = [];
    const logger: Logger = {
      isEnabled: () => true,
      log: event => events.push(event)
    };

    const container = document.createElement("div");
    render(jsx("span", { children: "first" }), container, { logger });
    render(jsx("strong", { children: "second" }), container, { logger });

    expect(events).toContainEqual(expect.objectContaining({
      level: "trace",
      message: "replace node",
      scope: {
        source: "framework",
        packageName: "dom",
        category: "patch"
      }
    }));
  });

  it("does not retain delegated event handlers after DOM replacement", () => {
    let instance!: Component<{ asButton: boolean }>;
    const clicked = vi.fn();

    function Switcher(this: Component<{ asButton: boolean }>) {
      instance = this;
      this.state.asButton = true;

      return () => this.state.asButton == true
        ? jsx("button", { onClick: clicked, children: "Old" })
        : jsx("span", { children: "New" });
    }

    const container = document.createElement("div");
    render(jsx(Switcher, {}), container);
    const oldButton = container.querySelector("button")!;

    instance.state.asButton = false;
    flushSync();
    container.appendChild(oldButton);
    oldButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(clicked).not.toHaveBeenCalled();
  });

  it("delegates events and preserves instance access", () => {
    let clicked = 0;

    function Button(this: Component<{}>) {
      return () => jsx("button", { onClick: () => clicked++, children: "Click" });
    }

    const container = document.createElement("div");
    render(jsx(Button, {}), container);
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container.querySelector("button")?.firstChild?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(clicked).toBe(2);
  });

  it("respects stopPropagation in delegated event handlers", () => {
    const childClicked = vi.fn();
    const parentClicked = vi.fn();

    function Panel() {
      return () => jsx("section", {
        onClick: parentClicked,
        children: jsx("button", {
          onClick: (event: Event) => {
            event.stopPropagation();
            childClicked();
          },
          children: "Close"
        })
      });
    }

    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    container.querySelector("button")!.firstChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(childClicked).toHaveBeenCalledTimes(1);
    expect(parentClicked).not.toHaveBeenCalled();
  });

  it("delegates dragstart events from text node targets", () => {
    const started = vi.fn();

    function Card() {
      return () => jsx("div", {
        draggable: true,
        onDragStart: started,
        children: "Drag"
      });
    }

    const container = document.createElement("div");
    render(jsx(Card, {}), container);
    container.querySelector("div")!.firstChild!.dispatchEvent(new Event("dragstart", { bubbles: true }));

    expect(started).toHaveBeenCalledTimes(1);
  });

  it("routes event handler failures to the nearest error context", () => {
    let panel!: Component<{ errors: ErrorReport[] }>;

    function Panel(this: Component<{ errors: ErrorReport[] }>) {
      panel = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));

      return () => this.state.errors.length
        ? jsx("p", { children: "Recovered" })
        : jsx("button", {
          onClick: () => {
            throw new Error("click failed");
          },
          children: "Break"
        });
    }

    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(panel.state.errors).toHaveLength(1);
    expect(panel.state.errors[0]!.source).toBe("event");
    expect(container.textContent).toBe("Recovered");
    expect(container.querySelector("button")).toBeNull();
  });

  it("routes direct event handler failures to the nearest error context", () => {
    let panel!: Component<{ errors: ErrorReport[] }>;
    function Panel(this: Component<{ errors: ErrorReport[] }>) {
      panel = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      return () => this.state.errors.length ? jsx("p", { children: "Recovered" }) : jsx("input", { onFocus: () => { throw new Error("focus failed"); } });
    }
    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    container.querySelector("input")!.dispatchEvent(new FocusEvent("focus"));
    flushSync();
    expect(panel.state.errors[0]!.source).toBe("event");
    expect(container.textContent).toBe("Recovered");
  });

  it("routes failures to the nearest nested error context only", () => {
    let parent!: Component<{ errors: ErrorReport[] }>;
    let child!: Component<{ errors: ErrorReport[] }>;

    function ChildBoundary(this: Component<{ errors: ErrorReport[] }>) {
      child = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));

      return () => this.state.errors.length
        ? jsx("p", { children: "Child recovered" })
        : jsx("button", {
          onClick: () => {
            throw new Error("child failed");
          },
          children: "Break child"
        });
    }

    function ParentBoundary(this: Component<{ errors: ErrorReport[] }>) {
      parent = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));

      return () => this.state.errors.length
        ? jsx("p", { children: "Parent recovered" })
        : jsx("section", { children: jsx(ChildBoundary, {}) });
    }

    const container = document.createElement("div");
    render(jsx(ParentBoundary, {}), container);
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(parent.state.errors).toHaveLength(0);
    expect(child.state.errors).toHaveLength(1);
    expect(container.textContent).toBe("Child recovered");
  });

  it("routes child construction failures to the nearest parent error context", () => {
    let parent!: Component<{ errors: ErrorReport[] }>;

    function Broken(): never {
      throw new Error("construct failed");
    }

    function Parent(this: Component<{ errors: ErrorReport[] }>) {
      parent = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));

      return () => this.state.errors.length
        ? jsx("p", { children: "Child failed" })
        : jsx("section", {
          children: jsx(Broken, {})
        });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    flushSync();

    expect(parent.state.errors).toHaveLength(1);
    expect(parent.state.errors[0]!.source).toBe("construct");
    expect(container.textContent).toBe("Child failed");
  });

  it("renders the root default error view for unclaimed event failures", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let errors!: ErrorContextValue;

    function Panel(this: Component<{}>) {
      errors = this.getContext(ErrorContext);
      return () => jsx("button", {
        onClick: () => {
          throw new Error("root failed");
        },
        children: "Break"
      });
    }

    try {
      const container = document.createElement("div");
      render(jsx(Panel, {}), container);
      container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      flushSync();

      expect(errors.errors).toHaveLength(1);
      expect(container.textContent).toContain("Application error");
      expect(container.textContent).toContain("root failed");
    } finally {
      errors.clearAll();
      errorLog.mockRestore();
    }
  });

  it("keeps root default error contexts isolated per container", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let firstErrors!: ErrorContextValue;
    let secondErrors!: ErrorContextValue;

    function First(this: Component<{}>) {
      firstErrors = this.getContext(ErrorContext);
      return () => jsx("button", {
        onClick: () => {
          throw new Error("first failed");
        },
        children: "First"
      });
    }

    function Second(this: Component<{}>) {
      secondErrors = this.getContext(ErrorContext);
      return () => jsx("p", { children: "Second ok" });
    }

    try {
      const first = document.createElement("div");
      const second = document.createElement("div");
      render(jsx(First, {}), first);
      render(jsx(Second, {}), second);

      first.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      flushSync();

      expect(firstErrors).not.toBe(secondErrors);
      expect(firstErrors.errors).toHaveLength(1);
      expect(secondErrors.errors).toHaveLength(0);
      expect(first.textContent).toContain("first failed");
      expect(second.textContent).toBe("Second ok");
    } finally {
      firstErrors?.clearAll();
      secondErrors?.clearAll();
      errorLog.mockRestore();
    }
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

  it("applies select value after options are mounted and can return to the first option", () => {
    let instance!: Component<{ status: "todo" | "doing" | "done" }>;

    function StatusSelect(this: Component<{ status: "todo" | "doing" | "done" }>) {
      instance = this;
      this.state.status = "done";

      return () => jsx("select", {
        value: this.state.status,
        children: [
          jsx("option", { value: "todo", children: "To do" }),
          jsx("option", { value: "doing", children: "Doing" }),
          jsx("option", { value: "done", children: "Done" })
        ]
      });
    }

    const container = document.createElement("div");
    render(jsx(StatusSelect, {}), container);
    const select = container.querySelector("select")!;

    expect(select.value).toBe("done");

    instance.state.status = "todo";
    flushSync();

    expect(select.value).toBe("todo");
  });

  it("does not rewrite unchanged select and option values during rerender", () => {
    let instance!: Component<{ label: string; status: "todo" | "doing" | "done" }>;

    function StatusSelect(this: Component<{ label: string; status: "todo" | "doing" | "done" }>) {
      instance = this;
      this.state.label = "Ready";
      this.state.status = "todo";

      return () => jsx("label", {
        children: [
          jsx("span", { children: this.state.label }),
          jsx("select", {
            value: this.state.status,
            children: [
              jsx("option", { value: "todo", children: "To do" }),
              jsx("option", { value: "doing", children: "Doing" }),
              jsx("option", { value: "done", children: "Done" })
            ]
          })
        ]
      });
    }

    const container = document.createElement("div");
    render(jsx(StatusSelect, {}), container);
    const select = container.querySelector("select")!;
    const options = Array.from(container.querySelectorAll("option"));
    const selectWrites: string[] = [];
    const optionWrites: string[] = [];
    const selectDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!;
    const optionDescriptor = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, "value")!;

    Object.defineProperty(select, "value", {
      get() {
        return selectDescriptor.get!.call(this);
      },
      set(value: string) {
        selectWrites.push(value);
        selectDescriptor.set!.call(this, value);
      },
      configurable: true
    });

    for (const option of options) {
      Object.defineProperty(option, "value", {
        get() {
          return optionDescriptor.get!.call(this);
        },
        set(value: string) {
          optionWrites.push(value);
          optionDescriptor.set!.call(this, value);
        },
        configurable: true
      });
    }

    instance.state.label = "Updated";
    flushSync();

    expect(select.value).toBe("todo");
    expect(Array.from(container.querySelectorAll("option"))).toEqual(options);
    expect(selectWrites).toEqual([]);
    expect(optionWrites).toEqual([]);
  });

  it("keeps compiled controlled select values stable through change events", () => {
    let instance!: Component<{ priority: "low" | "medium" | "high"; label: string }>;

    function PrioritySelect(this: Component<{ priority: "low" | "medium" | "high"; label: string }>) {
      instance = this;
      this.state.priority = "medium";
      this.state.label = "Ready";

      return () => createCompiledVNode("label", {},
        createCompiledVNode("span", {}, createExpression(() => this.state.label)),
        createCompiledVNode("select", {
          value: createExpression(() => this.state.priority),
          onChange: (event: Event) => {
            this.state.priority = (event.currentTarget as HTMLSelectElement).value as "low" | "medium" | "high";
          }
        },
          createCompiledVNode("option", { value: "low" }, "low"),
          createCompiledVNode("option", { value: "medium" }, "medium"),
          createCompiledVNode("option", { value: "high" }, "high")
        )
      );
    }

    const container = document.createElement("div");
    render(createCompiledVNode(PrioritySelect, {}), container);
    const select = container.querySelector("select")!;

    expect(select.value).toBe("medium");

    select.value = "high";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(instance.state.priority).toBe("high");
    expect(select.value).toBe("high");

    instance.state.label = "Updated";
    flushSync();

    expect(instance.state.priority).toBe("high");
    expect(select.value).toBe("high");
  });

  it("keeps focused textarea stable while input updates reactive state", () => {
    let instance!: Component<{ notes: string }>;

    function Notes(this: Component<{ notes: string }>) {
      instance = this;
      this.state.notes = "Initial";

      return () => jsx("textarea", {
        value: this.state.notes,
        onInput: (event: Event) => {
          this.state.notes = (event.target as HTMLTextAreaElement).value;
        }
      });
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    render(jsx(Notes, {}), container);
    const textarea = container.querySelector("textarea")!;
    const valueWrites: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
    Object.defineProperty(textarea, "value", {
      get() {
        return descriptor.get!.call(this);
      },
      set(value: string) {
        valueWrites.push(value);
        descriptor.set!.call(this, value);
      },
      configurable: true
    });

    textarea.value = "Initial!";
    textarea.focus();
    valueWrites.length = 0;
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flushSync();

    expect(instance.state.notes).toBe("Initial!");
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(valueWrites).toEqual([]);
    expect(document.activeElement).toBe(textarea);
    container.remove();
  });

  it("does not rewrite defaultValue on a focused text control", () => {
    let instance!: Component<{ title: string }>;

    function Editor(this: Component<{ title: string }>) {
      instance = this;
      this.state.title = "Initial";

      return () => jsx("input", {
        defaultValue: this.state.title,
        onInput: (event: Event) => {
          this.state.title = (event.target as HTMLInputElement).value;
        }
      });
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    render(jsx(Editor, {}), container);
    const input = container.querySelector("input")!;
    const defaultValueWrites: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "defaultValue")!;
    Object.defineProperty(input, "defaultValue", {
      get() {
        return descriptor.get!.call(this);
      },
      set(value: string) {
        defaultValueWrites.push(value);
        descriptor.set!.call(this, value);
      },
      configurable: true
    });

    input.value = "Initial!";
    input.focus();
    defaultValueWrites.length = 0;
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flushSync();

    expect(instance.state.title).toBe("Initial!");
    expect(container.querySelector("input")).toBe(input);
    expect(defaultValueWrites).toEqual([]);
    expect(document.activeElement).toBe(input);
    container.remove();
  });

  it("keeps compiled textarea stable when a reactive object prop is replaced during input", () => {
    let parent!: Component<{ task: { id: string; notes: string } }>;

    function Editor(
      this: Component<{}>,
      props: {
        task: { id: string; notes: string };
        update(id: string, notes: string): void;
      }
    ) {
      return () => {
        const task = props.task;
        return createCompiledVNode("textarea", {
          value: createExpression(() => task.notes),
          onInput: (event: Event) => {
            props.update(task.id, (event.target as HTMLTextAreaElement).value);
          }
        });
      };
    }

    function Parent(this: Component<{ task: { id: string; notes: string } }>) {
      parent = this;
      this.state.task = { id: "a", notes: "Initial" };
      return () => createCompiledVNode(Editor, {
        task: createExpression(() => this.state.task),
        update: (id: string, notes: string) => {
          this.state.task = { id, notes };
        }
      });
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container);
    const textarea = container.querySelector("textarea")!;
    const insertBefore = vi.spyOn(Node.prototype, "insertBefore");
    const valueWrites: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
    Object.defineProperty(textarea, "value", {
      get() {
        return descriptor.get!.call(this);
      },
      set(value: string) {
        valueWrites.push(value);
        descriptor.set!.call(this, value);
      },
      configurable: true
    });

    textarea.value = "Initial!";
    textarea.focus();
    valueWrites.length = 0;
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flushSync();

    expect(parent.state.task.notes).toBe("Initial!");
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(valueWrites).toEqual([]);
    expect(insertBefore).not.toHaveBeenCalled();
    insertBefore.mockRestore();
  });

  it("normalizes className strings, arrays, and truthy maps", () => {
    let instance!: Component<{ active: boolean; hidden: boolean }>;

    function Panel(this: Component<{ active: boolean; hidden: boolean }>) {
      instance = this;
      this.state.active = true;
      this.state.hidden = false;

      return () => jsx("section", {
        className: ["panel", { active: this.state.active, hidden: this.state.hidden }]
      });
    }

    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    const section = container.querySelector("section")!;

    expect(section.className).toBe("panel active");

    instance.state.active = false;
    instance.state.hidden = true;
    flushSync();

    expect(section.className).toBe("panel hidden");
  });

  it("uses CSS unit helpers as reactive style binding points", () => {
    let instance!: Component<{ height: number; top: number; progress: number }>;
    const rendered = vi.fn();

    function Meter(this: Component<{ height: number; top: number; progress: number }>) {
      instance = this;
      this.state.height = 12;
      this.state.top = 1.5;
      this.state.progress = 50;

      return () => {
        rendered();
        const height = createExpression(() => px(this.state.height));
        const marginTop = createExpression(() => rem(this.state.top));
        const width = createExpression(() => percent(this.state.progress));

        return jsx("div", {
          style: {
            height,
            marginTop,
            width
          }
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(Meter, {}), container);
    const meter = container.querySelector("div")!;

    expect(meter.style.height).toBe("12px");
    expect(meter.style.marginTop).toBe("1.5rem");
    expect(meter.style.width).toBe("50%");

    instance.state.height = 24;
    instance.state.top = 2;
    instance.state.progress = 75;
    flushSync();

    expect(meter.style.height).toBe("24px");
    expect(meter.style.marginTop).toBe("2rem");
    expect(meter.style.width).toBe("75%");
    expect(rendered).toHaveBeenCalledTimes(1);
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

  it("updates reactive text compositions without rerendering the component", () => {
    let instance!: Component<{ first: string; last: string }>;
    const rendered = vi.fn();

    function Person(this: Component<{ first: string; last: string }>) {
      instance = this;
      this.state.first = "Ada";
      this.state.last = "Lovelace";
      const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);

      return () => {
        rendered();
        return jsx("span", { children: fullName });
      };
    }

    const container = document.createElement("div");
    render(jsx(Person, {}), container);
    expect(container.textContent).toBe("Ada Lovelace");

    instance.state.last = "Byron";
    flushSync();

    expect(container.textContent).toBe("Ada Byron");
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("uses reactive values in props and style entries", () => {
    let instance!: Component<{ first: string; last: string; color: string }>;
    const rendered = vi.fn();

    function Person(this: Component<{ first: string; last: string; color: string }>) {
      instance = this;
      this.state.first = "Ada";
      this.state.last = "Lovelace";
      this.state.color = "red";
      const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);
      const tone = this.reactive(() => this.state.color);

      return () => {
        rendered();
        return jsx("span", {
          title: fullName,
          style: { color: tone },
          children: "name"
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(Person, {}), container);
    const span = container.querySelector("span")!;
    expect(span.title).toBe("Ada Lovelace");
    expect(span.style.color).toBe("red");

    instance.state.last = "Byron";
    instance.state.color = "blue";
    flushSync();

    expect(span.title).toBe("Ada Byron");
    expect(span.style.color).toBe("blue");
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("updates compiled prop and text bindings without rerendering the component", () => {
    let instance!: Component<{ label: string; tone: string }>;
    const rendered = vi.fn();

    function Label(this: Component<{ label: string; tone: string }>) {
      instance = this;
      this.state.label = "Ready";
      this.state.tone = "red";

      return () => {
        rendered();
        return createCompiledVNode("span", {
          title: createExpression(() => this.state.label),
          style: { color: createExpression(() => this.state.tone) }
        }, createDynamicChild(() => this.state.label));
      };
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Label, {}), container);
    const span = container.querySelector("span")!;

    expect(span.textContent).toBe("Ready");
    expect(span.title).toBe("Ready");
    expect(span.style.color).toBe("red");

    instance.state.label = "Done";
    instance.state.tone = "blue";
    flushSync();

    expect(span.textContent).toBe("Done");
    expect(span.title).toBe("Done");
    expect(span.style.color).toBe("blue");
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("unwraps reactive component props when children read them", () => {
    let parent!: Component<{ items: { id: string; status: "open" | "done" }[] }>;
    const parentRendered = vi.fn();
    const childRendered = vi.fn();

    function Column(this: Component<{}>, props: { items: { id: string; status: "open" | "done" }[] }) {
      return () => {
        childRendered();
        return jsxs("section", {
          children: [
            jsx("span", { children: props.items.length }),
            jsx("ul", {
              children: props.items.map(item => jsx("li", { children: item.id }))
            })
          ]
        });
      };
    }

    function Board(this: Component<{ items: { id: string; status: "open" | "done" }[] }>) {
      parent = this;
      this.state.items = [
        { id: "a", status: "open" },
        { id: "b", status: "done" }
      ];

      return () => {
        parentRendered();
        return createCompiledVNode(Column, {
          items: createExpression(() => this.state.items.filter(item => item.status === "open"))
        });
      };
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Board, {}), container);

    expect(container.textContent).toBe("1a");
    parent.state.items = [
      { id: "a", status: "open" },
      { id: "b", status: "open" }
    ];
    flushSync();

    expect(container.textContent).toBe("2ab");
    expect(parentRendered).toHaveBeenCalledTimes(1);
    expect(childRendered).toHaveBeenCalledTimes(2);
  });

  it("patches compiled dynamic child branches at their own boundary", () => {
    let instance!: Component<{ mode: "span" | "strong" }>;
    const rendered = vi.fn();

    function Panel(this: Component<{ mode: "span" | "strong" }>) {
      instance = this;
      this.state.mode = "span";

      return () => {
        rendered();
        return createCompiledVNode("section", {}, createDynamicChild(() => this.state.mode == "span"
          ? createCompiledVNode("span", {}, "Span")
          : createCompiledVNode("strong", {}, "Strong")));
      };
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Panel, {}), container);
    const section = container.querySelector("section")!;

    expect(section.textContent).toBe("Span");
    expect(section.querySelector("span")).toBeTruthy();

    instance.state.mode = "strong";
    flushSync();

    expect(container.querySelector("section")).toBe(section);
    expect(section.querySelector("span")).toBeNull();
    expect(section.querySelector("strong")).toBeTruthy();
    expect(section.textContent).toBe("Strong");
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("keeps sibling cell DOM stable when a reactive prop updates", () => {
    let instance!: Component<{ label: string }>;
    const rendered = vi.fn();

    function Panel(this: Component<{ label: string }>) {
      instance = this;
      this.state.label = "Alpha";
      const label = this.reactive(() => this.state.label);

      return () => {
        rendered();
        return jsx("section", {
          children: [
            jsx("span", { title: label, children: "dynamic" }),
            jsx("strong", { children: "stable" })
          ]
        });
      };
    }

    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    const dynamic = container.querySelector("span")!;
    const stable = container.querySelector("strong")!;

    instance.state.label = "Beta";
    flushSync();

    expect(dynamic.title).toBe("Beta");
    expect(container.querySelector("span")).toBe(dynamic);
    expect(container.querySelector("strong")).toBe(stable);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("does not reinsert stable cell ranges during a component rerender", () => {
    let instance!: Component<{ label: string }>;

    function Panel(this: Component<{ label: string }>) {
      instance = this;
      this.state.label = "Alpha";

      return () => jsx("section", {
        children: [
          jsx("span", { children: this.state.label }),
          jsx("strong", { children: "stable" })
        ]
      });
    }

    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    const span = container.querySelector("span")!;
    const strong = container.querySelector("strong")!;
    const insertBefore = vi.spyOn(Node.prototype, "insertBefore");

    instance.state.label = "Beta";
    flushSync();

    expect(container.querySelector("span")).toBe(span);
    expect(container.querySelector("strong")).toBe(strong);
    expect(container.textContent).toBe("Betastable");
    expect(insertBefore).not.toHaveBeenCalled();
    insertBefore.mockRestore();
  });

  it("does not update reactive DOM bindings for structurally identical reloads", () => {
    let instance!: Component<{ user: { name: string; roles: string[] } }>;
    const rendered = vi.fn();
    const titleWrites: string[] = [];

    function Person(this: Component<{ user: { name: string; roles: string[] } }>) {
      instance = this;
      this.state.user = { name: "Ada", roles: ["admin"] };
      const title = this.reactive(() => this.state.user.name);

      return () => {
        rendered();
        return jsx("span", { title, children: "name" });
      };
    }

    const container = document.createElement("div");
    render(jsx(Person, {}), container);
    const span = container.querySelector("span")!;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "title")!;
    Object.defineProperty(span, "title", {
      get() {
        return descriptor.get?.call(this);
      },
      set(value: string) {
        titleWrites.push(value);
        descriptor.set?.call(this, value);
      },
      configurable: true
    });

    instance.state.user = { name: "Ada", roles: ["admin"] };
    flushSync();
    instance.state.user = { name: "Grace", roles: ["admin"] };
    flushSync();

    expect(span.title).toBe("Grace");
    expect(titleWrites).toEqual(["Grace"]);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite unchanged reactive style entries", () => {
    let instance!: Component<{ color: string; padding: string }>;
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

    function Box(this: Component<{ color: string; padding: string }>) {
      instance = this;
      this.state.color = "red";
      this.state.padding = "4px";
      const color = this.reactive(() => this.state.color);
      const paddingTop = this.reactive(() => this.state.padding);

      return () => jsx("div", {
        style: {
          color,
          paddingTop
        }
      });
    }

    const container = document.createElement("div");
    render(jsx(Box, {}), container);
    setProperty.mockClear();

    instance.state.color = "blue";
    flushSync();

    expect(container.querySelector("div")!.style.color).toBe("blue");
    expect(container.querySelector("div")!.style.paddingTop).toBe("4px");
    expect(setProperty).toHaveBeenCalledTimes(1);
    expect(setProperty).toHaveBeenCalledWith("color", "blue");
    setProperty.mockRestore();
  });

  it("updates runtime primitive props.children by rerendering the parent", () => {
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
    expect(parentRendered).toHaveBeenCalledTimes(2);
    expect(childRendered).toHaveBeenCalledTimes(2);
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

  it("updates runtime primitive child component props by rerendering the child", () => {
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
    expect(childRendered).toHaveBeenCalledTimes(2);
  });

  it("updates derived compiled object prop fields without rerendering parent or child", () => {
    let parent!: Component<{ task: { id: string; title: string } }>;
    const parentRendered = vi.fn();
    const childRendered = vi.fn();

    function CardTitle(this: Component<{}>, props: { task: { id: string; title: string } }) {
      const title = this.reactive(() => props.task.title);

      return () => {
        childRendered();
        return createCompiledVNode("span", {}, title);
      };
    }

    function Parent(this: Component<{ task: { id: string; title: string } }>) {
      parent = this;
      this.state.task = { id: "a", title: "First" };
      return () => {
        parentRendered();
        return createCompiledVNode(CardTitle, {
          task: createExpression(() => this.state.task)
        });
      };
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container);
    const span = container.querySelector("span")!;

    parent.state.task = { id: "a", title: "Second" };
    flushSync();

    expect(container.querySelector("span")).toBe(span);
    expect(container.textContent).toBe("Second");
    expect(parentRendered).toHaveBeenCalledTimes(1);
    expect(childRendered).toHaveBeenCalledTimes(1);
  });

  it("updates child bindings when a reactive object prop mutates in place", () => {
    let parent!: Component<{ task: { id: string; title: string } }>;
    const parentRendered = vi.fn();
    const childRendered = vi.fn();

    function CardTitle(this: Component<{}>, props: { task: { id: string; title: string } }) {
      const title = this.reactive(() => props.task.title);

      return () => {
        childRendered();
        return createCompiledVNode("span", {}, title);
      };
    }

    function Parent(this: Component<{ task: { id: string; title: string } }>) {
      parent = this;
      this.state.task = { id: "a", title: "First" };
      return () => {
        parentRendered();
        return createCompiledVNode(CardTitle, {
          task: createExpression(() => this.state.task)
        });
      };
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container);
    const span = container.querySelector("span")!;

    parent.state.task.title = "Second";
    flushSync();

    expect(container.querySelector("span")).toBe(span);
    expect(container.textContent).toBe("Second");
    expect(parentRendered).toHaveBeenCalledTimes(1);
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

  it("keeps queued reactive bindings active when keyed nodes move", () => {
    let instance!: Component<{ items: { id: string; label: string }[] }>;
    const rendered = vi.fn();

    function Row(this: Component<{}>, props: { item: { id: string; label: string } }) {
      return () => {
        rendered();
        return createCompiledVNode("li", {
          title: createExpression(() => props.item.label)
        }, createExpression(() => props.item.label));
      };
    }

    function List(this: Component<{ items: { id: string; label: string }[] }>) {
      instance = this;
      this.state.items = [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ];

      return () => createCompiledVNode("ul", {},
        this.map(
          this.state.items,
          item => item.id,
          item => createCompiledVNode(Row, { item })
        )
      );
    }

    const container = document.createElement("div");
    render(createCompiledVNode(List, {}), container);
    const rows = Array.from(container.querySelectorAll("li"));
    const moved = rows[1]!;

    instance.state.items[1]!.label = "B+";
    instance.state.items = [instance.state.items[1]!, instance.state.items[0]!];
    flushSync();

    expect(container.querySelectorAll("li")[0]).toBe(moved);
    expect(container.contains(moved)).toBe(true);
    expect(moved.textContent).toBe("B+");
    expect(moved.title).toBe("B+");
    expect(rendered).toHaveBeenCalledTimes(2);
  });

  it("updates keyed child component props when list item fields mutate", () => {
    let instance!: Component<{ items: { id: string; label: string; priority: string }[] }>;
    const rendered = vi.fn();

    function Row(this: Component<{}>, props: { item: { id: string; label: string; priority: string } }) {
      return () => {
        rendered();
        return createCompiledVNode("li", {},
          createCompiledVNode("strong", {}, createExpression(() => props.item.label)),
          createCompiledVNode("span", {}, createExpression(() => props.item.priority))
        );
      };
    }

    function List(this: Component<{ items: { id: string; label: string; priority: string }[] }>) {
      instance = this;
      this.state.items = [
        { id: "a", label: "A", priority: "medium" },
        { id: "b", label: "B", priority: "low" }
      ];

      return () => createCompiledVNode("ul", {},
        this.map(
          this.state.items,
          item => item.id,
          item => createCompiledVNode(Row, { item })
        )
      );
    }

    const container = document.createElement("div");
    render(createCompiledVNode(List, {}), container);
    const rows = Array.from(container.querySelectorAll("li"));

    instance.state.items[0]!.label = "A+";
    instance.state.items[0]!.priority = "high";
    flushSync();

    expect(Array.from(container.querySelectorAll("li"))).toEqual(rows);
    expect(container.querySelectorAll("li")[0]!.textContent).toBe("A+high");
    expect(rendered).toHaveBeenCalledTimes(2);
  });

  it("does not reuse keyed children as unkeyed siblings during patching", () => {
    let instance!: Component<{ label: string }>;

    function Panel(this: Component<{ label: string }>) {
      instance = this;
      this.state.label = "first";

      return () => jsx("section", {
        children: [
          jsx("h1", { children: "Heading" }),
          jsx("article", { key: "report", children: this.state.label })
        ]
      });
    }

    const container = document.createElement("div");
    render(jsx(Panel, {}), container);
    const heading = container.querySelector("h1")!;
    const article = container.querySelector("article")!;

    instance.state.label = "second";
    flushSync();

    expect(container.querySelector("h1")).toBe(heading);
    expect(container.querySelector("article")).toBe(article);
    expect(container.textContent).toBe("Headingsecond");
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

  it("stops removed dynamic child watchers", () => {
    let parent!: Component<{ show: boolean; label: string }>;

    function Parent(this: Component<{ show: boolean; label: string }>) {
      parent = this;
      this.state.show = true;
      this.state.label = "visible";

      return () => this.state.show == true
        ? jsx("section", {
          children: createDynamicChild(() => jsx("span", { children: this.state.label }))
        })
        : jsx("section", { children: "hidden" });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    const removedSpan = container.querySelector("span")!;

    parent.state.show = false;
    flushSync();
    parent.state.label = "changed";
    flushSync();

    expect(container.textContent).toBe("hidden");
    expect(container.querySelector("span")).toBeNull();
    expect(removedSpan.isConnected).toBe(false);
  });

  it("does not run stale compiled component prop bindings before dynamic branch replacement", () => {
    let parent!: Component<{ selected?: { id: string; title: string } }>;

    function Detail(this: Component<{}>, props: { task: { id: string; title: string } }) {
      return () => createCompiledVNode("strong", {}, createExpression(() => props.task.title));
    }

    function Empty() {
      return () => createCompiledVNode("span", {}, "empty");
    }

    function Parent(this: Component<{ selected?: { id: string; title: string } }>) {
      parent = this;
      this.state.selected = { id: "a", title: "Alpha" };

      return () => createCompiledVNode("section", {},
        createDynamicChild(() => this.state.selected
          ? createCompiledVNode(Detail, {
            key: this.state.selected.id,
            task: createExpression(() => this.state.selected as { id: string; title: string })
          })
          : createCompiledVNode(Empty, {}))
      );
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container);

    parent.state.selected = undefined;
    flushSync();

    expect(container.textContent).toBe("empty");
  });

  it("stops reactive style watchers when DOM nodes are removed", () => {
    let parent!: Component<{ show: boolean; color: string }>;

    function Parent(this: Component<{ show: boolean; color: string }>) {
      parent = this;
      this.state.show = true;
      this.state.color = "red";

      return () => this.state.show == true
        ? jsx("section", {
          children: jsx("span", {
            style: { color: this.state.color },
            children: "styled"
          })
        })
        : jsx("section", { children: "gone" });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    const removedSpan = container.querySelector("span")!;
    expect(removedSpan.style.color).toBe("red");

    parent.state.show = false;
    flushSync();
    parent.state.color = "blue";
    flushSync();

    expect(container.textContent).toBe("gone");
    expect(removedSpan.isConnected).toBe(false);
    expect(removedSpan.style.color).toBe("red");
  });

  it("stops reactive prop watchers when DOM nodes are removed", () => {
    let parent!: Component<{ show: boolean; label: string }>;

    function Parent(this: Component<{ show: boolean; label: string }>) {
      parent = this;
      this.state.show = true;
      this.state.label = "ready";

      return () => this.state.show == true
        ? jsx("section", {
          children: jsx("button", {
            title: this.state.label,
            children: "Action"
          })
        })
        : jsx("section", { children: "gone" });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    const removedButton = container.querySelector("button")!;
    expect(removedButton.title).toBe("ready");

    parent.state.show = false;
    flushSync();
    parent.state.label = "stale";
    flushSync();

    expect(container.textContent).toBe("gone");
    expect(removedButton.isConnected).toBe(false);
    expect(removedButton.title).toBe("ready");
  });

  it("stops reactive text watchers when text nodes are removed", () => {
    let parent!: Component<{ show: boolean; label: string }>;

    function Parent(this: Component<{ show: boolean; label: string }>) {
      parent = this;
      this.state.show = true;
      this.state.label = "ready";

      return () => this.state.show == true
        ? jsx("section", {
          children: jsx("span", { children: this.state.label })
        })
        : jsx("section", { children: "gone" });
    }

    const container = document.createElement("div");
    render(jsx(Parent, {}), container);
    const removedText = container.querySelector("span")!.firstChild as CharacterData;
    expect(removedText.data).toBe("ready");

    parent.state.show = false;
    flushSync();
    parent.state.label = "stale";
    flushSync();

    expect(container.textContent).toBe("gone");
    expect(removedText.isConnected).toBe(false);
    expect(removedText.data).toBe("ready");
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

  it("clears refs when compiled cell subtrees are replaced", () => {
    const buttonRef = createRef<HTMLButtonElement>("compiled-button");
    let parent!: Component<{ mode: "button" | "input" }>;

    function Parent(this: Component<{ mode: "button" | "input" }>) {
      parent = this;
      this.state.mode = "button";

      return () => createCompiledVNode("section", {}, this.state.mode == "button"
        ? createCompiledVNode("button", { ref: this.ref(buttonRef) }, "Save")
        : createCompiledVNode("input", { value: "Saved" }));
    }

    const container = document.createElement("div");
    render(createCompiledVNode(Parent, {}), container);
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

  it("explicitly disposes a root and all of its renderer-owned resources", () => {
    const unmounted = vi.fn();
    const clicked = vi.fn();
    const ref = createRef<HTMLButtonElement>("root-button");
    let component!: Component<{ count: number }>;

    function App(this: Component<{ count: number }>) {
      component = this;
      this.state.count = 0;
      this.onUnmount(unmounted);
      return () => jsx("button", {
        ref: this.ref(ref),
        onClick: clicked,
        children: String(this.state.count)
      });
    }

    const container = document.createElement("div");
    render(jsx(App, {}), container);
    const button = container.querySelector("button")!;
    button.click();
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(component.refs.get(ref)).toBe(button);

    expect(unmount(container)).toBe(true);
    expect(container.childNodes).toHaveLength(0);
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(component.refs.get(ref)).toBeUndefined();
    expect(unmount(container)).toBe(false);

    button.click();
    expect(clicked).toHaveBeenCalledTimes(1);
    component.state.count++;
    flushSync();
    expect(button.textContent).toBe("0");
  });

  it("remounts without retaining or duplicating delegated root listeners", () => {
    const container = document.createElement("div");
    const add = vi.spyOn(container, "addEventListener");
    const remove = vi.spyOn(container, "removeEventListener");
    const first = vi.fn();
    const second = vi.fn();

    render(jsx("button", { onClick: first, children: "first" }), container);
    container.querySelector("button")!.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);

    expect(unmount(container)).toBe(true);
    expect(remove.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);

    render(jsx("button", { onClick: second, children: "second" }), container);
    container.querySelector("button")!.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.filter(([type]) => type === "click")).toHaveLength(2);

    unmount(container);
    expect(remove.mock.calls.filter(([type]) => type === "click")).toHaveLength(2);
  });

  it("disposes an adopted SSR root and its attached bindings", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:component:0--><button>server</button><!--/exact:component:0-->";
    const serverButton = container.querySelector("button")!;
    const clicked = vi.fn();

    expect(adoptStatic(createVNode("button", { onClick: clicked }, "server"), container)).toBe(true);
    serverButton.click();
    expect(clicked).toHaveBeenCalledTimes(1);

    expect(unmount(container)).toBe(true);
    expect(container.childNodes).toHaveLength(0);
    serverButton.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("rolls back listeners and ownership when SSR adoption fails partway", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:component:0--><button>server</button><span>mismatch</span><!--/exact:component:0-->";
    const serverButton = container.querySelector("button")!;
    const remove = vi.spyOn(container, "removeEventListener");
    const clicked = vi.fn();
    const vnode = createVNode(Fragment, null,
      createVNode("button", { onClick: clicked }, "server"),
      createVNode("p", null, "expected")
    );

    expect(adoptStatic(vnode, container)).toBe(false);
    expect(remove.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);
    serverButton.click();
    expect(clicked).not.toHaveBeenCalled();
    expect(unmount(container)).toBe(false);
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

function commentData(root: Node): string[] {
  const comments: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let current = walker.nextNode();
  while (current) {
    comments.push((current as Comment).data);
    current = walker.nextNode();
  }
  return comments;
}
