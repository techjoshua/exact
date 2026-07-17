import { describe, expect, it } from "vitest";
import { flushSync } from "@exact/reactive";
import { createConvexQuery, type ConvexClient, type ConvexWatch } from "./index.js";

describe("@exact/convex", () => {
  it("bridges Convex watchQuery without importing its React binding", () => {
    let value: number | undefined;
    let notify = () => {};
    const watch: ConvexWatch<number> = {
      localQueryResult: () => value,
      onUpdate(callback) { notify = callback; return () => {}; }
    };
    const client: ConvexClient = { watchQuery: () => watch as ConvexWatch<any> };
    const source = createConvexQuery<number>(client, "counter");
    value = 4;
    notify();
    flushSync();
    expect(source.value.get()).toBe(4);
  });
});
