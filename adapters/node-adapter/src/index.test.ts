import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { createExactNodeHandler } from "./index.js";

describe("@exact/node-adapter", () => {
  it("handles eXact requests through Node request and response objects", async () => {
    const handler = createExactNodeHandler({
      manifest: {
        version: 1,
        endpoint: "/__exact",
        actions: { save: { id: "save", placement: "server" } }
      },
      actions: {
        save: () => ({ state: { ok: true } })
      }
    });

    const request = new EventEmitter() as IncomingMessage;
    request.method = "POST";
    request.url = "/__exact";
    request.headers = {};

    let resolveDone!: () => void;
    const done = new Promise<void>(resolve => {
      resolveDone = resolve;
    });
    type TestNodeResponse = ServerResponse & {
      body: string;
      headers: Record<string, number | string | string[]>;
    };

    const response = {
      statusCode: 0,
      body: "",
      headers: {} as Record<string, number | string | string[]>,
      setHeader(this: TestNodeResponse, name: string, value: number | string | readonly string[]) {
        this.headers[name] = typeof value === "object" ? [...value] : value;
        return this;
      },
      write(this: TestNodeResponse, chunk: Uint8Array | string) {
        this.body += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
      },
      end(this: TestNodeResponse, chunk?: Uint8Array | string) {
        if (chunk) this.write(chunk);
        resolveDone();
        return this;
      },
      destroy(error?: Error) {
        throw error ?? new Error("destroyed");
      }
    } as unknown as TestNodeResponse;

    handler(request, response);
    request.emit("data", JSON.stringify({ type: "action", id: "save" }));
    request.emit("end");

    await done;
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, state: { ok: true } });
  });
});
