/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createVNode, type Component } from "@exact/core";
import { handleExactRequest } from "@exact/server";
import { hydrate, applyPatches, createExactClient, hydrateClientIslands, invokeExact, invokeExactBatch, readExactHydrationConfig } from "./index.js";

const noopLogger = {
  isEnabled: () => false,
  log() {}
};

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
            return { ok: true };
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
            return { ok: true };
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
    expect(button.getAttribute("disabled")).toBe("true");
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
              patch: { type: "text", id: "title", value: "Streamed" }
            },
            {
              event: "state",
              version: 1,
              index: 0,
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
        return { ok: true };
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
          return { ok: true, patches: [] };
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
          return { ok: true };
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
            return { ok: true };
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
            return { ok: true };
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
