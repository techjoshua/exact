import { describe, expect, it, vi } from "vitest";
import { computed, flushSync, isReactive, peek, reactive, ref, snapshot, subscribe, unwrap, watch } from "./index.js";

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

  it("does not run a stopped watcher that was already queued", () => {
    const state = reactive({ count: 0 });
    const seen: number[] = [];

    const stop = watch(() => {
      seen.push(Number(state.count));
    });

    state.count = 1;
    stop();
    flushSync();

    expect(seen).toEqual([0]);
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

  it("returns raw primitives and snapshots reactive values", () => {
    const state = reactive({ query: "abc", nested: { ok: true } });
    const source = ref(state.query);

    expect(source).toBeUndefined();
    expect(unwrap(state.query)).toBe("abc");
    expect(typeof state.query).toBe("string");
    expect(isReactive(state)).toBe(true);
    expect(snapshot(state)).toEqual({ query: "abc", nested: { ok: true } });
  });

  it("supports normal equality comparisons for reactive primitives", () => {
    const state = reactive({ mode: "compact", count: 1, enabled: true });

    expect(state.mode == "compact").toBe(true);
    expect(state.count == 1).toBe(true);
    expect(state.enabled != false).toBe(true);
    expect(state.mode === "compact").toBe(true);
  });

  it("caches computed values until dependencies change", () => {
    const state = reactive({ first: "Ada", last: "Lovelace" });
    const compute = vi.fn(() => `${state.first} ${state.last}`);
    const fullName = computed(compute);

    expect(unwrap(fullName)).toBe("Ada Lovelace");
    expect(unwrap(fullName)).toBe("Ada Lovelace");
    expect(compute).toHaveBeenCalledTimes(1);

    state.last = "Byron";
    expect(unwrap(fullName)).toBe("Ada Byron");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("tracks computed values that return reactive object references", () => {
    const state = reactive({ task: { title: "First" } });
    const task = computed(() => state.task);
    const title = computed(() => task.get().title);
    const seen: string[] = [];
    const source = ref(title)!;

    subscribe(source, () => seen.push(source.get()));
    expect(unwrap(title)).toBe("First");

    state.task = { title: "Second" };
    flushSync();

    expect(seen).toEqual(["Second"]);
  });

  it("tracks nested fields read through computed readonly object props", () => {
    const state = reactive({ task: { title: "First" } });
    const props = reactive({ task: computed(() => state.task) as unknown as { title: string } }, { readonly: true });
    const title = computed(() => props.task.title);
    const seen: string[] = [];
    const source = ref(title)!;

    subscribe(source, () => seen.push(source.get()));
    expect(unwrap(title)).toBe("First");

    state.task.title = "Second";
    flushSync();

    expect(seen).toEqual(["Second"]);
    expect(unwrap(title)).toBe("Second");
  });

  it("switches computed dependencies when conditional reads change", () => {
    const state = reactive({ useNickname: true, nickname: "Ace", firstName: "Ada" });
    const label = computed(() => state.useNickname == true ? state.nickname : state.firstName);
    const seen: string[] = [];
    const source = ref(label)!;

    subscribe(source, () => seen.push(String(source.get())));
    expect(unwrap(label)).toBe("Ace");

    state.firstName = "Augusta";
    flushSync();
    expect(seen).toEqual([]);

    state.useNickname = false;
    flushSync();
    expect(seen).toEqual(["Augusta"]);

    state.nickname = "Countess";
    flushSync();
    expect(seen).toEqual(["Augusta"]);

    state.firstName = "Ada";
    flushSync();
    expect(seen).toEqual(["Augusta", "Ada"]);
  });

  it("tracks object and array structural changes", () => {
    const state = reactive({
      user: { first: "Ada" } as Record<string, string>,
      items: ["a", "b"]
    });
    const keys = computed(() => Object.keys(state.user).join(","));
    const list = computed(() => state.items.join(""));

    expect(unwrap(keys)).toBe("first");
    expect(unwrap(list)).toBe("ab");

    state.user.last = "Lovelace";
    state.items.reverse();
    flushSync();

    expect(unwrap(keys)).toBe("first,last");
    expect(unwrap(list)).toBe("ba");
  });

  it("does not notify for structurally identical object replacement", () => {
    const state = reactive({ user: { name: "Ada", roles: ["admin"] } });
    const seen: string[] = [];
    const label = computed(() => state.user.name);
    const source = ref(label)!;
    subscribe(source, () => seen.push(source.get()));

    state.user = { name: "Ada", roles: ["admin"] };
    flushSync();
    expect(seen).toEqual([]);

    state.user = { name: "Grace", roles: ["admin"] };
    flushSync();
    expect(seen).toEqual(["Grace"]);
  });
});
