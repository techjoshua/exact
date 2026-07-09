import { describe, expect, it, vi } from "vitest";
import {
  ErrorContext,
  LoggerContext,
  createComponentInstance,
  createContext,
  createErrorContext,
  createRef,
  createVNode,
  isVNode,
  logFrameworkEvent,
  renderInstance,
  type Component,
  type ErrorReport,
  type LogEvent,
  type Logger
} from "./index.js";
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
      this.reactive(() => this.state.query).task((query, { signal }) => {
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

  it("creates reactive template and lambda values on component instances", () => {
    let instance!: Component<{ first: string; last: string; formal: boolean }>;

    function Person(this: Component<{ first: string; last: string; formal: boolean }>) {
      instance = this;
      this.state.first = "Ada";
      this.state.last = "Lovelace";
      this.state.formal = false;

      const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);
      const label = this.reactive(() => this.state.formal == true ? `Countess ${fullName}` : fullName);

      return () => createVNode("span", null, label);
    }

    const component = createComponentInstance(Person, {});
    const nodes = renderInstance(component, () => undefined);

    expect(unwrap(isVNode(nodes[0]) ? nodes[0].children[0] : undefined)).toBe("Ada Lovelace");
    instance.state.formal = true;
    flushSync();
    expect(unwrap(isVNode(nodes[0]) ? nodes[0].children[0] : undefined)).toBe("Countess Ada Lovelace");
  });

  it("reruns tasks when reactive value dependencies change", () => {
    let instance!: Component<{ first: string; last: string }>;
    const values: string[] = [];
    const aborts: string[] = [];

    function Person(this: Component<{ first: string; last: string }>) {
      instance = this;
      this.state.first = "Ada";
      this.state.last = "Lovelace";
      const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);

      this.task(fullName, (name, { signal }) => {
        values.push(String(name));
        signal.addEventListener("abort", () => aborts.push(String(name)));
      });

      return () => null;
    }

    createComponentInstance(Person, {});
    instance.state.first = "Ada";
    flushSync();
    instance.state.last = "Byron";
    flushSync();

    expect(values).toEqual(["Ada Lovelace", "Ada Byron"]);
    expect(aborts).toEqual(["Ada Lovelace"]);
  });

  it("runs fluent tasks on component reactive values", () => {
    let instance!: Component<{ query: string }>;
    const values: string[] = [];
    const aborts: string[] = [];

    function Search(this: Component<{ query: string }>) {
      instance = this;
      this.state.query = "ada";

      this.reactive(() => this.state.query).task((query, { signal }) => {
        values.push(String(query));
        signal.addEventListener("abort", () => aborts.push(String(query)));
      });

      return () => null;
    }

    createComponentInstance(Search, {});
    instance.state.query = "grace";
    flushSync();

    expect(values).toEqual(["ada", "grace"]);
    expect(aborts).toEqual(["ada"]);
  });

  it("provides a default component logger", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      createComponentInstance(function Logged(this: Component<{}>) {
        this.log.info("hello", { answer: 42 });
        return () => null;
      }, {});

      expect(info).toHaveBeenCalledTimes(1);
      const [message, data] = info.mock.calls[0]!;
      expect(message).toMatch(/^\[exact\] \[component:Logged#c\d+\] hello$/);
      expect(data).toEqual({ answer: 42 });
    } finally {
      info.mockRestore();
    }
  });

  it("does not evaluate lazy log payloads for disabled levels", () => {
    const log = vi.fn();
    const logger: Logger = {
      isEnabled: () => false,
      log
    };

    const parent = createComponentInstance(function Parent(this: Component<{}>) {
      this.setContext(LoggerContext, logger);
      return () => null;
    }, {});

    createComponentInstance(function Child(this: Component<{}>) {
      this.log.debug(
        () => {
          throw new Error("message should not be evaluated");
        },
        () => {
          throw new Error("data should not be evaluated");
        }
      );
      return () => null;
    }, {}, parent);

    expect(log).not.toHaveBeenCalled();
  });

  it("passes error objects as separate console arguments", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    try {
      createComponentInstance(function Broken(this: Component<{}>) {
        this.log.error("failed", error, { taskId: "task-1" });
        return () => null;
      }, {});

      expect(errorLog).toHaveBeenCalledTimes(1);
      const [message, actualError, data] = errorLog.mock.calls[0]!;
      expect(message).toMatch(/^\[exact\] \[component:Broken#c\d+\] failed$/);
      expect(actualError).toBe(error);
      expect(data).toEqual({ taskId: "task-1" });
    } finally {
      errorLog.mockRestore();
    }
  });

  it("resolves logger context at call time", () => {
    const firstEvents: LogEvent[] = [];
    const secondEvents: LogEvent[] = [];
    const firstLogger: Logger = {
      log: event => firstEvents.push(event)
    };
    const secondLogger: Logger = {
      log: event => secondEvents.push(event)
    };
    let callback!: () => void;

    const parent = createComponentInstance(function Parent(this: Component<{}>) {
      this.setContext(LoggerContext, firstLogger);
      return () => null;
    }, {});

    createComponentInstance(function Child(this: Component<{}>) {
      callback = () => this.log.info("later");
      return () => null;
    }, {}, parent);

    parent.setContext(LoggerContext, secondLogger);
    callback();

    expect(firstEvents).toHaveLength(0);
    expect(secondEvents).toHaveLength(1);
    expect(secondEvents[0]!.message).toBe("later");
  });

  it("emits framework-scoped logs through the console logger contract", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      logFrameworkEvent("warn", "dom", "patch", "placement skipped", { reason: "stable" });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]).toEqual([
        "[exact] [framework:dom:patch] placement skipped",
        { reason: "stable" }
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("routes render failures to the nearest error context", () => {
    let instance!: Component<{ errors: ErrorReport[] }>;

    const component = createComponentInstance(function Broken(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));

      return () => {
        if (this.state.errors.length) return createVNode("span", null, "fallback");
        throw new Error("render failed");
      };
    }, {});

    renderInstance(component, () => renderInstance(component, () => undefined));
    flushSync();
    const nodes = renderInstance(component, () => undefined);

    expect(instance.state.errors).toHaveLength(1);
    expect(instance.state.errors[0]!.source).toBe("render");
    expect(isVNode(nodes[0]) ? nodes[0].children[0] : undefined).toBe("fallback");
  });

  it("routes synchronous task failures to the nearest error context", () => {
    let instance!: Component<{ errors: ErrorReport[] }>;

    createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      this.task(() => {
        throw new Error("task failed");
      });
      return () => null;
    }, {});

    expect(instance.state.errors).toHaveLength(1);
    expect(instance.state.errors[0]!.id).toMatch(/^e\d+$/);
    expect(instance.state.errors[0]!.source).toBe("task");
    expect(instance.state.errors[0]!.phase).toBe("run");
  });

  it("assigns stable ids to multiple error reports", () => {
    let instance!: Component<{ errors: ErrorReport[] }>;

    createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      this.task(() => {
        throw new Error("first task failed");
      });
      this.task(() => {
        throw new Error("second task failed");
      });
      return () => null;
    }, {});

    expect(instance.state.errors).toHaveLength(2);
    expect(instance.state.errors[0]!.id).not.toBe(instance.state.errors[1]!.id);
  });

  it("lets components report and clear errors through error context", () => {
    let instance!: Component<{ errors: ErrorReport[] }>;
    let report!: ErrorReport;

    const parent = createComponentInstance(function Boundary(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      return () => null;
    }, {});

    createComponentInstance(function Reporter(this: Component<{}>) {
      const errors = this.getContext(ErrorContext);
      report = errors.report(new Error("manual failure"), {
        source: "component",
        phase: "validate"
      });
      errors.clear(report.id);
      errors.report("second failure");
      errors.clearAll();
      return () => null;
    }, {}, parent);

    expect(report.source).toBe("component");
    expect(report.phase).toBe("validate");
    expect(instance.state.errors).toHaveLength(0);
  });

  it("routes rejected task promises to the nearest error context", async () => {
    let instance!: Component<{ errors: ErrorReport[] }>;

    createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      this.task(async () => {
        throw new Error("async task failed");
      });
      return () => null;
    }, {});

    await Promise.resolve();
    await Promise.resolve();

    expect(instance.state.errors).toHaveLength(1);
    expect(instance.state.errors[0]!.source).toBe("task");
    expect(instance.state.errors[0]!.phase).toBe("promise");
  });

  it("continues unmount cleanup after lifecycle failures", () => {
    let instance!: Component<{ errors: ErrorReport[] }>;
    const cleanup = vi.fn();

    const component = createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      this.onUnmount(() => {
        throw new Error("unmount failed");
      });
      this.onUnmount(cleanup);
      return () => null;
    }, {});

    component.markMounted();
    component.unmount();

    expect(instance.state.errors).toHaveLength(1);
    expect(instance.state.errors[0]!.source).toBe("lifecycle");
    expect(instance.state.errors[0]!.phase).toBe("unmount");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
