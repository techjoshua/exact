import { describe, expect, it } from "vitest";
import {
  disposeExactPluginResources,
  initializeExactPluginResources,
  processExactOutputSync
} from "./index.js";

describe("plugin runtime phases", () => {
  it("runs all transformations before every final validator and collects failures", () => {
    const order: string[] = [];
    expect(() => processExactOutputSync("start", { kind: "html" }, [
      {
        transform(value) {
          order.push("transform-a");
          return `${value}-a`;
        },
        validate(value) {
          order.push(`validate-a:${value}`);
          throw new Error("a failed");
        }
      },
      {
        transform(value) {
          order.push("transform-b");
          return `${value}-b`;
        },
        validate(value) {
          order.push(`validate-b:${value}`);
          throw new Error("b failed");
        }
      }
    ])).toThrow(AggregateError);
    expect(order).toEqual([
      "transform-a",
      "transform-b",
      "validate-a:start-a-b",
      "validate-b:start-a-b"
    ]);
  });

  it("disposes partially initialized resources in reverse order", async () => {
    const order: string[] = [];
    await expect(initializeExactPluginResources([
      {
        initializeApplication() {
          order.push("init-a");
          return { dispose: () => { order.push("dispose-a"); } };
        }
      },
      {
        initializeApplication() {
          order.push("init-b");
          return { dispose: () => { order.push("dispose-b"); } };
        }
      },
      {
        initializeApplication() {
          throw new Error("failed");
        }
      }
    ], "application", {
      applicationRoot: "/app",
      environment: "test",
      signal: new AbortController().signal
    })).rejects.toThrow("failed");
    expect(order).toEqual(["init-a", "init-b", "dispose-b", "dispose-a"]);
  });

  it("disposes a completed resource set in reverse order", async () => {
    const order: string[] = [];
    await disposeExactPluginResources([
      { dispose: () => { order.push("a"); } },
      { dispose: () => { order.push("b"); } }
    ]);
    expect(order).toEqual(["b", "a"]);
  });
});
