import { describe, expect, it } from "vitest";
import { createCompiledVNode, createDynamicChild, createServerBoundary, createTextVNode, createVNode, type Component } from "@exact/core";
import { handleExactRequest } from "@exact/server";
import {
  createActionRefreshHandler,
  createBoundaryRefreshHandler,
  createExactServerHandlerRegistry,
  createExactServerRuntime,
  createKeyedListRefreshHandler,
  diffBoundaryHtml,
  diffKeyedListItems,
  parseKeyedListSnapshotHtml,
  renderKeyedListSnapshot,
  renderHydrationScript,
  renderToDocumentStream,
  renderToHydratableDocumentStream,
  renderToHydratableProgressiveHtmlResponse,
  renderToHydratableProgressiveHtmlStream,
  renderToHydratableString,
  renderToProgressiveHtmlResponse,
  renderToProgressiveHtmlStream,
  renderToStream,
  renderToString,
  renderToStringAsync
} from "./index.js";

async function readStreamEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<any> {
  const next = await reader.read();
  if (next.done) throw new Error("stream ended");
  return JSON.parse(new TextDecoder().decode(next.value).trim());
}

async function readRemainingStreamEvents(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<any[]> {
  const events: any[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return events;
    const text = new TextDecoder().decode(next.value);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }
}

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  return readRemainingText(reader);
}

async function readRemainingText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const next = await reader.read();
    if (next.done) return text;
    text += decoder.decode(next.value);
  }
}

