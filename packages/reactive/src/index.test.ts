import { describe, expect, it, vi } from "vitest";
import { flushSync, isReactive, peek, reactive, ref, snapshot, unwrap, watch } from "./index.js";

describe("@exact/reactive", () => {
  it("tracks reads and batches write notifications", () => {
    const state = reactive({ count: 0 });
    const render = vi.fn(() => void unwrap(state.count));

    watch(render);
    state.count = 1;
    state.count = 2;

    expect(render).toHaveBeenCalledTimes(1);
    flushSync();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("reads with peek without tracking", () => {
    const state = reactive({ count: 0, ignored: 0 });
    const render = vi.fn(() => {
      void state.count;
      peek(() => state.ignored);
    });

    watch(render);
    state.ignored = 1;
    flushSync();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("exposes primitive refs and snapshots reactive values", () => {
    const state = reactive({ query: "abc", nested: { ok: true } });
    const source = ref(state.query);

    expect(source?.get()).toBe("abc");
    expect(unwrap(state.query)).toBe("abc");
    expect(isReactive(state)).toBe(true);
    expect(snapshot(state)).toEqual({ query: "abc", nested: { ok: true } });
  });

  it("supports loose equality comparisons for reactive primitives", () => {
    const state = reactive({ mode: "compact", count: 1, enabled: true });

    expect(state.mode == "compact").toBe(true);
    expect(state.count == 1).toBe(true);
    expect(state.enabled != false).toBe(true);
    expect(state.mode === "compact").toBe(false);
  });
});
