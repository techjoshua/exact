import { describe, expect, it } from "vitest";
import { createCompiledVNode, createDynamicChild, createServerBoundary, createTextVNode, createVNode, type Component } from "@exact/core";
import { handleExactRequest } from "@exact/server";
import {
  createActionRefreshHandler,
  createBoundaryRefreshHandler,
  createExactServerHandlerRegistry,
  createKeyedListRefreshHandler,
  diffBoundaryHtml,
  diffKeyedListItems,
  parseKeyedListSnapshotHtml,
  renderKeyedListSnapshot,
  renderHydrationScript,
  renderToHydratableString,
  renderToStream,
  renderToString,
  renderToStringAsync
} from "./index.js";

describe("@exact/ssr", () => {
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
    }))).toThrow("Client boundary Bad_ExactClient_1 props must be JSON-serializable; non-serializable value at $.onSave");

    expect(() => renderToString(createServerBoundary("bad", "Bad_ExactClient_1", {
      meta: { values: [1, Number.NaN] }
    }))).toThrow("non-serializable value at $.meta.values[1]");
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

  it("serializes hydration endpoint and state as inert escaped json", () => {
    const script = renderHydrationScript({
      endpoint: "/__exact",
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
  });

  it("renders html with hydration bootstrap data", () => {
    const result = renderToHydratableString(createVNode("p", null, "ready"), {
      markers: false,
      endpoint: "/__exact",
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

  it("falls back when nested exact id structure changes", () => {
    expect(diffBoundaryHtml(
      "profile",
      "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\">Loading</h1></section>",
      "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\">Ready</h1><p data-exact-id=\"body\">New</p></section>",
      "element"
    )).toEqual([
      {
        type: "replace",
        id: "profile",
        html: "<section data-exact-id=\"root\"><h1 data-exact-id=\"title\">Ready</h1><p data-exact-id=\"body\">New</p></section>"
      }
    ]);
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
});
