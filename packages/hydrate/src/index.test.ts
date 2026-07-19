/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { Fragment, createCompiledVNode, createDynamicChild, createRef, createVNode, type Component } from "@exact/core";
import { flushSync, registerReactiveListKey } from "@exact/reactive";
import { render } from "@exact/dom";
import { handleExactRequest } from "@exact/server";
import { renderHydrationScript, renderToHydratableString, renderToString } from "@exact/ssr";
import { hydrate, applyPatches, createExactClient, hydrateClientIslands, invokeExact, invokeExactBatch, readExactHydrationConfig } from "./index.js";

const noopLogger = {
  isEnabled: () => false,
  log() {}
};

it("reports opt-in hydration timings", () => {
  function Profiled() {
    return () => createVNode("p", null, "profiled");
  }
  const vnode = createVNode(Profiled, null);
  const container = document.createElement("div");
  container.innerHTML = renderToHydratableString(vnode).htmlWithHydration;
  const events: Array<{ subsystem: string; phase: string }> = [];

  hydrate(vnode, container, { onProfile: event => events.push(event) });

  expect(events).toContainEqual(expect.objectContaining({
    subsystem: "hydrate",
    phase: "hydrate"
  }));
});

it("adopts a complete authored document while retaining framework-owned body augmentation", () => {
  function DocumentApp(this: Component<{ count: number }>) {
    this.state.count = 1;
    return () => createVNode("html", { lang: "en" },
      createVNode("head", null, createVNode("title", null, `Count ${this.state.count}`)),
      createVNode("body", null,
        createVNode("button", { onClick: () => { this.state.count++; } }, `Count ${this.state.count}`)
      )
    );
  }

  const rendered = renderToHydratableString(createVNode(DocumentApp, null), {
    endpoint: "/__exact"
  });
  document.open();
  document.write(rendered.htmlWithHydration);
  document.close();
  const originalHtml = document.documentElement;
  const frameworkScript = document.getElementById("__exact_hydration");

  const client = hydrate(createVNode(DocumentApp, null), document, { onMismatch: "throw" });

  expect(document.documentElement).toBe(originalHtml);
  expect(document.getElementById("__exact_hydration")).toBe(frameworkScript);
  const button = document.querySelector("button")!;
  button.click();
  flushSync();
  expect(button.textContent).toBe("Count 2");
  expect(document.title).toBe("Count 2");
  expect(frameworkScript?.previousSibling).toBeInstanceOf(Comment);
  expect((frameworkScript?.previousSibling as Comment).data).toBe("exact:framework-body:start");
  client.dispose();
  document.open();
  document.write("<!doctype html><html><head></head><body></body></html>");
  document.close();
});

it("decodes keyed hydration collection envelopes into ordinary arrays", () => {
  const records = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  registerReactiveListKey(records, item => (item as { id: string }).id, "hydrate config test", "member:id");
  const root = document.createElement("div");
  root.innerHTML = renderHydrationScript({ state: { records } });
  const config = readExactHydrationConfig(root);
  expect((config.state as any).records).toEqual(records);
  expect(Array.isArray((config.state as any).records)).toBe(true);
  expect(Object.keys((config.state as any).records)).toEqual(["0", "1"]);
});

function ndjsonResponse(events: readonly unknown[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    }
  });
}

