import { describe, expect, it } from "vitest";
import { createExactExpressMiddleware, type ExactExpressResponse } from "./index.js";

describe("@exact/express-adapter", () => {
  it("writes eXact responses through Express response methods", async () => {
    const middleware = createExactExpressMiddleware({
      manifest: { version: 1, endpoint: "/__exact", actions: { save: { id: "save", placement: "server" } } },
      actions: { save: () => ({ state: { runtime: "express" } }) }
    });
    const response = createExpressResponse();

    middleware({
      method: "POST",
      originalUrl: "/__exact",
      body: { type: "action", id: "save" }
    }, response);

    await response.done;
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(response.body))).toEqual({ ok: true, state: { runtime: "express" } });
  });
});

function createExpressResponse(): ExactExpressResponse & { statusCode?: number; body?: unknown; done: Promise<void> } {
  let finish!: () => void;
  return {
    done: new Promise(resolve => {
      finish = resolve;
    }),
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader() {},
    send(body) {
      this.body = body;
      finish();
    }
  };
}
