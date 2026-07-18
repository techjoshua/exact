import { describe, expect, it } from "vitest";
import { createExactKoaMiddleware, type ExactKoaContext } from "./index.js";

describe("@exact/koa-adapter", () => {
  it("writes eXact responses into Koa context", async () => {
    const middleware = createExactKoaMiddleware({
      manifest: { version: 1, endpoint: "/__exact", actions: { save: { id: "save", placement: "server" } } },
      actions: {
        save: (_input, context) => ({
          state: {
            runtime: "koa",
            url: context.requestContext?.url.href,
            platformUrl: (context.platformRequest as ExactKoaContext).url
          }
        })
      }
    });
    const ctx = createKoaContext({ type: "action", id: "save" });

    await middleware(ctx);

    expect(ctx.status).toBe(200);
    expect(JSON.parse(String(ctx.body))).toEqual({
      ok: true,
      type: "action",
      id: "save",
      state: {
        runtime: "koa",
        url: "http://koa.example.test/__exact",
        platformUrl: "/__exact"
      }
    });
  });
});

function createKoaContext(body: unknown): ExactKoaContext {
  return {
    method: "POST",
    url: "/__exact",
    headers: { host: "koa.example.test" },
    request: { body },
    status: 0,
    body: undefined,
    set() {}
  };
}
