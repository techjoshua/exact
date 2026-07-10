/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createVNode, type Component } from "@exact/core";
import { handleExactRequest } from "@exact/server";
import { hydrate, applyPatches, createExactClient, hydrateClientIslands, invokeExact, readExactHydrationConfig } from "./index.js";

const noopLogger = {
  isEnabled: () => false,
  log() {}
};

describe("@exact/hydrate", () => {
  it("hydrates by falling back to normal render when markers are missing", () => {
    const container = document.createElement("div");

    hydrate(createVNode("p", null, "ready"), container, { logger: noopLogger });

    expect(container.querySelector("p")?.textContent).toBe("ready");
  });

  it("reads endpoint and state from the hydration bootstrap script", () => {
    const root = document.createElement("main");
    root.innerHTML = "<script type=\"application/json\" id=\"__exact_hydration\">{\"endpoint\":\"/__exact\",\"state\":{\"ready\":true},\"stateContracts\":{\"save\":{\"reads\":[{\"path\":\"project.id\",\"kind\":\"read\",\"confidence\":\"exact\"}]}}}</script>";

    expect(readExactHydrationConfig(root)).toEqual({
      endpoint: "/__exact",
      state: { ready: true },
      stateContracts: {
        save: {
          reads: [{ path: "project.id", kind: "read", confidence: "exact" }]
        }
      }
    });
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

  it("applies text patches to exact marker ranges", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";

    applyPatches(container, [{ type: "text", id: "title", value: "New" }]);

    expect(container.textContent).toBe("New");
  });

  it("applies replacement patches to exact marker ranges", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";

    applyPatches(container, [{ type: "replace", id: "panel", html: "<section>New</section>" }]);

    expect(container.innerHTML).toBe("<!--exact:panel--><section>New</section><!--/exact:panel-->");
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
