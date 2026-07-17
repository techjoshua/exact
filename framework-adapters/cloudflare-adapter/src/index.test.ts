import { describe, expect, it } from "vitest";
import { createExactCloudflareHandler } from "./index.js";

describe("@exact/cloudflare-adapter", () => {
  it("handles Cloudflare Worker fetch requests", async () => {
    const handler = createExactCloudflareHandler({
      manifest: { version: 1, endpoint: "/__exact", actions: { save: { id: "save", placement: "server" } } },
      actions: { save: () => ({ state: { runtime: "cloudflare" } }) }
    });

    const response = await handler(new Request("https://example.com/__exact", {
      method: "POST",
      body: JSON.stringify({ type: "action", id: "save" })
    }), {}, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, type: "action", id: "save", state: { runtime: "cloudflare" } });
  });
});
