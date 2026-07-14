import { describe, expect, it } from "vitest";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { analyzeExpressionTasks } from "./expression-tasks.js";

describe("expression-backed task effects", () => {
  it("does not classify shadowed async resource functions as globals", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ShadowedTaskResources.tsx", `
      function Panel(this: Component<{}>) {
        const setTimeout = (callback: () => void) => callback();
        this.task(() => setTimeout(() => {}));
      }
    `);
    expect(analyzeExpressionTasks(module).resources.size).toBe(0);
  });
  it("plans direct component setup listeners for implicit lifecycle ownership", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("SetupListener.tsx", `function Panel(this: Component<{}>) {
      window.addEventListener("resize", () => {});
      const window = undefined as never;
      return () => <p />;
    }`);
    // The lexical declaration shadows every use in its scope, including the earlier one.
    expect(analyzeExpressionTasks(module).lifecycleListeners.size).toBe(0);

    const globalModule = expressionModuleFor("GlobalSetupListener.tsx", `function Panel(this: Component<{}>) {
      window.addEventListener("resize", () => {});
      return () => <p />;
    }`);
    expect([...analyzeExpressionTasks(globalModule).lifecycleListeners.values()])
      .toContainEqual(expect.objectContaining({ component: "Panel" }));
  });
  it("plans direct setup resources and typed cancellable calls as owned client tasks", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("SetupResources.tsx", `
      declare function load(options?: { signal?: AbortSignal; priority?: number }): Promise<void>;
      declare function disposableApi(): Disposable;
      declare const bus: EventTarget;
      function Panel(this: Component<{}>) {
        setInterval(() => {}, 10);
        new ResizeObserver(() => {}).observe(document.body);
        new WebSocket("/events");
        disposableApi();
        load({ priority: 1 });
        bus.addEventListener("message", () => {});
        return () => <p />;
      }
    `);
    const plan = analyzeExpressionTasks(module);
    expect(plan.setupTasks.size).toBe(6);
    expect([...plan.resources.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "interval" }),
      expect.objectContaining({ kind: "observer" }),
      expect.objectContaining({ kind: "owned", disposal: "close" }),
      expect.objectContaining({ kind: "owned", description: expect.stringContaining("Disposable") })
    ]));
    expect([...plan.signalCalls.values()]).toContainEqual(expect.objectContaining({ mode: "options" }));
  });
  it("diagnoses setup resources whose values escape automatic lifecycle ownership", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("EscapingSetupResource.tsx", `function Panel(this: Component<{}>) {
      const socket = new WebSocket("/events");
      return () => <p>{socket.readyState}</p>;
    }`);
    expect(analyzeExpressionTasks(module).diagnostics)
      .toContainEqual(expect.stringContaining("setup-created WebSocket cannot be owned without changing its expression result"));
  });
  it("classifies state, context, environment, async, and explicit placement effects", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ExpressionTasks.tsx", `
      import { readFile } from "node:fs/promises";
      function Panel(this: Component<{ count: number; items: string[] }>) {
        this.task.client(async ({ signal }) => {
          const items = this.state.items;
          this.state.count += items.length;
          items.push(await readFile("x", "utf8"));
          this.getContext(Locale);
          setTimeout(() => {}, 10);
          fetch("/tasks");
          new ResizeObserver(() => {});
          window.addEventListener("resize", () => {}, { signal });
        });
        return () => <p />;
      }
    `);
    const task = [...analyzeExpressionTasks(module).sites.values()][0]!;
    expect(task.component).toBe("Panel");
    expect(task.requestedPlacement).toBe("client");
    expect(task.placement).toBe("client");
    expect(task.async).toBe(true);
    expect(task.browserEffects).toBe(true);
    expect(task.serverEffects).toBe(true);
    expect(task.reads).toEqual(expect.arrayContaining([expect.objectContaining({ path: "items" })]));
    expect(task.writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "count" }),
      expect.objectContaining({ path: "items", confidence: "broad" })
    ]));
    expect(task.contexts).toContainEqual(expect.objectContaining({ token: "Locale", kind: "read" }));
    expect([...analyzeExpressionTasks(module).resources.values()].map(resource => resource.kind)).toEqual(
      expect.arrayContaining(["timeout", "fetch", "observer"])
    );
    expect(task.diagnostics).toEqual(expect.arrayContaining([
      "task writes component state and references browser-only globals; classify as client and split at this boundary",
      "error: this.task.client() cannot reference server-only imports",
      "task placement forced by this.task.client()"
    ]));
  });

  it("plans closeable, idle, disposable, subscription, and typed-signal resources", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("OwnedTaskResources.tsx", `
      declare function optionsApi(value: string, options?: { signal?: AbortSignal; priority?: number }): void;
      declare function directApi(value: string, signal?: AbortSignal): void;
      declare function disposableApi(): Disposable;
      declare const store: { subscribe(callback: () => void): { unsubscribe(): void } };
      function Panel(this: Component<{}>) {
        this.task.client(() => {
          requestIdleCallback(() => {});
          const socket = new WebSocket("/events");
          const events = new EventSource("/events");
          const channel = new BroadcastChannel("updates");
          const worker = new Worker("worker.js");
          const disposable = disposableApi();
          const subscription = store.subscribe(() => {});
          optionsApi("ready", { priority: 1 });
          directApi("ready");
          void socket.readyState;
          void events.readyState;
          void channel.name;
          worker.postMessage("ready");
        });
      }
    `);
    const plan = analyzeExpressionTasks(module);
    const resources = [...plan.resources.values()];
    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "idle-callback" }),
      expect.objectContaining({ kind: "owned", disposal: "close", description: "WebSocket" }),
      expect.objectContaining({ kind: "owned", disposal: "close", description: "EventSource" }),
      expect.objectContaining({ kind: "owned", disposal: "close", description: "BroadcastChannel" }),
      expect.objectContaining({ kind: "owned", disposal: "terminate", description: "Worker" }),
      expect.objectContaining({ kind: "owned", description: expect.stringContaining("Disposable") }),
      expect.objectContaining({ kind: "owned", disposal: "unsubscribe", description: "subscription" })
    ]));
    expect([...plan.signalCalls.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ parameter: 1, mode: "options" }),
      expect.objectContaining({ parameter: 1, mode: "direct" })
    ]));
  });

  it("uses the selected overload when inferring cancellation", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("SelectedOverload.tsx", `
      declare function load(value: number): void;
      declare function load(value: string, options?: { signal?: AbortSignal }): void;
      function Panel(this: Component<{}>) { this.task.client(() => load(1)); }
    `);
    expect(analyzeExpressionTasks(module).signalCalls.size).toBe(0);
  });

  it("diagnoses escaping resources and respects explicit task cleanup", () => {
    clearExpressionProjectCache();
    const escaping = expressionModuleFor("EscapingTaskResource.tsx", `function Panel(this: Component<{ socket?: WebSocket }>) {
      this.task.client(() => { this.state.socket = new WebSocket("/events"); });
    }`);
    expect([...analyzeExpressionTasks(escaping).sites.values()][0]!.diagnostics)
      .toContainEqual(expect.stringContaining("WebSocket escapes its task generation"));

    const explicit = expressionModuleFor("ExplicitTaskResource.tsx", `function Panel(this: Component<{}>) {
      this.task.client(() => { const socket = new WebSocket("/events"); return () => socket.close(); });
    }`);
    expect([...analyzeExpressionTasks(explicit).resources.values()])
      .not.toContainEqual(expect.objectContaining({ description: "WebSocket" }));
  });
});
