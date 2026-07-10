import { describe, expect, it } from "vitest";
import { createCompiledVNode, createDynamicChild, createServerBoundary, createTextVNode, createVNode, type Component } from "@exact/core";
import { handleExactRequest } from "@exact/server";
import {
  createBoundaryRefreshHandler,
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
    }))).toThrow("Client boundary Bad_ExactClient_1 props must be JSON-serializable");
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
      nonce: "abc\"123"
    });

    expect(script).toContain("type=\"application/json\"");
    expect(script).toContain("id=\"__exact_hydration\"");
    expect(script).toContain("nonce=\"abc&quot;123\"");
    expect(script).toContain("\"stateContracts\"");
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
      patches: [{ type: "replace", id: "profile", html: "<p>Ada</p>" }]
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
});
