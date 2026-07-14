import { describe, expect, it, vi } from "vitest";
import {
  ErrorContext,
  LoggerContext,
  createComponentInstance,
  createContext,
  createDerived,
  createErrorContext,
  createRef,
  createVNode,
  isVNode,
  logFrameworkEvent,
  ownTaskResource,
  registerTaskCleanup,
  renderInstance,
  taskAwait,
  taskIdleCallback,
  taskObserver,
  taskTimeout,
  withTaskObserver,
  withAbortSignal,
  withTaskSignal,
  type Component,
  type ComponentInstance,
  type ErrorReport,
  type LogEvent,
  type Logger,
  type TaskObserver
} from "./index.js";
import { flushSync, unwrap, watch } from "@exact/reactive";

describe("@exact/core", () => {
  it("cancels compiler-owned resources and stale awaits", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const callback = vi.fn();
      taskTimeout(controller.signal, callback, 10);
      const observer = { disconnect: vi.fn() };
      expect(taskObserver(controller.signal, observer)).toBe(observer);
      const awaited = taskAwait(controller.signal, Promise.resolve("value"));
      controller.abort("rerun");
      await expect(awaited).rejects.toMatchObject({ name: "AbortError" });
      vi.runAllTimers();
      expect(callback).not.toHaveBeenCalled();
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("combines compiler-owned abort signals with listener options", () => {
    const owner = new AbortController();
    const external = new AbortController();
    const managed = withAbortSignal({ capture: true, signal: external.signal }, owner.signal);
    expect(managed.capture).toBe(true);
    expect(managed.signal?.aborted).toBe(false);
    owner.abort("unmount");
    expect(managed.signal?.aborted).toBe(true);
  });
  it("owns generic task resources and runs cleanup exactly once", async () => {
    const controller = new AbortController();
    const close = vi.fn();
    const terminate = vi.fn();
    const unsubscribe = vi.fn();
    const cleanup = vi.fn();
    const dispose = vi.fn();
    const asyncDispose = vi.fn(async () => undefined);
    expect(ownTaskResource(controller.signal, { close }, "close")).toEqual({ close });
    ownTaskResource(controller.signal, { terminate }, "terminate");
    ownTaskResource(controller.signal, unsubscribe, "call");
    if ((Symbol as any).dispose) ownTaskResource(controller.signal, { [(Symbol as any).dispose]: dispose });
    if ((Symbol as any).asyncDispose) ownTaskResource(controller.signal, { [(Symbol as any).asyncDispose]: asyncDispose });
    registerTaskCleanup(controller.signal, cleanup);

    controller.abort("rerun");
    controller.abort("again");
    await Promise.resolve();

    expect(close).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    if ((Symbol as any).dispose) expect(dispose).toHaveBeenCalledTimes(1);
    if ((Symbol as any).asyncDispose) expect(asyncDispose).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith("rerun");
  });

  it("routes task resource disposal failures through the owning error context", async () => {
    let instance!: Component<{ errors: ErrorReport[] }>;
    const component = createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
      instance = this;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      this.task(({ signal }) => {
        ownTaskResource(signal, { close: async () => { throw new Error("close failed"); } }, "close");
      });
      return () => null;
    }, {});

    component.markMounted();
    component.unmount();
    await Promise.resolve();
    await Promise.resolve();

    expect(instance.state.errors).toHaveLength(1);
    expect(instance.state.errors[0]).toMatchObject({ source: "task", phase: "resource-cleanup" });
  });
  it("combines task signals with typed API options", () => {
    const owner = new AbortController();
    const external = new AbortController();
    const options = withTaskSignal({ cache: "reload", signal: external.signal }, owner.signal);
    expect(options.cache).toBe("reload");
    owner.abort("rerun");
    expect(options.signal.aborted).toBe(true);
  });
  it("cancels compiler-owned idle callbacks", () => {
    const request = vi.fn(() => 42);
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", request);
    vi.stubGlobal("cancelIdleCallback", cancel);
    try {
      const controller = new AbortController();
      expect(taskIdleCallback(controller.signal, () => undefined)).toBe(42);
      controller.abort("unmount");
      expect(cancel).toHaveBeenCalledWith(42);
    } finally {
      vi.unstubAllGlobals();
    }
  });
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

  it("waits for asynchronous cleanup before starting the replacement task generation", async () => {
    let releaseCleanup!: () => void;
    const cleanupFinished = new Promise<void>(resolve => { releaseCleanup = resolve; });
    const starts: string[] = [];

    const instance = createComponentInstance(function Search(this: Component<{ query: string }>) {
      this.state.query = "a";
      this.reactive(() => this.state.query).task(query => {
        starts.push(query);
        return query === "a" ? () => cleanupFinished : undefined;
      });
      return () => null;
    }, {});

    instance.state.query = "b";
    flushSync();
    expect(starts).toEqual(["a"]);

    releaseCleanup();
    await cleanupFinished;
    await vi.waitFor(() => expect(starts).toEqual(["a", "b"]));
  });

  it("waits for compiler-owned asynchronous resources before replacing a task generation", async () => {
    let releaseClose!: () => void;
    const closed = new Promise<void>(resolve => { releaseClose = resolve; });
    const starts: string[] = [];

    const instance = createComponentInstance(function Search(this: Component<{ query: string }>) {
      this.state.query = "a";
      this.reactive(() => this.state.query).task((query, { signal }) => {
        starts.push(query);
        if (query === "a") ownTaskResource(signal, { close: () => closed }, "close");
      });
      return () => null;
    }, {});

    instance.state.query = "b";
    flushSync();
    expect(starts).toEqual(["a"]);

    releaseClose();
    await closed;
    await vi.waitFor(() => expect(starts).toEqual(["a", "b"]));
  });

  it("coalesces reruns while an asynchronous task generation is settling", async () => {
    let finishFirst!: (cleanup: () => Promise<void>) => void;
    let finishCleanup!: () => void;
    const first = new Promise<() => Promise<void>>(resolve => { finishFirst = resolve; });
    const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
    const starts: string[] = [];

    const instance = createComponentInstance(function Search(this: Component<{ query: string }>) {
      this.state.query = "a";
      this.reactive(() => this.state.query).task(query => {
        starts.push(query);
        return query === "a" ? first : undefined;
      });
      return () => null;
    }, {});

    instance.state.query = "b";
    flushSync();
    instance.state.query = "c";
    flushSync();
    expect(starts).toEqual(["a"]);

    finishFirst(() => cleanup);
    await first;
    await Promise.resolve();
    expect(starts).toEqual(["a"]);
    finishCleanup();
    await cleanup;
    await vi.waitFor(() => expect(starts).toEqual(["a", "c"]));
  });

  it("routes scheduled setup watcher failures through the component error context", () => {
    let instance!: Component<{ count: number; errors: ErrorReport[] }>;
    createComponentInstance(function Worker(this: Component<{ count: number; errors: ErrorReport[] }>) {
      instance = this;
      this.state.count = 0;
      this.state.errors = [];
      this.setContext(ErrorContext, createErrorContext(this.state.errors));
      watch(() => {
        if (this.state.count === 1) throw new Error("watch failed");
      });
      return () => null;
    }, {});

    instance.state.count = 1;
    expect(() => flushSync()).not.toThrow();
    expect(instance.state.errors).toHaveLength(1);
    expect(instance.state.errors[0]).toMatchObject({ source: "reactive", phase: "watch" });
  });

  it("stops tasks when construction fails", () => {
    const cleanup = vi.fn();

    expect(() => createComponentInstance(function Broken(this: Component<{}>) {
      this.task(() => cleanup);
      throw new Error("construct failed");
    }, {})).toThrow("construct failed");

    expect(cleanup).toHaveBeenCalledTimes(1);
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

  it("keeps context tokens local by default", () => {
    const first = createContext<{ name: string }>("com.example.user");
    const second = createContext<{ name: string }>("com.example.user");

    expect(first.id).not.toBe(second.id);
    expect(first.global).toBe(false);
    expect(second.global).toBe(false);
  });

  it("can create global context tokens for cross-bundle identity", () => {
    const providerToken = createContext<{ name: string }>("com.example.user", true);
    const consumerToken = createContext<{ name: string }>("com.example.user", true);

    function Parent(this: Component<{}>) {
      this.setContext(providerToken, { name: "Ada" });
      return () => null;
    }

    const parent = createComponentInstance(Parent, {});
    createComponentInstance(function Child(this: Component<{}>) {
      expect(unwrap(this.getContext(consumerToken).name)).toBe("Ada");
      return () => null;
    }, {}, parent);

    expect(providerToken.id).toBe(consumerToken.id);
    expect(providerToken.global).toBe(true);
    expect(consumerToken.global).toBe(true);
  });

  it("uses global identity for built-in framework contexts", () => {
    expect(LoggerContext.global).toBe(true);
    expect(ErrorContext.global).toBe(true);
    expect(LoggerContext.id).toBe(Symbol.for("exact.context:exact.logger"));
    expect(ErrorContext.id).toBe(Symbol.for("exact.context:exact.error"));
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

  it("stops compiler-owned derived subscriptions when a component unmounts", () => {
    let instance!: ComponentInstance<{ count: number }>;
    const compute = vi.fn(() => instance.state.count * 2);

    instance = createComponentInstance(function Counter(this: Component<{ count: number }>) {
      instance = this as ComponentInstance<{ count: number }>;
      this.state.count = 1;
      const doubled = createDerived(compute);
      this.task(doubled, () => undefined);
      return () => null;
    }, {});
    instance.markMounted();
    expect(compute).toHaveBeenCalledTimes(1);

    instance.unmount();
    instance.state.count = 2;
    flushSync();

    expect(compute).toHaveBeenCalledTimes(1);
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

  it("contains logger failures", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger: Logger = {
      log() {
        throw new Error("logger failed");
      }
    };

    try {
      const parent = createComponentInstance(function Parent(this: Component<{}>) {
        this.setContext(LoggerContext, logger);
        return () => null;
      }, {});

      expect(() => createComponentInstance(function Child(this: Component<{}>) {
        this.log.info("hello");
        return () => null;
      }, {}, parent)).not.toThrow();

      expect(() => logFrameworkEvent("warn", "dom", "patch", "placement skipped", undefined, logger)).not.toThrow();
      expect(errorLog).toHaveBeenCalledWith(
        "[exact] [framework:core:logger] logger failed while handling eXact log event",
        expect.any(Error)
      );
    } finally {
      errorLog.mockRestore();
    }
  });

  it("does not evaluate lazy log payloads when logger enable checks fail", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger: Logger = {
      isEnabled() {
        throw new Error("logger failed");
      },
      log() {
        throw new Error("log should not be called");
      }
    };

    try {
      expect(() => logFrameworkEvent("debug", "dom", "patch", () => {
        throw new Error("message should not be evaluated");
      }, undefined, logger)).not.toThrow();

      expect(errorLog).toHaveBeenCalledWith(
        "[exact] [framework:core:logger] logger failed while handling eXact log event",
        expect.any(Error)
      );
    } finally {
      errorLog.mockRestore();
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

  it("supports explicit server and client task aliases at runtime", () => {
    let instance!: Component<{ value: number; serverRuns: number; clientRuns: number }>;

    createComponentInstance(function Worker(this: Component<{ value: number; serverRuns: number; clientRuns: number }>) {
      instance = this;
      this.state.value = 1;
      this.state.serverRuns = 0;
      this.state.clientRuns = 0;
      this.task.server(this.reactive<number>(() => this.state.value), value => {
        this.state.serverRuns = value;
      });
      this.task.client(this.reactive<number>(() => this.state.value), value => {
        this.state.clientRuns = value;
      });
      return () => null;
    }, {});

    expect(instance.state.serverRuns).toBe(1);
    expect(instance.state.clientRuns).toBe(1);

    instance.state.value = 2;
    flushSync();

    expect(instance.state.serverRuns).toBe(2);
    expect(instance.state.clientRuns).toBe(2);
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

  it("makes plain error context arrays reactive", () => {
    const errors = createErrorContext([]);
    let count = 0;

    const stop = watch(() => {
      void errors.errors.length;
      count++;
    });

    errors.report("first");
    flushSync();
    errors.clearAll();
    flushSync();
    stop();

    expect(count).toBe(3);
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

  it("lets render environments observe async task completion", async () => {
    const observed: Promise<unknown>[] = [];
    const observer: TaskObserver = {
      register: promise => observed.push(promise)
    };
    let instance!: Component<{ ready: boolean }>;

    withTaskObserver(observer, () => {
      createComponentInstance(function Worker(this: Component<{ ready: boolean }>) {
        instance = this;
        this.state.ready = false;
        this.task(async () => {
          await Promise.resolve();
          this.state.ready = true;
        });
        return () => null;
      }, {});
    });

    expect(observed).toHaveLength(1);
    await Promise.all(observed);
    expect(instance.state.ready).toBe(true);
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

  it("actively aborts taskAwait even when its input never settles", async () => {
    const controller = new AbortController();
    const awaited = taskAwait(controller.signal, new Promise<string>(() => undefined));
    controller.abort("rerun");
    await expect(awaited).rejects.toMatchObject({ name: "AbortError", message: "rerun" });
  });

  it("disposes tasks when a component is removed before it mounts", () => {
    const cleanup = vi.fn();
    const component = createComponentInstance(function Pending(this: Component<{}>) {
      this.task(() => cleanup);
      return () => null;
    }, {});
    component.unmount("discarded-before-mount");
    component.markMounted();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(component.mounted).toBe(false);
  });

  it("routes compiler-owned timer and asynchronous render lifecycle errors", async () => {
    vi.useFakeTimers();
    try {
      let instance!: Component<{ errors: ErrorReport[] }>;
      const component = createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
        instance = this;
        this.state.errors = [];
        this.setContext(ErrorContext, createErrorContext(this.state.errors));
        this.task(({ signal }) => {
          taskTimeout(signal, () => { throw new Error("timer failed"); }, 1);
        });
        this.onRender(async () => { throw new Error("render hook failed"); });
        return () => null;
      }, {});
      renderInstance(component, () => undefined);
      vi.runAllTimers();
      await Promise.resolve();
      expect(instance.state.errors.map(error => error.phase).sort()).toEqual(["render", "timeout"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates the framework error context between application roots", () => {
    const failing = () => createComponentInstance(function Root(this: Component<{}>) {
      return () => { throw new Error("root failure"); };
    }, {});
    const first = failing();
    const second = createComponentInstance(function Root(this: Component<{}>) { return () => null; }, {});
    const firstChild = createComponentInstance(function Child(this: Component<{}>) { return () => null; }, {}, first);
    const secondChild = createComponentInstance(function Child(this: Component<{}>) { return () => null; }, {}, second);
    renderInstance(first, () => undefined);
    expect(firstChild.getContext(ErrorContext).errors).toHaveLength(1);
    expect(secondChild.getContext(ErrorContext).errors).toHaveLength(0);
  });
});
