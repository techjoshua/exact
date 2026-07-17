import { describe, expect, it } from "vitest";
import { createExactServerlessHandler } from "./index.js";

describe("@exact/serverless-adapter", () => {
  it("handles API Gateway style events", async () => {
    const handler = createExactServerlessHandler({
      manifest: { version: 1, endpoint: "/__exact", actions: { save: { id: "save", placement: "server" } } },
      actions: { save: () => ({ state: { runtime: "serverless" } }) }
    });

    const response = await handler({
      httpMethod: "POST",
      rawPath: "/__exact",
      body: JSON.stringify({ type: "action", id: "save" })
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, type: "action", id: "save", state: { runtime: "serverless" } });
  });
});
