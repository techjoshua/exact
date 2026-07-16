import { describe, expect, it, vi } from "vitest";
import { createEffectScope, createExternalSource, flushSync, watch, withEffectScope } from "./index.js";

describe("external source bridge", () => {
  it("tracks snapshots, closes the subscribe race, and disposes once", () => {
    let value = 1;
    let notify = () => {};
    const unsubscribe = vi.fn();
    const source = createExternalSource({
      getSnapshot: () => value,
      subscribe(callback) {
        notify = callback;
        value = 2;
        return unsubscribe;
      }
    });
    const seen: number[] = [];
    watch(() => source.value.get(), () => seen.push(source.value.get()));
    expect(source.snapshot()).toBe(2);
    value = 3;
    notify();
    flushSync();
    expect(seen).toEqual([3]);
    source.dispose();
    source.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("supports lazy connection and rejects reconnecting after disposal", () => {
    const source = createExternalSource({ getSnapshot: () => "ready", subscribe: () => () => {}, connect: false });
    expect(source.connected).toBe(false);
    source.connect();
    expect(source.connected).toBe(true);
    source.dispose();
    expect(() => source.connect()).toThrow(/disposed external source/);
  });

  it("disposes with its owning effect scope", () => {
    const unsubscribe = vi.fn();
    const scope = createEffectScope();
    const source = withEffectScope(scope, () => createExternalSource({ getSnapshot: () => 1, subscribe: () => unsubscribe }));
    scope.stop();
    expect(source.disposed).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("uses an inert server snapshot until explicitly connected", () => {
    const subscribe = vi.fn(() => () => {});
    const source = createExternalSource({
      getSnapshot: () => "client",
      getServerSnapshot: () => "server",
      subscribe
    });
    expect(source.snapshot()).toBe("server");
    expect(source.connected).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    source.connect();
    expect(source.snapshot()).toBe("client");
  });

  it("supports source-defined equality without notifying", () => {
    let snapshot = { value: 1 };
    let notify = () => {};
    const source = createExternalSource({
      getSnapshot: () => snapshot,
      subscribe(callback) { notify = callback; return () => {}; },
      isEqual: (left, right) => left.value === right.value
    });
    const seen: number[] = [];
    watch(() => source.value.get(), () => seen.push(source.value.get().value));
    snapshot = { value: 1 };
    notify();
    flushSync();
    expect(seen).toEqual([]);
  });
});
