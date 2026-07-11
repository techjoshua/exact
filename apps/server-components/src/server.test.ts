/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  createExactClient,
  hydrateClientIslands,
  readExactHydrationConfig
} from "@exact/hydrate";
import { ProfilePage_ExactClient_1 } from "../.exact/ProfilePage.exact.client.js";
import { handleExactServerRequest, renderProfilePage } from "./server.js";

describe("@exact/sample-server-components", () => {
  it("hydrates a generated client island and applies a server action refresh", async () => {
    const rendered = await renderProfilePage("Ada");
    const container = document.createElement("div");
    const requests: unknown[] = [];
    container.innerHTML = rendered.htmlWithHydration;

    const config = readExactHydrationConfig(container);
    const islands = { ProfilePage_ExactClient_1 };
    const hydrated = hydrateClientIslands(container, islands);
    const client = createExactClient(container, {
      ...config,
      islands,
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        requests.push(body);
        const response = await handleExactServerRequest({
          method: init.method,
          url: config.endpoint,
          headers: init.headers,
          body
        });
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => JSON.parse(response.body)
        };
      }
    });

    expect(hydrated).toBe(1);
    expect(container.querySelector("[data-exact-client-hydrated=\"true\"]")).not.toBeNull();
    expect(config.actionBoundaries?.["save-profile"]).toContain(container.querySelector("[data-exact-client-boundary]")?.getAttribute("data-exact-client-boundary"));

    await client.invokeAction("save-profile");

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      type: "action",
      id: "save-profile"
    });
    expect(container.querySelector("section.saved")?.textContent).toBe("Saved on the server");
  });
});
