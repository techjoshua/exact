import { describe, expect, it } from "vitest";
import { createExactBunHandler } from "./index.js";

describe("@exact/bun-adapter", () => {
  it("handles Bun Fetch-compatible requests", async () => {
    const handler = createExactBunHandler({
      manifest: { version: 1, endpoint: "/__exact", actions: { save: { id: "save", placement: "server" } } },
      actions: { save: () => ({ state: { runtime: "bun" } }) }
    });

    const response = await handler(new Request("https://example.com/__exact", {
      method: "POST",
      body: JSON.stringify({ type: "action", id: "save" })
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, type: "action", id: "save", state: { runtime: "bun" } });
  });
});
