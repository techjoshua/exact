import { describe, expect, it } from "vitest";
import { createExactKoaMiddleware, type ExactKoaContext } from "./index.js";

describe("@exact/koa-adapter", () => {
  it("writes eXact responses into Koa context", async () => {
    const middleware = createExactKoaMiddleware({
      manifest: { version: 1, endpoint: "/__exact", actions: { save: { id: "save", placement: "server" } } },
      actions: { save: () => ({ state: { runtime: "koa" } }) }
    });
    const ctx = createKoaContext({ type: "action", id: "save" });

    await middleware(ctx);

    expect(ctx.status).toBe(200);
    expect(JSON.parse(String(ctx.body))).toEqual({ ok: true, state: { runtime: "koa" } });
  });
});

function createKoaContext(body: unknown): ExactKoaContext {
  return {
    method: "POST",
    url: "/__exact",
    request: { body },
    status: 0,
    body: undefined,
    set() {}
  };
}