describe("@exact/ssr", () => {
  it("passes request cancellation into boundary render callbacks", async () => {
    const abort = new AbortController();
    let observed: AbortSignal | undefined;
    const handler = createBoundaryRefreshHandler((_input, context) => {
      observed = context.signal;
      return createVNode("p", null, "ready");
    }, { boundaryId: "panel" });
    await handler({ type: "refresh", id: "panel" }, {
      manifest: { version: 1, boundaries: { panel: { id: "panel" } } },
      signal: abort.signal
    });
    expect(observed).toBe(abort.signal);
  });

  it("preserves boolean attributes, quoted entities, and SVG tag casing in element diffs", () => {
    expect(diffBoundaryHtml(
      "field",
      '<input data-exact-id="field" disabled title="&quot;old&quot;">',
      '<input data-exact-id="field" disabled="true" title="&quot;new&quot;">',
      "element"
    )).toEqual(expect.arrayContaining([
      { type: "prop", id: "field", name: "disabled", value: "true" },
      { type: "prop", id: "field", name: "title", value: '"new"' }
    ]));
    const patches = diffBoundaryHtml(
      "icon",
      '<svg data-exact-id="icon"><linearGradient data-exact-id="paint"></linearGradient></svg>',
      '<svg data-exact-id="icon"><linearGradient data-exact-id="paint"><stop></stop></linearGradient></svg>',
      "element"
    );
    expect(JSON.stringify(patches)).toContain("linearGradient");
  });
  it("encodes unsafe keyed marker values without collisions", () => {
    const first = renderKeyedListSnapshot({ listId: "list", items: ["ab", "a--b"], key: value => value, render: value => createVNode("p", null, value) });
    expect(first.items[0]!.html).not.toBe(first.items[1]!.html);
    expect(parseKeyedListSnapshotHtml("list", first.innerHtml)?.items.map(item => item.key)).toEqual(["ab", "a--b"]);
  });
  it("renders elements, attributes, text escaping, and styles to html", () => {
    const result = renderToString(createVNode(
      "section",
      { className: "panel", hidden: false, style: { color: "red", marginTop: "4px" } },
      "Hello <Ada>",
      createVNode("input", { disabled: true, value: "x\"y" })
    ), { markers: false });

    expect(result.html).toBe("<section class=\"panel\" style=\"color: red; margin-top: 4px;\">Hello &lt;Ada&gt;<input disabled value=\"x&quot;y\"></section>");
  });

  it("renders component output without marking components as mounted", () => {
    let mounted = false;

    function Card(this: Component<{ title: string }>, props: { title: string }) {
      this.state.title = props.title;
      this.onMount(() => {
        mounted = true;
      });
      return () => createVNode("article", null, this.state.title);
    }

    const result = renderToString(createVNode(Card, { title: "Server" }));

    expect(result.html).toContain("<article>Server</article>");
    expect(result.html).toContain("<!--exact:component:");
    expect(mounted).toBe(false);
  });

  it("renders compiled cells and dynamic children with hydration markers", () => {
    function Panel(this: Component<{ show: boolean }>) {
      this.state.show = true;
      return () => createCompiledVNode("section", {},
        createDynamicChild(() => this.state.show ? createVNode("strong", null, "Visible") : createVNode("span", null, "Hidden"))
      );
    }

    const result = renderToString(createVNode(Panel, {}));

    expect(result.html).toContain("exact:component");
    expect(result.html).toContain("exact:cell");
    expect(result.html).toContain("exact:dynamic");
    expect(result.html).toContain("<strong>Visible</strong>");
  });

  it("renders keyed list fragments with item markers", () => {
    function List(this: Component<{}>) {
      return () => this.map(
        [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        item => item.id,
        item => createVNode("li", null, item.label)
      );
    }

    const result = renderToString(createVNode("ul", null, createVNode(List, {})));

    expect(result.html).toContain("exact:item");
    expect(result.html).toContain(":a");
    expect(result.html).toContain(":b");
    expect(result.html).toContain("<li>A</li>");
    expect(result.html).toContain("<li>B</li>");
  });

  it("renders keyed list fragments with stable exact markers when map ids are provided", () => {
    function List(this: Component<{}>) {
      return () => this.map(
        [{ id: "a", label: "A" }],
        item => item.id,
        item => createVNode("li", null, item.label),
        "tasks"
      );
    }

    const result = renderToString(createVNode("ul", null, createVNode(List, {})));

    expect(result.html).toContain("<!--exact:tasks-->");
    expect(result.html).toContain("<!--/exact:tasks-->");
    expect(result.html).toContain("<!--exact:item:");
  });

  it("renders server client-boundary placeholders", () => {
    const result = renderToString(createServerBoundary("island-1", "Panel_ExactClient_1", {
      title: "</script>"
    }));

    expect(result.html).toContain("exact:client-boundary");
    expect(result.html).toContain("data-exact-client-boundary=\"island-1\"");
    expect(result.html).toContain("data-exact-client-name=\"Panel_ExactClient_1\"");
    expect(result.html).toContain("\\u003C/script&gt;");
    expect(result.html).not.toContain("</script>");
  });

  it("renders server children inside client-boundary slots", () => {
    const result = renderToString(createServerBoundary(
      "island-children",
      "Shell_ExactClient_1",
      {},
      createVNode("p", null, "Server child")
    ));

    expect(result.html).toContain("data-exact-client-boundary=\"island-children\"");
    expect(result.html).toContain("data-exact-server-slot=\"island-children:children\"");
    expect(result.html).toContain("<p>Server child</p>");
    expect(result.html).toContain("&quot;__exactServerSlot&quot;:&quot;island-children:children&quot;");
  });

  it("serializes state-derived client boundary props at render time", () => {
    function Host(this: Component<{ title: string }>) {
      this.state.title = "Ready";
      return () => createServerBoundary("island-2", "Panel_ExactClient_1", {
        title: this.state.title
      });
    }

    const result = renderToString(createVNode(Host, {}));

    expect(result.html).toContain("&quot;title&quot;:&quot;Ready&quot;");
  });

  it("rejects non-serializable client boundary props", () => {
    expect(() => renderToString(createServerBoundary("bad", "Bad_ExactClient_1", {
      onSave() {}
    }))).toThrow("Client boundary Bad_ExactClient_1 (bad) props must be JSON-serializable; non-serializable value at $.onSave");

    expect(() => renderToString(createServerBoundary("bad", "Bad_ExactClient_1", {
      meta: { values: [1, Number.NaN] }
    }))).toThrow("non-serializable value at $.meta.values[1]");
  });

  it("identifies generated client boundary payload buckets in serialization errors", () => {
    expect(() => renderToString(createServerBoundary("island-1", "Panel_ExactClient_1", {
      __exactState: {
        project: {
          save() {}
        }
      }
    }))).toThrow("non-serializable value at $.__exactState.project.save in generated __exactState payload");
  });

  it("identifies generated client boundary payload buckets in async serialization errors", async () => {
    await expect(renderToStringAsync(createServerBoundary("island-1", "Panel_ExactClient_1", {
      __exactCapture: {
        formatter: new Date()
      }
    }))).rejects.toThrow("non-serializable value at $.__exactCapture.formatter in generated __exactCapture payload");
  });

  it("can expose rendered html as a readable stream", async () => {
    const stream = renderToStream(createVNode("p", null, "streamed"), { markers: false });
    const reader = stream.getReader();
    const chunks: string[] = [];
    const decoder = new TextDecoder();

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(decoder.decode(result.value));
    }

    expect(chunks.join("")).toBe("<p>streamed</p>");
  });

  it("streams document render events", async () => {
    const stream = renderToDocumentStream(createVNode("p", null, "streamed"), {
      markers: false,
      endpoint: "/__exact",
      state: { ready: true }
    });
    const events = await readRemainingStreamEvents(stream.getReader());

    expect(events).toEqual([
      { event: "start", version: 1 },
      { event: "shell", version: 1, html: "<p>streamed</p>" },
      {
        event: "hydration",
        version: 1,
        html: expect.stringContaining("\"endpoint\":\"/__exact\"")
      },
      { event: "complete", version: 1 }
    ]);
    expect(events[2].html).toContain("\"ready\":true");
  });

  it("streams hydratable document bootstrap events", async () => {
    const events = await readRemainingStreamEvents(renderToHydratableDocumentStream(
      createVNode("p", null, "ready"),
      { markers: false }
    ).getReader());

    expect(events).toEqual([
      { event: "start", version: 1 },
      { event: "shell", version: 1, html: "<p>ready</p>" },
      {
        event: "hydration",
        version: 1,
        html: "<script type=\"application/json\" id=\"__exact_hydration\">{}</script>"
      },
      { event: "complete", version: 1 }
    ]);
  });

  it("streams the initial shell before async tasks settle", async () => {
    let resolveTask!: () => void;
    const taskReady = new Promise<void>(resolve => {
      resolveTask = resolve;
    });
    function Profile(this: Component<{ name: string }>) {
      this.state.name = "Loading";
      this.task(async () => {
        await taskReady;
        this.state.name = "Ada";
      });
      return () => createVNode("p", null, this.state.name);
    }

    const reader = renderToDocumentStream(createVNode(Profile, {}), {
      markers: false,
      rootId: "app",
      hydration: false
    }).getReader();

    expect(await readStreamEvent(reader)).toEqual({ event: "start", version: 1 });
    expect(await readStreamEvent(reader)).toEqual({ event: "shell", version: 1, html: "<p>Loading</p>" });

    resolveTask();
    const rest = await readRemainingStreamEvents(reader);

    expect(rest).toEqual([
      { event: "replace", version: 1, id: "app", html: "<p>Ada</p>" },
      { event: "complete", version: 1 }
    ]);
  });

  it("aborts document rendering without reporting cancellation as a render failure", async () => {
    const abort = new AbortController();
    const logs: unknown[] = [];
    function Pending(this: Component<{}>) {
      this.task(() => new Promise<void>(() => undefined));
      return () => createVNode("p", null, "Loading");
    }
    const reader = renderToDocumentStream(createVNode(Pending, {}), {
      signal: abort.signal,
      logger: { isEnabled: () => true, log: entry => logs.push(entry) }
    }).getReader();
    expect(await readStreamEvent(reader)).toMatchObject({ event: "start" });
    expect(await readStreamEvent(reader)).toMatchObject({ event: "shell" });
    abort.abort("disconnected");
    await expect(reader.read()).rejects.toBe("disconnected");
    expect(logs).toEqual([]);
  });

  it("streams progressive browser-consumable html", async () => {
    const html = await readStreamText(renderToHydratableProgressiveHtmlStream(
      createVNode("p", null, "ready"),
      {
        markers: false,
        rootId: "app",
        endpoint: "/__exact"
      }
    ));

    expect(html).toContain("<div id=\"app\"><p>ready</p></div>");
    expect(html).toContain("<script type=\"application/json\" id=\"__exact_hydration\">");
    expect(html).toContain("\"endpoint\":\"/__exact\"");
  });

  it("streams progressive html shell before async task replacement", async () => {
    let resolveTask!: () => void;
    const taskReady = new Promise<void>(resolve => {
      resolveTask = resolve;
    });
    function Profile(this: Component<{ name: string }>) {
      this.state.name = "Loading";
      this.task(async () => {
        await taskReady;
        this.state.name = "</script><strong>Ada</strong>";
      });
      return () => createVNode("p", null, this.state.name);
    }

    const reader = renderToProgressiveHtmlStream(createVNode(Profile, {}), {
      markers: false,
      rootId: "profile",
      nonce: "abc\"123"
    }).getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toBe("<div id=\"profile\"><p>Loading</p></div>");

    resolveTask();
    const rest = await readRemainingText(reader);

    expect(rest).toContain("document.getElementById(\"profile\")");
    expect(rest).toContain("<script nonce=\"abc&quot;123\">");
    expect(rest).toContain("&lt;/script&gt;");
    expect(rest).toContain("\\u003Cp>");
    expect(rest).not.toContain("</script><strong>");
  });

  it("uses the same default root for progressive shell and replacement", async () => {
    let resolveTask!: () => void;
    const taskReady = new Promise<void>(resolve => {
      resolveTask = resolve;
    });
    function Status(this: Component<{ value: string }>) {
      this.state.value = "Loading";
      this.task(async () => {
        await taskReady;
        this.state.value = "Ready";
      });
      return () => createVNode("p", null, this.state.value);
    }

    const reader = renderToProgressiveHtmlStream(createVNode(Status, {}), {
      markers: false
    }).getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toBe("<div id=\"exact-root\"><p>Loading</p></div>");

    resolveTask();
    const rest = await readRemainingText(reader);

    expect(rest).toContain("document.getElementById(\"exact-root\")");
  });

  it("packages progressive html streams as neutral response objects", async () => {
    const response = renderToHydratableProgressiveHtmlResponse(createVNode("p", null, "ready"), {
      markers: false,
      rootId: "app",
      endpoint: "/__exact",
      status: 202,
      headers: { "cache-control": "no-store" }
    });

    expect(response.status).toBe(202);
    expect(response.headers).toMatchObject({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    expect(await readStreamText(response.stream!)).toContain("<div id=\"app\"><p>ready</p></div>");
  });

  it("respects explicit progressive response content type headers", () => {
    const response = renderToProgressiveHtmlResponse(createVNode("p", null, "ready"), {
      headers: { "Content-Type": "text/html" }
    });
    const overridden = renderToProgressiveHtmlResponse(createVNode("p", null, "ready"), {
      headers: { "Content-Type": "text/html" },
      contentType: "application/xhtml+xml"
    });

    expect(response.headers["Content-Type"]).toBe("text/html");
    expect(overridden.headers["Content-Type"]).toBe("application/xhtml+xml");
  });

  it("serializes hydration endpoint and state as inert escaped json", () => {
    const script = renderHydrationScript({
      endpoint: "/__exact",
      endpoints: {
        actions: {
          "remote-save": "https://remote.example/__exact"
        },
        boundaries: {
          "remote-panel": "https://remote.example/__exact"
        }
      },
      state: { title: "</script><img>" },
      stateContracts: {
        save: {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
        }
      },
      actionBoundaries: {
        save: ["profile", "profile:children"]
      },
      nonce: "abc\"123"
    });

    expect(script).toContain("type=\"application/json\"");
    expect(script).toContain("id=\"__exact_hydration\"");
    expect(script).toContain("nonce=\"abc&quot;123\"");
    expect(script).toContain("\"endpoints\"");
    expect(script).toContain("\"remote-save\"");
    expect(script).toContain("https://remote.example/__exact");
    expect(script).toContain("\"stateContracts\"");
    expect(script).toContain("\"actionBoundaries\"");
    expect(script).toContain("\"profile:children\"");
    expect(script).toContain("\"project.id\"");
    expect(script).toContain("\\u003C/script>");
    expect(script).not.toContain("</script><img>");
  });

  it("rejects non-json-safe hydration payloads", () => {
    expect(() => renderHydrationScript({
      state: { onSave() {} }
    })).toThrow("Hydration payload must be JSON-serializable");

    expect(() => renderHydrationScript({
      endpoints: {
        actions: {
          save: (() => "/__exact") as unknown as string
        }
      }
    })).toThrow("Hydration payload must be JSON-serializable");
  });

  it("bounds hydration payload traversal and encoded size without invoking accessors", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 2_000; index++) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    expect(() => renderHydrationScript({ state: deep })).toThrow("Hydration payload must be JSON-serializable");
    expect(() => renderHydrationScript({ state: { text: "x".repeat(1_000) }, maxHydrationBytes: 64 }))
      .toThrow("exceeded maxHydrationBytes");

    let reads = 0;
    const state = Object.create(Object.prototype);
    Object.defineProperty(state, "danger", { enumerable: true, get() { reads++; return "value"; } });
    expect(() => renderHydrationScript({ state })).toThrow("Hydration payload must be JSON-serializable");
    expect(reads).toBe(0);
  });

  it("renders html with hydration bootstrap data", () => {
    const result = renderToHydratableString(createVNode("p", null, "ready"), {
      markers: false,
      endpoint: "/__exact",
      endpoints: {
        boundaries: {
          panel: "https://remote.example/__exact"
        }
      },
      state: { ready: true },
      stateContracts: {
        save: {
          reads: [{ path: "ready", kind: "read", confidence: "exact" }]
        }
      }
    });

    expect(result.html).toBe("<p>ready</p>");
    expect(result.htmlWithHydration).toContain("<p>ready</p><script");
    expect(result.htmlWithHydration).toContain("\"endpoint\":\"/__exact\"");
    expect(result.htmlWithHydration).toContain("\"endpoints\"");
    expect(result.htmlWithHydration).toContain("\"panel\":\"https://remote.example/__exact\"");
    expect(result.htmlWithHydration).toContain("\"ready\":true");
    expect(result.htmlWithHydration).toContain("\"stateContracts\"");
  });

  it("waits for async tasks before rendering a component in async mode", async () => {
    function Profile(this: Component<{ name: string }>) {
      this.state.name = "Loading";
      this.task(async () => {
        await Promise.resolve();
        this.state.name = "Ada";
      });
      return () => createVNode("p", null, this.state.name);
    }

    const result = await renderToStringAsync(createVNode(Profile, {}), { markers: false });

    expect(result.html).toBe("<p>Ada</p>");
  });

  it("renders child components after their async tasks settle", async () => {
    function Child(this: Component<{ label: string }>) {
      this.state.label = "Loading";
      this.task(async () => {
        await Promise.resolve();
        this.state.label = "Ready";
      });
      return () => createVNode("strong", null, this.state.label);
    }

    function Parent() {
      return () => createVNode("section", null, createVNode(Child, {}));
    }

    const result = await renderToStringAsync(createVNode(Parent, {}), { markers: false });

    expect(result.html).toBe("<section><strong>Ready</strong></section>");
  });

  it("creates server boundary refresh handlers that return replacement patches", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: { type: "refresh", id: "profile", payload: { name: "Ada" } }
    }, {
      manifest: {
        version: 1,
        boundaries: {
          profile: { id: "profile" }
        }
      },
      refreshBoundaries: {
        profile: createBoundaryRefreshHandler(input => {
          const name = (input.payload as { name: string }).name;
          return createVNode("p", null, name);
        }, {
          boundaryId: "profile",
          markers: false,
          state: { refreshed: true }
        })
      }
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      state: { refreshed: true },
      html: "<p>Ada</p>",
      patches: [{ type: "replace", id: "profile", html: "<p>Ada</p>" }]
    });
  });

  it("creates action handlers that rerender configured server boundaries", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "save-profile",
        boundaryHtmls: {
          profile: "<p class=\"old\">Loading</p>"
        }
      }
    }, {
      manifest: {
        version: 1,
        actions: {
          "save-profile": { id: "save-profile", placement: "server" }
        },
        boundaries: {
          profile: { id: "profile" }
        }
      },
      actions: {
        "save-profile": createActionRefreshHandler({
          action: () => ({ state: { saved: true } }),
          boundaries: [{
            boundaryId: "profile",
            markers: false,
            patchStrategy: "element",
            render: () => createVNode("p", { className: "saved" }, "Saved")
          }]
        })
      }
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      state: { saved: true },
      patches: [
        { type: "prop", id: "profile", name: "class", value: "saved" },
        { type: "text", id: "profile", value: "Saved" }
      ]
    });
  });

  it("creates manifest-scoped server handler registries", async () => {
    const registry = createExactServerHandlerRegistry({
      manifest: {
        version: 1,
        actions: {
          "save-profile": { id: "save-profile", componentId: "Profile", placement: "server" }
        },
        boundaries: {
          profile: { id: "profile", ownerComponentId: "Profile" },
          private: { id: "private", ownerComponentId: "Private" }
        },
        actionBoundaries: {
          "save-profile": ["profile"]
        }
      },
      markers: false,
      patchStrategy: "element",
      actions: {
        "save-profile": () => ({ state: { saved: true } }),
        "private-action": () => ({ patches: [{ type: "replace", id: "private", html: "<p>nope</p>" }] })
      },
      boundaries: {
        profile: () => createVNode("p", { className: "saved" }, "Saved"),
        private: () => createVNode("p", null, "Private")
      }
    });

    const refresh = await registry.refreshBoundaries.profile({
      type: "refresh",
      id: "profile",
      boundaryHtml: "<p class=\"old\">Loading</p>"
    }, { manifest: { version: 1 } });
    const action = await registry.actions["save-profile"]({
      type: "action",
      id: "save-profile",
      boundaryHtmls: {
        profile: "<p class=\"old\">Loading</p>",
        private: "<p>Private</p>"
      }
    }, { manifest: { version: 1 } });

    expect(Object.keys(registry.actions)).toEqual(["save-profile"]);
    expect(Object.keys(registry.refreshBoundaries)).toEqual(["private", "profile"]);
    expect(refresh.patches).toEqual([
      { type: "prop", id: "profile", name: "class", value: "saved" },
      { type: "text", id: "profile", value: "Saved" }
    ]);
    expect(action).toMatchObject({
      state: { saved: true },
      patches: [
        { type: "prop", id: "profile", name: "class", value: "saved" },
        { type: "text", id: "profile", value: "Saved" }
      ]
    });
  });

  it("creates a ready server runtime context from manifest-scoped handlers", async () => {
    const runtime = createExactServerRuntime({
      manifest: {
        version: 1,
        actions: {
          "save-profile": { id: "save-profile", componentId: "Profile", placement: "server" }
        },
        boundaries: {
          profile: { id: "profile", ownerComponentId: "Profile" }
        },
        actionBoundaries: {
          "save-profile": ["profile"]
        }
      },
      markers: false,
      patchStrategy: "element",
      authorize: () => true,
      actions: {
        "save-profile": () => ({ state: { saved: true } })
      },
      boundaries: {
        profile: () => createVNode("p", { className: "saved" }, "Saved")
      }
    });

    const response = await handleExactRequest({
      method: "POST",
      body: {
        type: "action",
        id: "save-profile",
        boundaryHtmls: {
          profile: "<p class=\"old\">Loading</p>"
        }
      }
    }, runtime);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      state: { saved: true },
      patches: [
        { type: "prop", id: "profile", name: "class", value: "saved" },
        { type: "text", id: "profile", value: "Saved" }
      ]
    });
  });

  it("can create text patches for text-only boundary refreshes", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: { type: "refresh", id: "profile" }
    }, {
      manifest: {
        version: 1,
        boundaries: { profile: { id: "profile" } }
      },
      refreshBoundaries: {
        profile: createBoundaryRefreshHandler(
          () => createTextVNode("Ada & Lin"),
          {
            boundaryId: "profile",
            markers: false,
            patchStrategy: "text"
          }
        )
      }
    });

    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "text", id: "profile", value: "Ada & Lin" }]
    });
  });

  it("falls back to replacement patches when text strategy renders html", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: { type: "refresh", id: "profile" }
    }, {
      manifest: {
        version: 1,
        boundaries: { profile: { id: "profile" } }
      },
      refreshBoundaries: {
        profile: createBoundaryRefreshHandler(
          () => createVNode("p", null, "Ada"),
          {
            boundaryId: "profile",
            markers: false,
            patchStrategy: "text"
          }
        )
      }
    });

    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "replace", id: "profile", html: "<p>Ada</p>" }]
    });
  });

  it("can create prop and text patches for simple element boundary refreshes", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: { type: "refresh", id: "profile" }
    }, {
      manifest: {
        version: 1,
        boundaries: { profile: { id: "profile" } }
      },
      refreshBoundaries: {
        profile: createBoundaryRefreshHandler(
          () => createVNode("p", { className: "new", title: "Ada" }, "Ready"),
          {
            boundaryId: "profile",
            markers: false,
            patchStrategy: "element",
            previousHtml: () => "<p class=\"old\" hidden=\"true\">Loading</p>"
          }
        )
      }
    });

    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [
        { type: "prop", id: "profile", name: "class", value: "new" },
        { type: "prop", id: "profile", name: "title", value: "Ada" },
        { type: "prop", id: "profile", name: "hidden", value: null },
        { type: "text", id: "profile", value: "Ready" }
      ]
    });
  });

  it("uses request boundary html as the default previous html for element patches", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: {
        type: "refresh",
        id: "profile",
        boundaryHtml: "<p class=\"old\">Loading</p>"
      }
    }, {
      manifest: {
        version: 1,
        boundaries: { profile: { id: "profile" } }
      },
      refreshBoundaries: {
        profile: createBoundaryRefreshHandler(
          () => createVNode("p", { className: "new" }, "Ready"),
          {
            boundaryId: "profile",
            markers: false,
            patchStrategy: "element"
          }
        )
      }
    });

    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [
        { type: "prop", id: "profile", name: "class", value: "new" },
        { type: "text", id: "profile", value: "Ready" }
      ]
    });
  });

  it("targets simple element patches with compiler assigned exact ids", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<p data-exact-id=\"node-1\" class=\"old\">Loading</p>",
      "<p data-exact-id=\"node-1\" class=\"new\">Ready</p>",
      "element"
    )).toEqual([
      { type: "prop", id: "node-1", name: "class", value: "new" },
      { type: "text", id: "node-1", value: "Ready" }
    ]);
  });

  it("creates patches for nested compiler assigned exact ids", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\" class=\"old\">Loading</h1><p data-exact-id=\"body\">Draft</p></section>",
      "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\" class=\"new\">Ready</h1><p data-exact-id=\"body\">Draft</p></section>",
      "element"
    )).toEqual([
      { type: "prop", id: "title", name: "class", value: "new" },
      { type: "text", id: "title", value: "Ready" }
    ]);
  });

  it("creates style patches for compiler assigned exact ids", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<p data-exact-id=\"body\" style=\"color: red; margin-top: 4px;\">Draft</p>",
      "<p data-exact-id=\"body\" style=\"color: blue; opacity: 1;\">Draft</p>",
      "element"
    )).toEqual([
      { type: "style", id: "body", name: "color", value: "blue" },
      { type: "style", id: "body", name: "opacity", value: "1" },
      { type: "style", id: "body", name: "margin-top", value: null }
    ]);
  });

  it("replaces stable root exact elements when nested exact id structure changes", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\">Loading</h1></section>",
      "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\">Ready</h1><p data-exact-id=\"body\">New</p></section>",
      "element"
    )).toEqual([
      {
        type: "replace",
        id: "root",
        html: "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\">Ready</h1><p data-exact-id=\"body\">New</p></section>"
      }
    ]);
  });

  it("replaces the nearest nested exact element when only that subtree shape changes", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<section data-exact-id=\"root\"><article data-exact-id=\"card\"><p data-exact-id=\"body\">Draft</p></article><aside data-exact-id=\"meta\">Stable</aside></section>",
      "<section data-exact-id=\"root\"><article data-exact-id=\"card\"><p data-exact-id=\"body\"><strong>Ready</strong></p></article><aside data-exact-id=\"meta\">Stable</aside></section>",
      "element"
    )).toEqual([
      {
        type: "replace",
        id: "body",
        html: "<p data-exact-id=\"body\"><strong>Ready</strong></p>"
      }
    ]);
  });

  it("replaces multiple independent nested exact elements when sibling subtree shapes change", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<section data-exact-id=\"root\"><article data-exact-id=\"card-a\"><p data-exact-id=\"body-a\">Draft</p></article><article data-exact-id=\"card-b\"><p data-exact-id=\"body-b\">Queued</p></article></section>",
      "<section data-exact-id=\"root\"><article data-exact-id=\"card-a\"><p data-exact-id=\"body-a\"><strong>Ready</strong></p></article><article data-exact-id=\"card-b\"><p data-exact-id=\"body-b\"><em>Done</em></p></article></section>",
      "element"
    )).toEqual([
      {
        type: "replace",
        id: "body-a",
        html: "<p data-exact-id=\"body-a\"><strong>Ready</strong></p>"
      },
      {
        type: "replace",
        id: "body-b",
        html: "<p data-exact-id=\"body-b\"><em>Done</em></p>"
      }
    ]);
  });

  it("does not replace an ancestor when a descendant exact replacement covers the shape change", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<section data-exact-id=\"root\" class=\"old\"><article data-exact-id=\"card\"><p data-exact-id=\"body\">Draft</p></article></section>",
      "<section data-exact-id=\"root\" class=\"new\"><article data-exact-id=\"card\"><p data-exact-id=\"body\"><strong>Ready</strong></p></article></section>",
      "element"
    )).toEqual([
      { type: "prop", id: "root", name: "class", value: "new" },
      {
        type: "replace",
        id: "body",
        html: "<p data-exact-id=\"body\"><strong>Ready</strong></p>"
      }
    ]);
  });

  it("falls back safely when boundary HTML exceeds the fine-grained diff depth budget", () => {
    const open = "<div>".repeat(300);
    const close = "</div>".repeat(300);
    const previous = `<section data-exact-id="root">${open}old${close}</section>`;
    const next = `<section data-exact-id="root">${open}new${close}</section>`;

    expect(diffBoundaryHtml("profile", previous, next, "element"))
      .toEqual([{ type: "replace", id: "profile", html: next }]);
  });

  it("falls back safely for duplicate exact ids instead of targeting an ambiguous element", () => {
    const previous = "<section><p data-exact-id=\"duplicate\">one</p><p data-exact-id=\"duplicate\">two</p></section>";
    const next = "<section><p data-exact-id=\"duplicate\">changed</p><p data-exact-id=\"duplicate\">two</p></section>";

    expect(diffBoundaryHtml("profile", previous, next, "element"))
      .toEqual([{ type: "replace", id: "profile", html: next }]);
  });

  it("falls back to replacement patches when element strategy shape changes", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: { type: "refresh", id: "profile" }
    }, {
      manifest: {
        version: 1,
        boundaries: { profile: { id: "profile" } }
      },
      refreshBoundaries: {
        profile: createBoundaryRefreshHandler(
          () => createVNode("section", null, "Ready"),
          {
            boundaryId: "profile",
            markers: false,
            patchStrategy: "element",
            previousHtml: () => "<p>Loading</p>"
          }
        )
      }
    });

    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [{ type: "replace", id: "profile", html: "<section>Ready</section>" }]
    });
  });

  it("diffs keyed list snapshots into insert move remove patches", () => {
    expect(diffKeyedListItems("tasks", [
      { key: "a", html: "<li>A</li>" },
      { key: "b", html: "<li>B</li>" },
      { key: "c", html: "<li>C</li>" }
    ], [
      { key: "c", html: "<li>C</li>" },
      { key: "a", html: "<li>A*</li>" },
      { key: "d", html: "<li>D</li>" }
    ])).toEqual([
      { type: "list", id: "tasks", op: "remove", key: "b" },
      { type: "list", id: "tasks", op: "move", key: "c", before: "a" },
      { type: "list", id: "tasks", op: "remove", key: "a" },
      { type: "list", id: "tasks", op: "insert", key: "a", before: "d", html: "<li>A*</li>" },
      { type: "list", id: "tasks", op: "insert", key: "d", html: "<li>D</li>" }
    ]);
  });

  it("renders keyed list snapshots with list and item markers", () => {
    const snapshot = renderKeyedListSnapshot({
      listId: "tasks",
      items: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      key: item => item.id,
      render: item => createVNode("li", null, item.label)
    });

    expect(snapshot.html).toContain("<!--exact:tasks-->");
    expect(snapshot.html).toContain("<!--/exact:tasks-->");
    expect(snapshot.items).toEqual([
      { key: "a", html: "<!--exact:item:a--><li>A</li><!--/exact:item:a-->" },
      { key: "b", html: "<!--exact:item:b--><li>B</li><!--/exact:item:b-->" }
    ]);
    expect(snapshot.innerHtml).toBe(snapshot.items.map(item => item.html).join(""));
  });

  it("parses keyed list snapshots from submitted boundary html", () => {
    expect(parseKeyedListSnapshotHtml("tasks", [
      "<!--exact:item:a--><li>A</li><!--/exact:item:a-->",
      "<!--exact:item:b--><li>B</li><!--/exact:item:b-->"
    ].join(""))).toMatchObject({
      listId: "tasks",
      innerHtml: "<!--exact:item:a--><li>A</li><!--/exact:item:a--><!--exact:item:b--><li>B</li><!--/exact:item:b-->",
      items: [
        { key: "a", html: "<!--exact:item:a--><li>A</li><!--/exact:item:a-->" },
        { key: "b", html: "<!--exact:item:b--><li>B</li><!--/exact:item:b-->" }
      ]
    });
  });

  it("creates keyed list refresh handlers that infer previous snapshots from boundary html", async () => {
    const response = await handleExactRequest({
      method: "POST",
      body: {
        type: "refresh",
        id: "tasks",
        boundaryHtml: [
          "<!--exact:item:a--><li>A</li><!--/exact:item:a-->",
          "<!--exact:item:b--><li>B</li><!--/exact:item:b-->"
        ].join("")
      }
    }, {
      manifest: {
        version: 1,
        boundaries: { tasks: { id: "tasks" } }
      },
      refreshBoundaries: {
        tasks: createKeyedListRefreshHandler({
          listId: "tasks",
          items: () => [{ id: "b", label: "B" }, { id: "c", label: "C" }],
          key: item => item.id,
          render: item => createVNode("li", null, item.label)
        })
      }
    });

    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      patches: [
        { type: "list", id: "tasks", op: "remove", key: "a" },
        { type: "list", id: "tasks", op: "insert", key: "c", html: "<!--exact:item:c--><li>C</li><!--/exact:item:c-->" }
      ]
    });
  });

  it("disposes component tasks and lifecycle ownership after synchronous SSR", () => {
    let taskSignal: AbortSignal | undefined;
    let unmounted = 0;
    function Owned(this: Component<{}>) {
      this.task(({ signal }) => { taskSignal = signal; });
      this.onUnmount(() => { unmounted++; });
      return () => createVNode("p", null, "owned");
    }

    expect(renderToString(createVNode(Owned, {}), { markers: false }).html).toBe("<p>owned</p>");
    expect(taskSignal?.aborted).toBe(true);
    expect(unmounted).toBe(1);
  });

  it("keeps async SSR ownership alive until tasks settle and then disposes it", async () => {
    let resolve!: () => void;
    let cleaned = 0;
    function Owned(this: Component<{ ready: boolean }>) {
      this.state.ready = false;
      this.task(async () => {
        await new Promise<void>(done => { resolve = done; });
        this.state.ready = true;
        return () => { cleaned++; };
      });
      return () => createVNode("p", null, this.state.ready ? "ready" : "waiting");
    }

    const rendering = renderToStringAsync(createVNode(Owned, {}), { markers: false });
    await Promise.resolve();
    expect(cleaned).toBe(0);
    resolve();
    await expect(rendering).resolves.toMatchObject({ html: "<p>ready</p>" });
    expect(cleaned).toBe(1);
  });

  it("does not construct streamed components ahead of reader demand", async () => {
    let constructed = 0;
    function Lazy(this: Component<{}>) {
      constructed++;
      return () => createVNode("p", null, "lazy");
    }
    const reader = renderToDocumentStream(createVNode(Lazy, {}), { markers: false }).getReader();
    await Promise.resolve();
    expect(constructed).toBe(0);
    expect(await readStreamEvent(reader)).toMatchObject({ event: "start" });
    await Promise.resolve();
    expect(constructed).toBe(1);
    await reader.cancel();
  });

  it("does not construct progressive components ahead of reader demand", async () => {
    let constructed = 0;
    function Lazy(this: Component<{}>) {
      constructed++;
      return () => createVNode("p", null, "lazy");
    }
    const reader = renderToProgressiveHtmlStream(createVNode(Lazy, {}), { markers: false }).getReader();
    await Promise.resolve();
    expect(constructed).toBe(0);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("lazy");
    expect(constructed).toBe(1);
    await reader.cancel();
  });

  it("enforces SSR stream byte budgets", async () => {
    const reader = renderToDocumentStream(createVNode("p", null, "x".repeat(100)), {
      markers: false,
      maxStreamBytes: 32
    }).getReader();
    expect(await readStreamEvent(reader)).toMatchObject({ event: "start" });
    await expect(reader.read()).rejects.toThrow("byte limit");
  });
});