describe("@exact/hydrate", () => {
  it("keeps unrelated client ownership active after a server prop patch", () => {
    let clicks = 0;
    function Counter() {
      return () => createVNode("button", { onClick: () => clicks++ }, "Click");
    }
    const container = document.createElement("div");
    render(createVNode(Counter, null), container);
    const button = container.querySelector("button")!;
    button.setAttribute("data-exact-id", "server-label");
    expect(applyPatches(container, [{ type: "prop", id: "server-label", name: "title", value: "patched" }])).toBe(true);
    button.click();
    expect(clicks).toBe(1);
  });

  it("disposes a hydrated island before a server replacement removes it", () => {
    let clicks = 0;
    function Counter() { return () => createVNode("button", { onClick: () => clicks++ }, "Old"); }
    const container = document.createElement("main");
    const island = document.createElement("div");
    island.setAttribute("data-exact-client-boundary", "counter");
    container.appendChild(island);
    render(createVNode(Counter, null), island);
    const detachedButton = island.querySelector("button")!;
    expect(applyPatches(container, [{ type: "replace", id: "counter", html: "<p>New</p>" }])).toBe(true);
    detachedButton.click();
    expect(clicks).toBe(0);
    expect(container.textContent).toBe("New");
  });

  it("rejects duplicate element protocol ids before mutating live DOM", () => {
    const container = document.createElement("div");
    container.innerHTML = '<p data-exact-id="same">A</p><p data-exact-id="same">B</p>';
    expect(applyPatches(container, [{ type: "text", id: "same", value: "changed" }], { logger: noopLogger })).toBe(false);
    expect(container.textContent).toBe("AB");
  });
  it("validates an entire patch batch before mutating live DOM", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";
    expect(applyPatches(container, [
      { type: "text", id: "title", value: "Changed" },
      { type: "text", id: "missing", value: "Invalid" }
    ], { logger: noopLogger })).toBe(false);
    expect(container.textContent).toBe("Old");
  });

  it("reserves traversal work for an entire patch batch before mutating live DOM", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title--><!--exact:panel--><p>Old panel</p><!--/exact:panel-->";
    const before = container.innerHTML;

    expect(() => applyPatches(container, [
      { type: "text", id: "title", value: "Changed" },
      { type: "replace", id: "panel", html: "<section><span>A</span><span>B</span><span>C</span></section>" }
    ], { maxTreeNodes: 12 })).toThrow("DOM traversal exceeds");
    expect(container.innerHTML).toBe(before);
  });

  it("rejects structurally overlapping patches before mutating live DOM", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:outer--><section><!--exact:inner-->Old<!--/exact:inner--></section><!--/exact:outer-->";
    const before = container.innerHTML;

    expect(applyPatches(container, [
      { type: "replace", id: "outer", html: "<p>Replacement</p>" },
      { type: "text", id: "inner", value: "Too late" }
    ], { logger: noopLogger })).toBe(false);
    expect(container.innerHTML).toBe(before);
  });

  it("finishes a prepared patch batch before reporting ownership cleanup failures", () => {
    let owner!: Component<{}>;
    function Owned(this: Component<{}>) {
      owner = this;
      return () => createVNode("button", null, "Old island");
    }
    const container = document.createElement("div");
    const island = document.createElement("div");
    island.setAttribute("data-exact-client-boundary", "island");
    container.append(island);
    render(createVNode(Owned, null), island);
    container.insertAdjacentHTML("beforeend", "<!--exact:title-->Old title<!--/exact:title-->");
    (owner as any).scope.reactions.add({ stop() { throw new Error("cleanup failed"); } });

    expect(() => applyPatches(container, [
      { type: "replace", id: "island", html: "<p>New island</p>" },
      { type: "text", id: "title", value: "New title" }
    ])).toThrow("cleanup failed");
    expect(container.textContent).toBe("New islandNew title");
  });

  it("parses replacement patches in the target SVG namespace", () => {
    const container = document.createElement("div");
    container.innerHTML = '<svg><!--exact:shape--><rect></rect><!--/exact:shape--></svg>';
    expect(applyPatches(container, [{ type: "replace", id: "shape", html: "<circle></circle>" }])).toBe(true);
    expect(container.querySelector("circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("preserves dirty form state entered before hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:fragment:0--><input value=server><!--/exact:fragment:0-->";
    const input = container.querySelector("input")!;
    input.value = "typed";
    hydrate(createVNode(Fragment, null, createVNode("input", { value: "server" })), container, { logger: noopLogger });
    expect(container.querySelector("input")?.value).toBe("typed");
  });

  it("restores same-signature form controls by compiler identity after repair reorders them", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = "<!--exact:fragment:0--><input data-exact-id=a name=title value=A><input data-exact-id=b name=title value=B><!--/exact:fragment:0-->";
    try {
      const edited = container.querySelector("[data-exact-id=b]") as HTMLInputElement;
      edited.value = "typed B";
      edited.focus();
      hydrate(createVNode(Fragment, null,
        createVNode("input", { "data-exact-id": "b", name: "title", value: "B" }),
        createVNode("input", { "data-exact-id": "a", name: "title", value: "A" })
      ), container, { logger: noopLogger });
      const restored = container.querySelector("[data-exact-id=b]") as HTMLInputElement;
      expect(restored.value).toBe("typed B");
      expect(document.activeElement).toBe(restored);
    } finally {
      container.remove();
    }
  });

  it("makes hydration idempotent and exposes idempotent disposal", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:fragment:0--><p>server</p><!--/exact:fragment:0-->";
    const vnode = createVNode(Fragment, null, createVNode("p", null, "server"));
    const first = hydrate(vnode, container, { logger: noopLogger });
    expect(hydrate(vnode, container, { logger: noopLogger })).toBe(first);
    first.dispose();
    first.dispose();
    expect(() => first.applyPatches([])).toThrow("disposed");
  });

  it("aborts in-flight operations when the hydration client is disposed", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";
    let requestSignal: AbortSignal | undefined;
    const client = createExactClient(container, {
      endpoint: "/__exact",
      batch: false,
      fetch: async (_input, init) => {
        requestSignal = init.signal;
        return await new Promise<never>(() => undefined);
      }
    });
    const operation = client.invokeAction("save");
    await Promise.resolve();
    client.dispose();

    expect(requestSignal?.aborted).toBe(true);
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(container.textContent).toBe("Old");
  });
  it("adopts compatible static marker-wrapped SSR nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:component:0--><p class=\"ready\">server</p><!--/exact:component:0-->";
    const serverNode = root.querySelector("p")!;
    hydrate(createVNode("p", { className: "ready" }, "server"), root, { logger: noopLogger });
    expect(root.querySelector("p")).toBe(serverNode);
    expect(root.querySelectorAll("p")).toHaveLength(1);
  });
  it("patches an adopted static root without appending a second tree", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:component:0--><p>server</p><!--/exact:component:0-->";
    const serverNode = root.querySelector("p")!;
    hydrate(createVNode("p", null, "server"), root, { logger: noopLogger });
    render(createVNode("p", null, "client"), root);
    expect(root.querySelectorAll("p")).toHaveLength(1);
    expect(root.querySelector("p")).toBe(serverNode);
    expect(root.textContent).toBe("client");
  });
  it("adopts an SSR root component boundary without replacing its DOM", () => {
    const root = document.createElement("div");
    function Greeting(this: Component<{}>) { return () => createVNode("p", null, "hello"); }
    root.innerHTML = renderToString(createVNode(Greeting, null)).html;
    const serverNode = root.querySelector("p")!;
    hydrate(createVNode(Greeting, null), root, { logger: noopLogger });
    expect(root.querySelector("p")).toBe(serverNode);
    render(createVNode(Greeting, null), root);
    expect(root.querySelector("p")).toBe(serverNode);
  });
  it("adopts nested component marker boundaries", () => {
    const root = document.createElement("div");
    function Child(this: Component<{}>) { return () => createVNode("em", null, "child"); }
    function Parent(this: Component<{}>) { return () => createVNode("section", null, createVNode(Child, null)); }
    root.innerHTML = renderToString(createVNode(Parent, null)).html;
    const serverChild = root.querySelector("em")!;
    hydrate(createVNode(Parent, null), root, { logger: noopLogger });
    expect(root.querySelector("em")).toBe(serverChild);
  });
  it("adopts compiler cell marker boundaries", () => {
    const root = document.createElement("div");
    let instance!: Component<{ label: string }>;
    function Label(this: Component<{ label: string }>) {
      instance = this;
      this.state.label = "server";
      return () => createCompiledVNode("p", null, this.state.label);
    }
    root.innerHTML = renderToString(createVNode(Label, null)).html;
    const serverNode = root.querySelector("p")!;
    hydrate(createVNode(Label, null), root, { logger: noopLogger });
    instance.state.label = "client";
    flushSync();
    expect(root.querySelector("p")).toBe(serverNode);
    expect(root.querySelector("p")?.textContent).toBe("client");
  });
  it("adopts keyed SSR item ranges and reorders their existing DOM", () => {
    const root = document.createElement("div");
    let instance!: Component<{ items: { id: string; title: string }[] }>;
    function List(this: Component<{ items: { id: string; title: string }[] }>) {
      instance = this;
      this.state.items = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
      return () => createVNode("ul", null, this.map(this.state.items, item => item.id, item => createVNode("li", null, item.title), "tasks"));
    }
    root.innerHTML = renderToString(createVNode(List, null)).html;
    const [a, b] = Array.from(root.querySelectorAll("li"));
    hydrate(createVNode(List, null), root, { logger: noopLogger });
    instance.state.items.splice(0, 2, { id: "b", title: "B" }, { id: "a", title: "A" });
    flushSync();
    expect(Array.from(root.querySelectorAll("li"))).toEqual([b, a]);
  });
  it("adopts a dynamic marker range and updates it after hydration", () => {
    const root = document.createElement("div");
    let client!: Component<{ label: string }>;
    function Label(this: Component<{ label: string }>) {
      client = this;
      this.state.label = "server";
      return () => createVNode("p", null, createDynamicChild(() => this.state.label));
    }
    root.innerHTML = renderToString(createVNode(Label, null)).html;
    const serverNode = root.querySelector("p")!;
    hydrate(createVNode(Label, null), root, { logger: noopLogger });
    client.state.label = "client";
    flushSync();
    expect(root.querySelector("p")).toBe(serverNode);
    expect(root.querySelector("p")?.textContent).toBe("client");
  });
  it("attaches JSX events while adopting a component root", () => {
    const root = document.createElement("div");
    function Counter(this: Component<{ count: number }>) {
      this.state.count = 0;
      return () => createVNode("button", {
        onClick: () => this.state.count++
      }, String(this.state.count));
    }
    root.innerHTML = renderToString(createVNode(Counter, null)).html;
    hydrate(createVNode(Counter, null), root, { logger: noopLogger });
    const button = root.querySelector("button")!;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();
    expect(button.textContent).toBe("1");
  });
  it("fulfills component refs while adopting existing elements", () => {
    const root = document.createElement("div");
    const buttonRef = createRef<HTMLButtonElement>("hydrated-button");
    let instance!: Component<{}>;
    function Button(this: Component<{}>) {
      instance = this;
      return () => createVNode("button", { ref: this.ref(buttonRef) }, "save");
    }
    root.innerHTML = renderToString(createVNode(Button, null)).html;
    const serverNode = root.querySelector("button")!;
    hydrate(createVNode(Button, null), root, { logger: noopLogger });
    expect(instance.refs.get(buttonRef)).toBe(serverNode);
  });
  it("adopts static fragment siblings inside a marker range", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:fragment:0--><p>one</p><p>two</p><!--/exact:fragment:0-->";
    const [first, second] = Array.from(root.querySelectorAll("p"));
    hydrate(createVNode(Fragment, null, createVNode("p", null, "one"), createVNode("p", null, "two")), root, { logger: noopLogger });
    expect(root.querySelectorAll("p")[0]).toBe(first);
    expect(root.querySelectorAll("p")[1]).toBe(second);
  });
  it("adopts nested static fragments inside a marker range", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:fragment:0--><p>one</p><p>two</p><!--/exact:fragment:0-->";
    const [first, second] = Array.from(root.querySelectorAll("p"));
    hydrate(createVNode(Fragment, null, createVNode(Fragment, null, createVNode("p", null, "one"), createVNode("p", null, "two"))), root, { logger: noopLogger });
    expect(root.querySelectorAll("p")[0]).toBe(first);
    expect(root.querySelectorAll("p")[1]).toBe(second);
  });
  it("remounts static markup when SSR includes an unexpected attribute", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:component:0--><p data-stale=\"yes\">server</p><!--/exact:component:0-->";
    const serverNode = root.querySelector("p")!;
    hydrate(createVNode("p", null, "server"), root, { logger: noopLogger });
    expect(root.querySelector("p")).not.toBe(serverNode);
    expect(root.querySelector("p")?.hasAttribute("data-stale")).toBe(false);
  });
  it("repairs only the mismatched child of an adopted static fragment", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:fragment:0--><p>one</p><p>stale</p><!--/exact:fragment:0-->";
    const first = root.querySelectorAll("p")[0]!;
    const stale = root.querySelectorAll("p")[1]!;
    hydrate(createVNode(Fragment, null, createVNode("p", null, "one"), createVNode("p", null, "two")), root, { logger: noopLogger });
    expect(root.querySelectorAll("p")[0]).toBe(first);
    expect(root.querySelectorAll("p")[1]).toBe(stale);
    expect(root.textContent).toBe("onetwo");
  });
  it("repairs a stale static attribute without replacing compatible siblings", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:fragment:0--><p class=\"stale\">one</p><p>two</p><!--/exact:fragment:0-->";
    const stale = root.querySelectorAll("p")[0]!;
    const sibling = root.querySelectorAll("p")[1]!;
    hydrate(createVNode(Fragment, null, createVNode("p", { className: "fresh" }, "one"), createVNode("p", null, "two")), root, { logger: noopLogger });
    expect(root.querySelectorAll("p")[0]).toBe(stale);
    expect(root.querySelectorAll("p")[0]?.className).toBe("fresh");
    expect(root.querySelectorAll("p")[1]).toBe(sibling);
  });
  it("restores focus and selection when local static repair replaces an input", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    root.innerHTML = "<!--exact:fragment:0--><input value=\"stale\"><p>stable</p><!--/exact:fragment:0-->";
    const input = root.querySelector("input")!;
    input.focus();
    input.setSelectionRange(1, 3);
    try {
      hydrate(createVNode(Fragment, null, createVNode("input", { value: "fresh" }), createVNode("p", null, "stable")), root, { logger: noopLogger });
      const repaired = root.querySelector("input")!;
      expect(document.activeElement).toBe(repaired);
      expect(repaired.selectionStart).toBe(1);
      expect(repaired.selectionEnd).toBe(3);
    } finally {
      root.remove();
    }
  });
  it("does not duplicate marker-bearing SSR markup while creating the client tree", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--exact:component:0--><p>server</p><!--/exact:component:0-->";
    hydrate(createVNode("p", null, "client"), root, { logger: noopLogger });
    expect(root.querySelectorAll("p")).toHaveLength(1);
    expect(root.textContent).toBe("client");
  });
  it("hydrates by falling back to normal render when markers are missing", () => {
    const container = document.createElement("div");

    hydrate(createVNode("p", null, "ready"), container, { logger: noopLogger });

    expect(container.querySelector("p")?.textContent).toBe("ready");
  });

  it("reads endpoint and state from the hydration bootstrap script", () => {
    const root = document.createElement("main");
    root.innerHTML = "<script type=\"application/json\" id=\"__exact_hydration\">{\"endpoint\":\"/__exact\",\"endpoints\":{\"actions\":{\"save-remote\":\"https://remote.test/__exact\"},\"boundaries\":{\"remote-panel\":\"https://remote.test/__exact\"}},\"state\":{\"ready\":true},\"stateContracts\":{\"save\":{\"reads\":[{\"path\":\"project.id\",\"kind\":\"read\",\"confidence\":\"exact\"}]}},\"actionBoundaries\":{\"save\":[\"profile\",\"slot:children\"]}}</script>";

    expect(readExactHydrationConfig(root)).toEqual({
      endpoint: "/__exact",
      endpoints: {
        actions: {
          "save-remote": "https://remote.test/__exact"
        },
        boundaries: {
          "remote-panel": "https://remote.test/__exact"
        }
      },
      state: { ready: true },
      stateContracts: {
        save: {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
        }
      },
      actionBoundaries: {
        save: ["profile", "slot:children"]
      }
    });
  });

  it("ignores malformed endpoint routes in the hydration bootstrap script", () => {
    const root = document.createElement("main");
    root.innerHTML = "<script type=\"application/json\" id=\"__exact_hydration\">{\"endpoint\":\"/__exact\",\"endpoints\":{\"actions\":{\"save\":1}},\"state\":{\"ready\":true}}</script>";

    expect(readExactHydrationConfig(root)).toEqual({
      endpoint: "/__exact",
      state: { ready: true }
    });
  });

  it("ignores malformed state contracts in the hydration bootstrap script", () => {
    const root = document.createElement("main");
    root.innerHTML = "<script type=\"application/json\" id=\"__exact_hydration\">{\"endpoint\":\"/__exact\",\"stateContracts\":{\"save\":{\"reads\":[{\"path\":\"project.id\",\"kind\":\"inspect\",\"confidence\":\"exact\"}]}}}</script>";

    expect(readExactHydrationConfig(root)).toEqual({
      endpoint: "/__exact"
    });
  });

  it("creates clients from hydration bootstrap data by default", async () => {
    document.body.innerHTML = "<script type=\"application/json\" id=\"__exact_hydration\">{\"endpoint\":\"/__exact\",\"state\":{\"project\":{\"id\":\"p1\",\"secret\":\"hidden\"}},\"stateContracts\":{\"save\":{\"reads\":[{\"path\":\"project.id\",\"kind\":\"read\",\"confidence\":\"exact\"}]}}}</script>";
    const container = document.createElement("main");
    document.body.appendChild(container);
    let requestBody: any;
    const client = createExactClient(container, {
      fetch: async (input, init) => {
        requestBody = JSON.parse(init.body);
        expect(input).toBe("/__exact");
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, type: "action", id: "save" };
          }
        };
      }
    });

    await client.invokeAction("save");

    expect(client.state).toEqual({ project: { id: "p1", secret: "hidden" } });
    expect(requestBody.state).toEqual({ project: { id: "p1" } });
    document.body.innerHTML = "";
  });

  it("sends configured action boundary snapshots with action invocations", async () => {
    const container = document.createElement("main");
    container.innerHTML = "<!--exact:profile--><p>Ada</p><!--/exact:profile--><span data-exact-server-slot=\"profile:children\"><em>Child</em></span>";
    let requestBody: any;
    const client = createExactClient(container, {
      endpoint: "/__exact",
      actionBoundaries: {
        save: ["profile", "profile:children", "missing"]
      },
      fetch: async (_input, init) => {
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, type: "action", id: "save" };
          }
        };
      }
    });

    await client.invokeAction("save");

    expect(requestBody.boundaryHtmls).toEqual({
      profile: "<p>Ada</p>",
      "profile:children": "<em>Child</em>"
    });
  });

  it("auto-hydrates client islands returned from action patches", async () => {
    const container = document.createElement("main");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";
    const fetch = async (_input: string, init: { body: string }) => {
      const response = await handleExactRequest({
        method: "POST",
        body: JSON.parse(init.body)
      }, {
        manifest: {
          version: 1,
          actions: {
            save: { id: "save", placement: "server" }
          },
          boundaries: {
            panel: { id: "panel" }
          }
        },
        actions: {
          save: () => ({
            patches: [{
              type: "replace",
              id: "panel",
              html: "<div data-exact-client-boundary=\"counter\" data-exact-client-name=\"Counter_ExactClient_1\" data-exact-client-props='{\"props\":{\"count\":8}}'></div>"
            }]
          })
        }
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() {
          return JSON.parse(response.body);
        }
      };
    };

    function Counter(this: Component<{ count: number }>, props: { count: number }) {
      this.state.count = props.count;
      return () => createVNode("button", null, String(this.state.count));
    }

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch,
      islands: {
        Counter_ExactClient_1: Counter
      }
    });
    await client.invokeAction("save");

    expect(container.querySelector("button")?.textContent).toBe("8");
    expect(container.querySelector("[data-exact-client-hydrated=\"true\"]")).not.toBeNull();
  });

  it("hydrates server-rendered client island placeholders", () => {
    const container = document.createElement("main");
    container.innerHTML = "<div data-exact-client-boundary=\"island-1\" data-exact-client-name=\"Counter_ExactClient_1\" data-exact-client-props='{\"props\":{\"count\":2}}'></div>";

    function Counter(this: Component<{ count: number }>, props: { count: number }) {
      this.state.count = props.count;
      return () => createVNode("button", null, String(this.state.count));
    }

    const hydrated = hydrateClientIslands(container, {
      Counter_ExactClient_1: Counter
    });

    expect(hydrated).toBe(1);
    expect(container.querySelector("[data-exact-client-hydrated=\"true\"]")).not.toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("2");
  });

  it("hydrates nested islands from the current DOM instead of a stale preorder snapshot", () => {
    const container = document.createElement("main");
    container.innerHTML = '<div data-exact-client-boundary="outer" data-exact-client-name="Outer"></div>';
    function Inner() { return () => createVNode("button", null, "Inner"); }
    function Outer() {
      return () => createVNode("section", null, createVNode("div", {
        "data-exact-client-boundary": "inner",
        "data-exact-client-name": "Inner"
      }));
    }
    expect(hydrateClientIslands(container, { Outer, Inner })).toBe(2);
    expect(container.querySelector("button")?.textContent).toBe("Inner");
    expect(container.querySelectorAll('[data-exact-client-hydrated="true"]')).toHaveLength(2);
  });

  it("ignores unsafe object keys in server-rendered client island props", () => {
    const container = document.createElement("main");
    container.innerHTML = "<div data-exact-client-boundary=\"island-1\" data-exact-client-name=\"Counter_ExactClient_1\" data-exact-client-props='{\"props\":{\"count\":2,\"__proto__\":{\"polluted\":true},\"constructor\":{\"polluted\":true},\"prototype\":{\"polluted\":true}}}'></div>";
    let receivedProps: any;

    function Counter(this: Component<{ count: number }>, props: { count: number }) {
      receivedProps = props;
      this.state.count = props.count;
      return () => createVNode("button", null, String(this.state.count));
    }

    const hydrated = hydrateClientIslands(container, {
      Counter_ExactClient_1: Counter
    });

    expect(hydrated).toBe(1);
    expect(receivedProps.count).toBe(2);
    expect(receivedProps.polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it("rejects over-deep client island props without recursive traversal", () => {
    const container = document.createElement("main");
    const boundary = document.createElement("div");
    boundary.setAttribute("data-exact-client-boundary", "deep");
    boundary.setAttribute("data-exact-client-name", "Deep");
    const props: Record<string, unknown> = {};
    let cursor = props;
    for (let index = 0; index < 150; index++) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    boundary.setAttribute("data-exact-client-props", JSON.stringify({ props }));
    container.append(boundary);
    let received: unknown;
    expect(hydrateClientIslands(container, {
      Deep(_props) { received = _props; return () => null; }
    })).toBe(1);
    expect(received).toEqual({});
  });

  it("hydrates client islands without replacing server child slots", () => {
    const container = document.createElement("main");
    container.innerHTML = "<div data-exact-client-boundary=\"island-children\" data-exact-client-name=\"Shell_ExactClient_1\" data-exact-client-props='{\"props\":{\"children\":{\"__exactServerSlot\":\"island-children:children\"}}}'><span data-exact-server-slot=\"island-children:children\" style=\"display: contents;\"><p>Server child</p></span></div>";

    function Shell(this: Component<{}>, props: { children?: unknown }) {
      return () => createVNode("section", null, props.children);
    }

    const hydrated = hydrateClientIslands(container, {
      Shell_ExactClient_1: Shell
    });

    expect(hydrated).toBe(1);
    const section = container.querySelector("section");
    expect(section?.querySelector("[data-exact-server-slot=\"island-children:children\"] p")?.textContent).toBe("Server child");
    expect(container.querySelectorAll("[data-exact-server-slot=\"island-children:children\"]")).toHaveLength(1);
  });

  it("leaves unknown client island placeholders in place", () => {
    const container = document.createElement("main");
    container.innerHTML = "<div data-exact-client-boundary=\"island-1\" data-exact-client-name=\"Missing_ExactClient_1\"></div>";

    expect(hydrateClientIslands(container, {}, { logger: noopLogger })).toBe(0);
    expect(container.querySelector("[data-exact-client-boundary]")).not.toBeNull();
  });

  it("refreshes a server boundary and hydrates returned client islands", async () => {
    const container = document.createElement("main");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";
    const fetch = async (_input: string, init: { body: string }) => {
      const response = await handleExactRequest({
        method: "POST",
        body: JSON.parse(init.body)
      }, {
        manifest: {
          version: 1,
          boundaries: {
            panel: { id: "panel" }
          }
        },
        refreshBoundaries: {
          panel: () => ({
            patches: [{
              type: "replace",
              id: "panel",
              html: "<div data-exact-client-boundary=\"counter\" data-exact-client-name=\"Counter_ExactClient_1\" data-exact-client-props='{\"props\":{\"count\":4}}'></div>"
            }]
          })
        }
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() {
          return JSON.parse(response.body);
        }
      };
    };

    function Counter(this: Component<{ count: number }>, props: { count: number }) {
      this.state.count = props.count;
      return () => createVNode("button", null, String(this.state.count));
    }

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch
    });
    await client.refreshIsland("panel", {
      Counter_ExactClient_1: Counter
    });

    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("4");
    expect(container.querySelector("[data-exact-client-hydrated=\"true\"]")).not.toBeNull();
  });

  it("auto-hydrates refreshed client islands from configured registries", async () => {
    const container = document.createElement("main");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";
    const fetch = async (_input: string, init: { body: string }) => {
      const response = await handleExactRequest({
        method: "POST",
        body: JSON.parse(init.body)
      }, {
        manifest: {
          version: 1,
          boundaries: {
            panel: { id: "panel" }
          }
        },
        refreshBoundaries: {
          panel: () => ({
            patches: [{
              type: "replace",
              id: "panel",
              html: "<div data-exact-client-boundary=\"counter\" data-exact-client-name=\"Counter_ExactClient_1\" data-exact-client-props='{\"props\":{\"count\":7}}'></div>"
            }]
          })
        }
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() {
          return JSON.parse(response.body);
        }
      };
    };

    function Counter(this: Component<{ count: number }>, props: { count: number }) {
      this.state.count = props.count;
      return () => createVNode("button", null, String(this.state.count));
    }

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch,
      islands: {
        Counter_ExactClient_1: Counter
      }
    });
    await client.refreshBoundary("panel");

    expect(container.querySelector("button")?.textContent).toBe("7");
    expect(container.querySelector("[data-exact-client-hydrated=\"true\"]")).not.toBeNull();
  });

  it("falls back to refresh replacement html when fine-grained patches miss", async () => {
    const container = document.createElement("main");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";
    const fetch = async (_input: string, init: { body: string }) => {
      const response = await handleExactRequest({
        method: "POST",
        body: JSON.parse(init.body)
      }, {
        manifest: {
          version: 1,
          boundaries: {
            panel: { id: "panel" }
          }
        },
        refreshBoundaries: {
          panel: () => ({
            patches: [{ type: "text", id: "missing", value: "No target" }],
            html: "<section>Fallback</section>"
          })
        }
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() {
          return JSON.parse(response.body);
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch
    });
    await client.refreshBoundary("panel");

    expect(container.innerHTML).toBe("<!--exact:panel--><section>Fallback</section><!--/exact:panel-->");
  });

  it("refreshes server child slots without replacing the client island", async () => {
    const container = document.createElement("main");
    container.innerHTML = "<div data-exact-client-boundary=\"island-children\" data-exact-client-name=\"Shell_ExactClient_1\" data-exact-client-props='{\"props\":{\"children\":{\"__exactServerSlot\":\"island-children:children\"}}}'><span data-exact-server-slot=\"island-children:children\" style=\"display: contents;\"><p>Old child</p></span></div>";
    let requestBody: any;
    const fetch = async (_input: string, init: { body: string }) => {
      requestBody = JSON.parse(init.body);
      const response = await handleExactRequest({
        method: "POST",
        body: requestBody
      }, {
        manifest: {
          version: 1,
          boundaries: {
            "island-children:children": { id: "island-children:children" }
          }
        },
        refreshBoundaries: {
          "island-children:children": () => ({
            patches: [{
              type: "replace",
              id: "island-children:children",
              html: "<p>New child</p>"
            }]
          })
        }
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() {
          return JSON.parse(response.body);
        }
      };
    };

    function Shell(this: Component<{}>, props: { children?: unknown }) {
      return () => createVNode("section", { "data-shell": "stable" }, props.children);
    }

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch,
      islands: {
        Shell_ExactClient_1: Shell
      }
    });
    hydrateClientIslands(container, {
      Shell_ExactClient_1: Shell
    });
    const shell = container.querySelector("section");

    await client.refreshBoundary("island-children:children");

    expect(requestBody.boundaryHtml).toBe("<p>Old child</p>");
    expect(container.querySelector("section")).toBe(shell);
    expect(container.querySelector("[data-exact-server-slot=\"island-children:children\"] p")?.textContent).toBe("New child");
  });

  it("applies text patches to exact marker ranges", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";

    expect(applyPatches(container, [{ type: "text", id: "title", value: "New" }])).toBe(true);

    expect(container.textContent).toBe("New");
  });

  it("reports false when patches cannot apply", () => {
    const container = document.createElement("div");

    expect(applyPatches(container, [{ type: "text", id: "missing", value: "New" }], { logger: noopLogger })).toBe(false);
  });

  it("applies text and replacement patches to server child slots", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span data-exact-server-slot=\"slot-1\" style=\"display: contents;\"><p>Old</p></span>";

    applyPatches(container, [{ type: "text", id: "slot-1", value: "Plain" }]);
    expect(container.querySelector("[data-exact-server-slot=\"slot-1\"]")?.textContent).toBe("Plain");

    applyPatches(container, [{ type: "replace", id: "slot-1", html: "<strong>Rich</strong>" }]);
    expect(container.querySelector("[data-exact-server-slot=\"slot-1\"] strong")?.textContent).toBe("Rich");
  });

  it("applies replacement patches to exact marker ranges", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";

    applyPatches(container, [{ type: "replace", id: "panel", html: "<section>New</section>" }]);

    expect(container.innerHTML).toBe("<!--exact:panel--><section>New</section><!--/exact:panel-->");
  });

  it("applies replacement patches to client boundary elements without markers", () => {
    const container = document.createElement("div");
    container.innerHTML = "<div data-exact-client-boundary=\"panel\" data-exact-client-name=\"Panel_ExactClient_1\"><p>Old</p></div>";

    applyPatches(container, [{
      type: "replace",
      id: "panel",
      html: "<div data-exact-client-boundary=\"panel\" data-exact-client-name=\"Panel_ExactClient_1\"><p>New</p></div>"
    }]);

    expect(container.querySelector("[data-exact-client-boundary=\"panel\"] p")?.textContent).toBe("New");
  });

  it("applies replacement patches to exact id elements", () => {
    const container = document.createElement("div");
    container.innerHTML = "<section data-exact-id=\"panel\"><p>Old</p></section>";

    applyPatches(container, [{
      type: "replace",
      id: "panel",
      html: "<section data-exact-id=\"panel\"><strong>New</strong></section>"
    }]);

    expect(container.querySelector("[data-exact-id=\"panel\"] strong")?.textContent).toBe("New");
  });

  it("applies prop and style patches to exact id elements", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button data-exact-id=\"save\">Save</button>";

    applyPatches(container, [
      { type: "prop", id: "save", name: "disabled", value: true },
      { type: "style", id: "save", name: "color", value: "red" }
    ]);

    const button = container.querySelector("button")!;
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("style")).toContain("color: red");
  });

  it("applies prop patches to the first element in an exact marker range", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:panel--><p class=\"old\" hidden=\"true\">Loading</p><!--/exact:panel-->";

    applyPatches(container, [
      { type: "prop", id: "panel", name: "class", value: "new" },
      { type: "prop", id: "panel", name: "hidden", value: null },
      { type: "text", id: "panel", value: "Ready" }
    ]);

    const paragraph = container.querySelector("p")!;
    expect(paragraph.getAttribute("class")).toBe("new");
    expect(paragraph.hasAttribute("hidden")).toBe(false);
    expect(paragraph.textContent).toBe("Ready");
  });

  it("applies keyed list insert, move, and remove patches", () => {
    const container = document.createElement("div");
    container.innerHTML = "<ul><!--exact:list--><!--exact:item:1:a--><li>A</li><!--/exact:item:1:a--><!--exact:item:2:b--><li>B</li><!--/exact:item:2:b--><!--/exact:list--></ul>";

    applyPatches(container, [
      { type: "list", id: "list", op: "insert", key: "c", before: "b", html: "<!--exact:item:3:c--><li>C</li><!--/exact:item:3:c-->" },
      { type: "list", id: "list", op: "move", key: "a", before: "c" },
      { type: "list", id: "list", op: "remove", key: "b" }
    ]);

    expect(Array.from(container.querySelectorAll("li")).map(item => item.textContent)).toEqual(["A", "C"]);
  });

  it("rejects list HTML whose declared marker does not match the patch key", () => {
    const container = document.createElement("div");
    container.innerHTML = "<ul><!--exact:list--><!--exact:item:1:a--><li>A</li><!--/exact:item:1:a--><!--/exact:list--></ul>";
    const before = container.innerHTML;

    expect(applyPatches(container, [{
      type: "list", id: "list", op: "insert", key: "b",
      html: "<!--exact:item:2:c--><li>C</li><!--/exact:item:2:c-->"
    }], { logger: noopLogger })).toBe(false);
    expect(container.innerHTML).toBe(before);
  });

  it("rejects nested list-item markers that the direct list index cannot own", () => {
    const container = document.createElement("div");
    container.innerHTML = "<ul><!--exact:list--><!--/exact:list--></ul>";
    const before = container.innerHTML;

    expect(applyPatches(container, [{
      type: "list", id: "list", op: "insert", key: "a",
      html: "<div><!--exact:item:1:a--><li>A</li><!--/exact:item:1:a--></div>"
    }], { logger: noopLogger })).toBe(false);
    expect(container.innerHTML).toBe(before);
  });

  it("rejects DOM outside the keyed range while allowing nested protocol boundaries", () => {
    const invalid = document.createElement("div");
    invalid.innerHTML = "<ul><!--exact:list--><!--/exact:list--></ul>";
    expect(applyPatches(invalid, [{
      type: "list", id: "list", op: "insert", key: "a",
      html: "stray<!--exact:item:1:a--><li>A</li><!--/exact:item:1:a-->"
    }], { logger: noopLogger })).toBe(false);
    expect(invalid.textContent).toBe("");

    const nested = document.createElement("div");
    nested.innerHTML = "<ul><!--exact:list--><!--/exact:list--></ul>";
    expect(applyPatches(nested, [{
      type: "list", id: "list", op: "insert", key: "a",
      html: " <!--exact:item:1:a--><!--exact:detail--><li>A</li><!--/exact:detail--><!--/exact:item:1:a--> "
    }])).toBe(true);
    expect(nested.querySelector("li")?.textContent).toBe("A");
  });

  it("tracks a recovered missing move through later patches in the same batch", () => {
    const container = document.createElement("div");
    container.innerHTML = "<ul><!--exact:list--><!--/exact:list--></ul>";

    expect(applyPatches(container, [
      {
        type: "list", id: "list", op: "move", key: "a",
        html: "<!--exact:item:1:a--><li>A</li><!--/exact:item:1:a-->"
      },
      { type: "list", id: "list", op: "remove", key: "a" }
    ])).toBe(true);
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("throws on patch mismatch in strict mode", () => {
    const container = document.createElement("div");

    expect(() => applyPatches(container, [{ type: "text", id: "missing", value: "x" }], { onMismatch: "throw", logger: noopLogger })).toThrow("Could not apply exact patch");
  });

  it("invokes the configured endpoint and applies returned patches", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";
    const requests: unknown[] = [];
    const fetch = async (_input: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            type: "action",
            id: "save-title",
            state: { saved: true },
            patches: [{ type: "text", id: "title", value: "New" }]
          };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: { saved: false },
      fetch
    });
    await client.invokeAction("save-title", { title: "New" });

    expect(requests).toEqual([{
      type: "action",
      id: "save-title",
      payload: { title: "New" },
      state: { saved: false }
    }]);
    expect(container.textContent).toBe("New");
    expect(client.state).toEqual({ saved: true });
  });

  it("invokes streaming endpoints and applies returned patches", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";
    let requestHeaders: Record<string, string> | undefined;

    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: { saved: false },
      stream: true,
      fetch: async (_input, init) => {
        requestHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          body: ndjsonResponse([
            { event: "start", version: 1, operations: 1 },
            {
              event: "patch",
              version: 1,
              index: 0,
              type: "action",
              id: "save-title",
              patch: { type: "text", id: "title", value: "Streamed" }
            },
            {
              event: "state",
              version: 1,
              index: 0,
              type: "action",
              id: "save-title",
              value: { saved: true }
            },
            {
              event: "result",
              version: 1,
              index: 0,
              result: { ok: true, type: "action", id: "save-title" }
            },
            { event: "complete", version: 1 }
          ]),
          async json() {
            throw new Error("json should not be read for streaming responses");
          }
        };
      }
    });

    await client.invokeAction("save-title", { title: "Streamed" });

    expect(requestHeaders?.accept).toBe("application/x-ndjson");
    expect(container.textContent).toBe("Streamed");
    expect(client.state).toEqual({ saved: true });
  });

  it("invokes exact batch endpoints directly", async () => {
    let requestBody: any;
    const results = await invokeExactBatch({
      endpoint: "/__exact",
      operations: [
        { type: "action", id: "save", payload: { title: "Ready" } },
        { type: "refresh", id: "panel", boundaryHtml: "<p>Old</p>" }
      ],
      fetch: async (_input, init) => {
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              ok: true,
              version: 1,
              results: [
                { ok: true, type: "action", id: "save", patches: [{ type: "text", id: "title", value: "Ready" }] },
                { ok: false, type: "refresh", id: "panel", status: 404, error: "not_found" }
              ]
            };
          }
        };
      }
    });

    expect(requestBody).toEqual({
      type: "batch",
      version: 1,
      operations: [
        { type: "action", id: "save", payload: { title: "Ready" } },
        { type: "refresh", id: "panel", boundaryHtml: "<p>Old</p>" }
      ]
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ ok: true, id: "save" });
    expect(results[1]).toMatchObject({ ok: false, id: "panel" });
  });

  it("invokes streaming exact endpoints directly", async () => {
    let requestHeaders: Record<string, string> | undefined;
    const result = await invokeExact({
      endpoint: "/__exact",
      type: "refresh",
      id: "panel",
      stream: true,
      fetch: async (_input, init) => {
        requestHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          body: ndjsonResponse([
            { event: "start", version: 1, operations: 1 },
            {
              event: "result",
              version: 1,
              index: 0,
              result: {
                ok: true,
                type: "refresh",
                id: "panel",
                patches: [{ type: "replace", id: "panel", html: "<p>Ready</p>" }]
              }
            },
            { event: "complete", version: 1 }
          ]),
          async json() {
            throw new Error("json should not be read for streaming responses");
          }
        };
      }
    });

    expect(requestHeaders?.accept).toBe("application/x-ndjson");
    expect(result).toEqual({
      patches: [{ type: "replace", id: "panel", html: "<p>Ready</p>" }]
    });
  });

  it("sends serialized context through direct endpoint invocations", async () => {
    let requestBody: unknown;
    const result = await invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      context: {
        AuthContext: { id: "u1" }
      },
      fetch: async (_input, init) => {
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              ok: true,
              type: "action",
              id: "save",
              state: { saved: true }
            };
          }
        };
      }
    });

    expect(requestBody).toEqual({
      type: "action",
      id: "save",
      context: {
        AuthContext: { id: "u1" }
      }
    });
    expect(result).toEqual({ state: { saved: true } });
  });

  it("parses out-of-order streaming batch results into request order", async () => {
    const results = await invokeExactBatch({
      endpoint: "/__exact",
      stream: true,
      operations: [
        { type: "action", id: "save", opId: "slow" },
        { type: "refresh", id: "panel", opId: "fast" }
      ],
      fetch: async () => ({
        ok: true,
        status: 200,
        body: ndjsonResponse([
          { event: "start", version: 1, operations: 2 },
          {
            event: "state",
            version: 1,
            index: 1,
            type: "refresh",
            id: "panel",
            opId: "fast",
            value: { fast: true }
          },
          {
            event: "result",
            version: 1,
            index: 1,
            result: { ok: true, type: "refresh", id: "panel", opId: "fast" }
          },
          {
            event: "state",
            version: 1,
            index: 0,
            type: "action",
            id: "save",
            opId: "slow",
            value: { slow: true }
          },
          {
            event: "result",
            version: 1,
            index: 0,
            result: { ok: true, type: "action", id: "save", opId: "slow" }
          },
          { event: "complete", version: 1 }
        ]),
        async json() {
          throw new Error("json should not be read for streaming responses");
        }
      })
    });

    expect(results).toEqual([
      { ok: true, type: "action", id: "save", opId: "slow", state: { slow: true } },
      { ok: true, type: "refresh", id: "panel", opId: "fast", state: { fast: true } }
    ]);
  });

  it("rejects malformed streaming response events", async () => {
    await expect(invokeExactBatch({
      endpoint: "/__exact",
      stream: true,
      operations: [
        { type: "action", id: "save" },
        { type: "refresh", id: "panel" }
      ],
      fetch: async () => ({
        ok: true,
        status: 200,
        body: ndjsonResponse([
          { event: "start", version: 1, operations: 2 },
          {
            event: "result",
            version: 1,
            index: 0,
            result: { ok: true, type: "action", id: "save", state: { saved: true } }
          },
          { event: "complete", version: 1 }
        ]),
        async json() {
          throw new Error("json should not be read for streaming responses");
        }
      })
    })).rejects.toThrow("eXact stream invocation returned malformed events");
  });

  it("enforces streamed response byte and event ceilings incrementally", async () => {
    const fetch = async () => ({
      ok: true,
      status: 200,
      body: ndjsonResponse([
        { event: "start", version: 1, operations: 1 },
        { event: "result", version: 1, index: 0, result: { ok: true, type: "action", id: "save" } },
        { event: "complete", version: 1 }
      ]),
      async json() { throw new Error("json should not be read"); }
    });
    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", stream: true,
      streamLimits: { maxBytes: 16 }, fetch
    })).rejects.toThrow("exceeded maxBytes");
    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", stream: true,
      streamLimits: { maxEvents: 2 }, fetch
    })).rejects.toThrow("exceeded maxEvents");
  });

  it("rejects stream chunks emitted after an operation result", async () => {
    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      stream: true,
      fetch: async () => ({
        ok: true,
        status: 200,
        body: ndjsonResponse([
          { event: "start", version: 1, operations: 1 },
          { event: "result", version: 1, index: 0, result: { ok: true, type: "action", id: "save" } },
          { event: "state", version: 1, index: 0, type: "action", id: "save", value: { late: true } },
          { event: "complete", version: 1 }
        ]),
        async json() { throw new Error("json should not be read"); }
      })
    })).rejects.toThrow("malformed events");
  });

  it("rejects mismatched operation identities in JSON and streamed responses", async () => {
    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save",
      fetch: async () => ({
        ok: true, status: 200,
        async json() { return { ok: true, type: "action", id: "other" }; }
      })
    })).rejects.toThrow("malformed result");

    await expect(invokeExactBatch({
      endpoint: "/__exact", stream: true,
      operations: [{ type: "action", id: "save", opId: "save-op" }],
      fetch: async () => ({
        ok: true, status: 200,
        body: ndjsonResponse([
          { event: "start", version: 1, operations: 1 },
          { event: "result", version: 1, index: 0, result: { ok: true, type: "action", id: "other", opId: "save-op" } },
          { event: "complete", version: 1 }
        ]),
        async json() { throw new Error("json should not be read"); }
      })
    })).rejects.toThrow("malformed results");

    await expect(invokeExactBatch({
      endpoint: "/__exact", stream: true,
      operations: [
        { type: "action", id: "save" },
        { type: "refresh", id: "panel" }
      ],
      fetch: async () => ({
        ok: true, status: 200,
        body: ndjsonResponse([
          { event: "start", version: 1, operations: 2 },
          { event: "state", version: 1, index: 0, type: "refresh", id: "panel", value: { swapped: true } }
        ]),
        async json() { throw new Error("json should not be read"); }
      })
    })).rejects.toThrow("malformed events");
  });

  it("rejects malformed UTF-8 and oversized non-stream responses", async () => {
    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", stream: true,
      fetch: async () => ({
        ok: true, status: 200,
        body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } }),
        async json() { throw new Error("json should not be read"); }
      })
    })).rejects.toThrow("malformed events");

    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", streamLimits: { maxBytes: 32 },
      fetch: async () => ({
        ok: true, status: 200,
        async text() { return JSON.stringify({ ok: true, type: "action", id: "save", html: "x".repeat(100) }); },
        async json() { throw new Error("json should not be read"); }
      })
    })).rejects.toThrow("exceeded maxBytes");

    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", streamLimits: { maxBytes: 32 },
      fetch: async () => ({
        ok: true, status: 200,
        async json() { return { ok: true, type: "action", id: "save", html: "x".repeat(100) }; }
      })
    })).rejects.toThrow("exceeded maxBytes");
  });

  it("enforces streamed patch limits and rejects duplicate singleton chunks", async () => {
    const response = (events: unknown[]) => async () => ({
      ok: true,
      status: 200,
      body: ndjsonResponse(events),
      async json() { throw new Error("json should not be read"); }
    });
    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", stream: true,
      streamLimits: { maxPatches: 1 },
      fetch: response([
        { event: "start", version: 1, operations: 1 },
        { event: "patch", version: 1, index: 0, type: "action", id: "save", patch: { type: "text", id: "a", value: "A" } },
        { event: "patch", version: 1, index: 0, type: "action", id: "save", patch: { type: "text", id: "b", value: "B" } }
      ])
    })).rejects.toThrow("malformed events");

    await expect(invokeExact({
      endpoint: "/__exact", type: "action", id: "save", stream: true,
      fetch: response([
        { event: "start", version: 1, operations: 1 },
        { event: "state", version: 1, index: 0, type: "action", id: "save", value: { count: 1 } },
        { event: "state", version: 1, index: 0, type: "action", id: "save", value: { count: 2 } }
      ])
    })).rejects.toThrow("malformed events");
  });

  it("normalizes successful exact invocation responses", async () => {
    const result = await invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            type: "action",
            id: "save",
            state: { saved: true },
            patches: [{ type: "text", id: "title", value: "Saved" }]
          };
        }
      })
    });

    expect(result).toEqual({
      state: { saved: true },
      patches: [{ type: "text", id: "title", value: "Saved" }]
    });
    expect("ok" in result).toBe(false);
  });

  it("rejects malformed successful exact invocation responses", async () => {
    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            patches: [{ type: "text", id: "title", value: "Saved" }]
          };
        }
      })
    })).rejects.toThrow("eXact action invocation returned malformed result");

    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            patches: [{ type: "state", id: "profile", value: undefined }]
          };
        }
      })
    })).rejects.toThrow("eXact action invocation returned malformed result");

    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            state: { savedAt: new Date("2026-01-01T00:00:00.000Z") }
          };
        }
      })
    })).rejects.toThrow("eXact action invocation returned malformed result");

    const cyclicPatchValue: Record<string, unknown> = {};
    cyclicPatchValue.self = cyclicPatchValue;
    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            patches: [{ type: "text", id: 1, value: "Saved" }]
          };
        }
      })
    })).rejects.toThrow("eXact action invocation returned malformed result");

    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            state: undefined
          };
        }
      })
    })).rejects.toThrow("eXact action invocation returned malformed result");

    await expect(invokeExact({
      endpoint: "/__exact",
      type: "action",
      id: "save",
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            patches: [{ type: "state", id: "profile", value: cyclicPatchValue }]
          };
        }
      })
    })).rejects.toThrow("eXact action invocation returned malformed result");
  });

  it("rejects malformed exact batch response envelopes", async () => {
    await expect(invokeExactBatch({
      endpoint: "/__exact",
      operations: [{ type: "action", id: "save" }],
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            version: 1,
            results: []
          };
        }
      })
    })).rejects.toThrow("eXact batch invocation returned malformed results");

    await expect(invokeExactBatch({
      endpoint: "/__exact",
      operations: [{ type: "action", id: "save" }],
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            version: 1,
            results: [
              { ok: true, type: "action", id: "save", opId: undefined, patches: [] }
            ]
          };
        }
      })
    })).rejects.toThrow("eXact batch invocation returned malformed results");

    await expect(invokeExactBatch({
      endpoint: "/__exact",
      operations: [{ type: "action", id: "save" }],
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            version: 2,
            results: []
          };
        }
      })
    })).rejects.toThrow("eXact batch invocation returned malformed results");

    await expect(invokeExactBatch({
      endpoint: "/__exact",
      operations: [{ type: "action", id: "save" }],
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            version: 1,
            results: [],
            debug: true
          };
        }
      })
    })).rejects.toThrow("eXact batch invocation returned malformed results");
  });

  it("rejects malformed exact batch operation responses", async () => {
    await expect(invokeExactBatch({
      endpoint: "/__exact",
      operations: [{ type: "action", id: "save" }],
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            version: 1,
            results: [
              { ok: true, type: "action", id: "save", patches: [{ type: "replace", id: 1, html: "<p />" }] }
            ]
          };
        }
      })
    })).rejects.toThrow("eXact batch invocation returned malformed results");
  });

  it("coalesces same-tick client operations into a batch request", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title--><!--exact:panel--><p>Old</p><!--/exact:panel-->";
    const requests: unknown[] = [];
    const fetch = async (_input: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            version: 1,
            results: [
              {
                ok: true,
                type: "action",
                id: "save-title",
                state: { saved: true },
                patches: [{ type: "text", id: "title", value: "New" }]
              },
              {
                ok: true,
                type: "refresh",
                id: "panel",
                patches: [{ type: "replace", id: "panel", html: "<section>Panel</section>" }]
              }
            ]
          };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: { saved: false },
      fetch
    });
    const action = client.invokeAction("save-title", { title: "New" });
    const refresh = client.refreshBoundary("panel");

    await Promise.all([action, refresh]);

    expect(requests).toEqual([{
      type: "batch",
      version: 1,
      operations: [
        {
          type: "action",
          id: "save-title",
          payload: { title: "New" },
          state: { saved: false }
        },
        {
          type: "refresh",
          id: "panel",
          state: { saved: false },
          boundaryHtml: "<p>Old</p>"
        }
      ]
    }]);
    expect(container.textContent).toBe("NewPanel");
    expect(client.state).toEqual({ saved: true });
  });

  it("routes same-tick operations into endpoint-specific batches", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title--><!--exact:remote-panel--><p>Remote</p><!--/exact:remote-panel-->";
    const requests: { input: string; body: unknown }[] = [];
    const fetch = async (input: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      requests.push({ input, body });
      return {
        ok: true,
        status: 200,
        async json() {
          const resultFor = (operation: { type: string; id: string }) => ({
            ok: true,
            type: operation.type,
            id: operation.id,
            patches: operation.id === "save-title"
              ? [{ type: "text", id: "title", value: "Saved" }]
              : operation.id === "remote-panel"
                ? [{ type: "replace", id: "remote-panel", html: "<section>Remote</section>" }]
                : []
          });
          return body.type === "batch"
            ? {
              ok: true,
              version: 1,
              results: body.operations.map(resultFor)
            }
            : {
              ok: true,
              type: body.type,
              id: body.id,
              patches: resultFor(body).patches
            };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      endpoints: {
        actions: {
          "save-remote": "https://remote.test/__exact"
        },
        boundaries: {
          "remote-panel": "https://remote.test/__exact"
        }
      },
      fetch
    });

    await Promise.all([
      client.invokeAction("save-title"),
      client.refreshBoundary("remote-panel"),
      client.invokeAction("save-remote")
    ]);

    expect(requests).toHaveLength(2);
    expect(requests.map(request => request.input).sort()).toEqual(["/__exact", "https://remote.test/__exact"]);
    expect(requests.find(request => request.input === "/__exact")?.body).toMatchObject({
      type: "action",
      id: "save-title"
    });
    expect(requests.find(request => request.input === "https://remote.test/__exact")?.body).toMatchObject({
      type: "batch",
      version: 1,
      operations: [
        {
          type: "refresh",
          id: "remote-panel",
          boundaryHtml: "<p>Remote</p>"
        },
        {
          type: "action",
          id: "save-remote"
        }
      ]
    });
    expect(container.textContent).toBe("SavedRemote");
  });

  it("registers remote hydration metadata after client creation", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:remote-panel--><p>Old remote</p><!--/exact:remote-panel-->";
    const requests: { input: string; body: unknown }[] = [];
    const fetch = async (input: string, init: { body: string }) => {
      requests.push({ input, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            type: "action",
            id: "remote-save",
            patches: [{ type: "replace", id: "remote-panel", html: "<section>Saved remote</section>" }],
            state: { project: { id: "p1", title: "Saved" } }
          };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: { project: { id: "p1", title: "Draft", secret: "local-only" } },
      fetch
    });
    client.registerManifest({
      endpoints: {
        actions: {
          "remote-save": "https://remote.test/__exact"
        }
      },
      stateContracts: {
        "remote-save": {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
        }
      },
      actionBoundaries: {
        "remote-save": ["remote-panel"]
      }
    });

    await client.invokeAction("remote-save", { title: "Saved" });

    expect(requests).toEqual([{
      input: "https://remote.test/__exact",
      body: {
        type: "action",
        id: "remote-save",
        payload: { title: "Saved" },
        state: { project: { id: "p1" } },
        boundaryHtmls: {
          "remote-panel": "<p>Old remote</p>"
        }
      }
    }]);
    expect(client.state).toEqual({ project: { id: "p1", title: "Saved" } });
    expect(container.textContent).toBe("Saved remote");
  });

  it("hydrates client islands registered by a remote manifest", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:remote-panel--><p>Loading</p><!--/exact:remote-panel-->";
    function RemoteIsland(this: Component<{}>, props: { label: string }) {
      return () => createVNode("button", null, props.label);
    }
    const fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          type: "refresh",
          id: "remote-panel",
          patches: [{
            type: "replace",
            id: "remote-panel",
            html: "<div data-exact-client-boundary=\"remote-island\" data-exact-client-name=\"RemoteIsland\" data-exact-client-props='{\"props\":{\"label\":\"Loaded\"}}'></div>"
          }]
        };
      }
    });

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch
    });
    client.registerManifest({
      endpoints: {
        boundaries: {
          "remote-panel": "https://remote.test/__exact"
        }
      },
      islands: {
        RemoteIsland
      }
    });

    await client.refreshBoundary("remote-panel");

    expect(container.querySelector("[data-exact-client-boundary=\"remote-island\"]")?.getAttribute("data-exact-client-hydrated")).toBe("true");
    expect(container.querySelector("button")?.textContent).toBe("Loaded");
  });

  it("hydrates existing client island placeholders when registering a remote manifest", () => {
    const container = document.createElement("div");
    container.innerHTML = "<div data-exact-client-boundary=\"remote-island\" data-exact-client-name=\"RemoteIsland\" data-exact-client-props='{\"props\":{\"label\":\"Loaded\"}}'></div>";
    let renders = 0;
    function RemoteIsland(this: Component<{}>, props: { label: string }) {
      renders++;
      return () => createVNode("button", null, props.label);
    }

    const client = createExactClient(container, {
      endpoint: "/__exact"
    });
    client.registerManifest({
      islands: {
        RemoteIsland
      }
    });
    client.registerManifest({
      islands: {
        RemoteIsland
      }
    });

    expect(container.querySelector("[data-exact-client-boundary=\"remote-island\"]")?.getAttribute("data-exact-client-hydrated")).toBe("true");
    expect(container.querySelector("button")?.textContent).toBe("Loaded");
    expect(renders).toBe(1);
  });

  it("rejects conflicting remote manifest registrations", () => {
    const container = document.createElement("div");
    function RemoteIsland(this: Component<{}>) {
      return () => createVNode("button", null, "Remote");
    }
    function OtherRemoteIsland(this: Component<{}>) {
      return () => createVNode("button", null, "Other");
    }

    const client = createExactClient(container, {
      endpoint: "/__exact",
      endpoints: {
        actions: {
          save: "/__exact"
        }
      },
      stateContracts: {
        save: {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
        }
      },
      actionBoundaries: {
        save: ["profile"]
      },
      islands: {
        RemoteIsland
      }
    });

    expect(() => client.registerManifest({
      endpoint: "https://remote.test/__exact"
    })).toThrow("Conflicting eXact hydration endpoint registration");
    expect(() => client.registerManifest({
      endpoints: {
        actions: {
          save: "https://remote.test/__exact"
        }
      }
    })).toThrow("Conflicting eXact hydration action endpoint route registration: save");
    expect(() => client.registerManifest({
      stateContracts: {
        save: {
          reads: [{ path: "project.title", kind: "read", confidence: "exact" }]
        }
      }
    })).toThrow("Conflicting eXact hydration state contract registration: save");
    expect(() => client.registerManifest({
      actionBoundaries: {
        save: ["other-profile"]
      }
    })).toThrow("Conflicting eXact hydration action boundary registration: save");
    expect(() => client.registerManifest({
      islands: {
        RemoteIsland: OtherRemoteIsland
      }
    })).toThrow("Conflicting eXact hydration client island registration: RemoteIsland");
  });

  it("allows idempotent remote manifest registrations", () => {
    const container = document.createElement("div");
    function RemoteIsland(this: Component<{}>) {
      return () => createVNode("button", null, "Remote");
    }
    const remoteFetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { ok: true, type: "action", id: "save" };
      }
    });

    const client = createExactClient(container, {
      endpoint: "/__exact"
    });
    const registration = {
      endpoints: {
        boundaries: {
          "remote-panel": "https://remote.test/__exact"
        }
      },
      stateContracts: {
        "remote-save": {
          reads: [{ path: "project.id", kind: "read" as const, confidence: "exact" as const }]
        }
      },
      actionBoundaries: {
        "remote-save": ["remote-panel"]
      },
      islands: {
        RemoteIsland
      },
      transports: {
        "https://remote.test/__exact": {
          fetch: remoteFetch,
          headers: {
            "x-remote": "1"
          }
        }
      }
    };

    client.registerManifest(registration);
    client.registerManifest(registration);

    expect(client.endpoints?.boundaries?.["remote-panel"]).toBe("https://remote.test/__exact");
    expect(client.stateContracts?.["remote-save"]?.reads?.[0]?.path).toBe("project.id");
  });

  it("compares idempotent state contracts independent of object key order", () => {
    const container = document.createElement("div");
    const client = createExactClient(container, { endpoint: "/__exact" });
    client.registerManifest({
      stateContracts: {
        save: { reads: [{ path: "project.id", kind: "read", confidence: "exact" }] }
      }
    });

    expect(() => client.registerManifest({
      stateContracts: {
        save: { reads: [{ confidence: "exact", kind: "read", path: "project.id" }] }
      }
    })).not.toThrow();
  });

  it("rejects cyclic state contract registrations without throwing a serialization error", () => {
    const container = document.createElement("div");
    const client = createExactClient(container, { endpoint: "/__exact" });
    const first: Record<string, unknown> = { reads: [] };
    const second: Record<string, unknown> = { reads: [] };
    first.self = first;
    second.self = second;
    client.registerManifest({ stateContracts: { save: first as never } });

    expect(() => client.registerManifest({ stateContracts: { save: second as never } }))
      .toThrow("Conflicting eXact hydration state contract registration: save");
  });

  it("uses endpoint-specific transports for registered remote operations", async () => {
    const container = document.createElement("div");
    const remoteRequests: { input: string; headers: Record<string, string>; body: unknown }[] = [];
    const rootFetch = async () => {
      throw new Error("root fetch should not receive remote operations");
    };
    const remoteFetch = async (input: string, init: { headers: Record<string, string>; body: string }) => {
      remoteRequests.push({ input, headers: init.headers, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        async json() {
          const body = JSON.parse(init.body);
          return {
            ok: true,
            version: 1,
            results: body.operations.map((operation: { type: string; id: string }) => ({
              ok: true,
              type: operation.type,
              id: operation.id,
              patches: []
            }))
          };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch: rootFetch,
      headers: {
        "x-root": "root",
        "x-shared": "root"
      }
    });
    client.registerManifest({
      endpoints: {
        actions: {
          "remote-a": "https://remote.test/__exact",
          "remote-b": "https://remote.test/__exact"
        }
      },
      transports: {
        "https://remote.test/__exact": {
          fetch: remoteFetch,
          headers: {
            "x-remote": "remote",
            "x-shared": "remote"
          }
        }
      }
    });

    await Promise.all([
      client.invokeAction("remote-a"),
      client.invokeAction("remote-b")
    ]);

    expect(remoteRequests).toEqual([{
      input: "https://remote.test/__exact",
      headers: {
        "content-type": "application/json",
        "x-root": "root",
        "x-shared": "remote",
        "x-remote": "remote"
      },
      body: {
        type: "batch",
        version: 1,
        operations: [
          { type: "action", id: "remote-a" },
          { type: "action", id: "remote-b" }
        ]
      }
    }]);
  });

  it("applies successful batched client operations when a sibling operation fails", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";
    const fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          version: 1,
          results: [
            {
              ok: true,
              type: "action",
              id: "save-title",
              patches: [{ type: "text", id: "title", value: "Saved" }]
            },
            {
              ok: false,
              type: "refresh",
              id: "missing-panel",
              status: 404,
              error: "not_found"
            }
          ]
        };
      }
    });

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch
    });
    const action = client.invokeAction("save-title");
    const refresh = client.refreshBoundary("missing-panel");

    await expect(action).resolves.toMatchObject({
      patches: [{ type: "text", id: "title", value: "Saved" }]
    });
    await expect(refresh).rejects.toThrow("eXact refresh invocation failed");
    expect(container.textContent).toBe("Saved");
  });

  it("applies only current boundaries from a partially stale action response", async () => {
    const container = document.createElement("div");
    container.innerHTML = [
      "<!--exact:left--><span data-exact-id=\"left-value\">Left old</span><!--/exact:left-->",
      "<!--exact:right--><span data-exact-id=\"right-value\">Right old</span><!--/exact:right-->"
    ].join("");
    type Response = { ok: true; status: 200; json(): Promise<unknown> };
    let resolveAction!: (response: Response) => void;
    let resolveRefresh!: (response: Response) => void;
    const fetch = async (_input: string, init: { body: string }) => {
      const request = JSON.parse(init.body) as { type: string };
      return await new Promise<Response>(resolve => {
        if (request.type === "action") resolveAction = resolve;
        else resolveRefresh = resolve;
      });
    };
    const diagnostics: string[] = [];
    const client = createExactClient(container, {
      endpoint: "/__exact",
      batch: false,
      fetch,
      state: { version: 0 },
      actionBoundaries: { save: ["left", "left", "right"] },
      onDiagnostic: diagnostic => diagnostics.push(diagnostic.message)
    });

    const action = client.invokeAction("save");
    const refresh = client.refreshBoundary("left");
    await Promise.resolve();
    resolveRefresh({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          type: "refresh",
          id: "left",
          patches: [{ type: "text", id: "left-value", value: "Left newest" }],
          state: { version: 2 }
        };
      }
    });
    await refresh;
    resolveAction({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          type: "action",
          id: "save",
          patches: [
            { type: "text", id: "left-value", value: "Left stale" },
            { type: "text", id: "right-value", value: "Right saved" },
            { type: "text", id: "outside-contract", value: "Unsafe" }
          ],
          state: { version: 1 }
        };
      }
    });
    await action;

    expect(container.querySelector("[data-exact-id=left-value]")?.textContent).toBe("Left newest");
    expect(container.querySelector("[data-exact-id=right-value]")?.textContent).toBe("Right saved");
    expect(client.state).toEqual({ version: 2 });
    expect(diagnostics).toEqual([
      "partially ignored stale exact action response for save (text:left-value, text:outside-contract)"
    ]);
  });

  it("sends current boundary html with refresh requests", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:panel--><p class=\"old\">Loading</p><!--/exact:panel-->";
    const requests: unknown[] = [];
    const fetch = async (_input: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, type: "refresh", id: "panel", patches: [] };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      fetch
    });
    await client.refreshBoundary("panel");

    expect(requests).toEqual([{
      type: "refresh",
      id: "panel",
      boundaryHtml: "<p class=\"old\">Loading</p>"
    }]);
  });

  it("sends only exact state contract reads for actions when available", async () => {
    const container = document.createElement("div");
    const requests: unknown[] = [];
    const fetch = async (_input: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, type: "action", id: "save-project" };
        }
      };
    };

    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: {
        project: { id: "p1", title: "Hidden" },
        user: { id: "u1" }
      },
      stateContracts: {
        "save-project": {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
        }
      },
      fetch
    });

    await client.invokeAction("save-project");

    expect(requests).toEqual([{
      type: "action",
      id: "save-project",
      state: { project: { id: "p1" } }
    }]);
  });

  it("sends exact state contract reads through array paths", async () => {
    const container = document.createElement("div");
    const requests: unknown[] = [];
    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: {
        projects: [
          { id: "p1", secret: "hidden" },
          { id: "p2", secret: "hidden" }
        ]
      },
      stateContracts: {
        "save-project": {
          reads: [{ path: "projects.1.id", kind: "read", confidence: "exact" }]
        }
      },
      fetch: async (_input, init) => {
        requests.push(JSON.parse(init.body));
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, type: "action", id: "save-project" };
          }
        };
      }
    });

    await client.invokeAction("save-project");

    expect(requests).toEqual([{
      type: "action",
      id: "save-project",
      state: { projects: [null, { id: "p2" }] }
    }]);
  });

  it("ignores unsafe object keys in exact state contract paths", async () => {
    const container = document.createElement("div");
    const requests: unknown[] = [];
    const client = createExactClient(container, {
      endpoint: "/__exact",
      state: JSON.parse("{\"project\":{\"id\":\"p1\"},\"__proto__\":{\"polluted\":true}}"),
      stateContracts: {
        "save-project": {
          reads: [
            { path: "project.id", kind: "read", confidence: "exact" },
            { path: "__proto__.polluted", kind: "read", confidence: "exact" }
          ]
        }
      },
      fetch: async (_input, init) => {
        requests.push(JSON.parse(init.body));
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, type: "action", id: "save-project" };
          }
        };
      }
    });

    await client.invokeAction("save-project");

    expect(requests).toEqual([{
      type: "action",
      id: "save-project",
      state: { project: { id: "p1" } }
    }]);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("rejects failed endpoint invocations", async () => {
    await expect(invokeExact({
      endpoint: "/__exact",
      type: "refresh",
      id: "panel",
      logger: noopLogger,
      fetch: async () => ({
        ok: false,
        status: 404,
        async json() {
          return { error: "not_found" };
        }
      })
    })).rejects.toThrow("eXact refresh invocation failed");
  });
});
