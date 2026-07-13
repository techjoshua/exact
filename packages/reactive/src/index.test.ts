import { describe, expect, it, vi } from "vitest";
import { batch, computed, flushSync, isReactive, mutateReactiveArray, peek, reactive, ref, registerReactiveListKey, snapshot, subscribe, unwrap, updateReactiveValue, watch, writeReactive } from "./index.js";

describe("@exact/reactive", () => {
  it("does not subscribe merely by obtaining a computed reference", () => {
    const state = reactive({ count: 1 });
    const value = computed(() => state.count * 2);
    let runs = 0;
    watch(() => {
      runs++;
      peek(() => ref(value));
    });
    state.count++;
    flushSync();
    expect(runs).toBe(1);
  });
  it("reconciles equal JSON-shaped compiler writes without notifying dependents", () => {
    const state = reactive({ project: { id: "p1", title: "Initial", tags: ["a"] } });
    const project = state.project;
    const seen: string[] = [];
    watch(() => seen.push(state.project.title));

    writeReactive(state, ["project"], JSON.parse('{"id":"p1","title":"Initial","tags":["a"]}'));
    flushSync();
    expect(state.project).toBe(project);
    expect(seen).toEqual(["Initial"]);

    writeReactive(state, ["project"], JSON.parse('{"id":"p1","title":"Changed","tags":["a"]}'));
    flushSync();
    expect(state.project).toBe(project);
    expect(seen).toEqual(["Initial", "Changed"]);
  });

  it("does not notify a list observer for an identical large API refresh", () => {
    const records = Array.from({ length: 10_000 }, (_, id) => ({ id: String(id), title: `Task ${id}` }));
    const state = reactive({ records });
    const observer = vi.fn(() => state.records.map(record => record.title).join(","));
    watch(observer);

    writeReactive(state, ["records"], JSON.parse(JSON.stringify(records)));
    flushSync();

    expect(observer).toHaveBeenCalledTimes(1);
  });

  it("retains keyed record identity when an API response reorders records", () => {
    const state = reactive({ records: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
    const a = state.records[0];
    const b = state.records[1];
    registerReactiveListKey(state.records, item => (item as { id: string }).id);

    writeReactive(state, ["records"], [{ id: "b", title: "B updated" }, { id: "a", title: "A" }]);

    expect(state.records[0]).toBe(b);
    expect(state.records[1]).toBe(a);
    expect(state.records[0].title).toBe("B updated");
  });

  it("updates only changed keyed records during a partial API refresh", () => {
    const state = reactive({ records: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
    registerReactiveListKey(state.records, item => (item as { id: string }).id);
    const a = state.records[0];
    const b = state.records[1];
    const aObserver = vi.fn(() => a.title);
    const bObserver = vi.fn(() => b.title);
    watch(aObserver);
    watch(bObserver);

    writeReactive(state, ["records"], [{ id: "a", title: "A" }, { id: "b", title: "Changed" }]);
    flushSync();

    expect(aObserver).toHaveBeenCalledTimes(1);
    expect(bObserver).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate keys before a keyed API refresh can mutate state", () => {
    const state = reactive({ records: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
    registerReactiveListKey(state.records, item => (item as { id: string }).id, "Tasks.tsx:10");

    expect(() => writeReactive(state, ["records"], [{ id: "a", title: "New A" }, { id: "a", title: "Duplicate" }]))
      .toThrow('Duplicate key "a"');
    expect(state.records.map(record => record.title)).toEqual(["A", "B"]);
  });

  it("notifies array growth and preserves reused identities during an unregistered prepend", () => {
    const state = reactive({ activity: [] as Array<{ id: string; message: string }> });
    const lengths: number[] = [];
    const scheduledSnapshots: string[][] = [];
    watch(() => lengths.push(state.activity.length));
    watch(
      () => state.activity.map(item => item.id),
      undefined,
      { onSchedule: () => scheduledSnapshots.push(state.activity.map(item => item.id)) }
    );
    writeReactive(state, ["activity"], [{ id: "first", message: "First" }]);
    writeReactive(state, ["activity"], [
      { id: "second", message: "Second" },
      ...state.activity.slice(0, 9)
    ]);
    flushSync();

    expect(state.activity.map(item => item.id)).toEqual(["second", "first"]);
    expect(lengths).toEqual([0, 2]);
    expect(scheduledSnapshots).toEqual([["first"]]);
  });

  it("keeps keyed task and activity arrays valid across repeated component-style updates", () => {
    const state = reactive({
      tasks: [{ id: "task", status: "backlog", title: "Task" }, { id: "other", status: "active", title: "Other" }],
      activity: [] as Array<{ id: string; message: string }>
    });
    registerReactiveListKey(state.tasks, item => (item as { id: string }).id);
    watch(() => {
      if (state.activity.length) registerReactiveListKey(state.activity, item => (item as { id: string }).id);
    });
    let activityId = 0;
    const update = (status: string) => {
      const task = state.tasks.find(item => item.id === "task")!;
      const nextTask = { ...task, status };
      writeReactive(state, ["tasks"], state.tasks.map(item => item.id === task.id ? nextTask : item));
      writeReactive(state, ["activity"], [
        { id: String(++activityId), message: `Moved to ${status}` },
        ...state.activity.slice(0, 9)
      ]);
      flushSync();
    };

    update("active");
    update("backlog");

    expect(state.tasks.map(item => item.id)).toEqual(["task", "other"]);
    expect(state.activity.map(item => item.id)).toEqual(["2", "1"]);
  });

  it("publishes structured object writes only after the complete object is valid", () => {
    const state = reactive({ record: { first: "old", second: "old" } });
    const scheduled: string[] = [];
    watch(
      () => `${state.record.first}:${state.record.second}`,
      undefined,
      { onSchedule: () => scheduled.push(`${state.record.first}:${state.record.second}`) }
    );

    writeReactive(state, ["record"], { first: "new", second: "new" });
    flushSync();

    expect(scheduled).toEqual(["new:new"]);
  });

  it("deduplicates scheduling across a compiler-owned transaction", () => {
    const state = reactive({ first: 0, second: 0 });
    const scheduled = vi.fn();
    const render = vi.fn(() => void `${state.first}:${state.second}`);
    watch(render, undefined, { onSchedule: scheduled });

    batch(() => {
      state.first = 1;
      state.second = 2;
    });
    flushSync();

    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("invalidates array length and removed indexes for direct writes", () => {
    const state = reactive({ items: ["a", "b", "c"] as Array<string | undefined> });
    const lengths: number[] = [];
    const removed: Array<string | undefined> = [];
    watch(() => lengths.push(state.items.length));
    watch(() => removed.push(state.items[2]));

    state.items[5] = "f";
    flushSync();
    state.items.length = 1;
    flushSync();

    expect(lengths).toEqual([3, 6, 1]);
    expect(removed).toEqual(["c", undefined]);
  });

  it("tracks property-existence reads", () => {
    const state = reactive({ record: {} as Record<string, number> });
    const values: boolean[] = [];
    watch(() => values.push("answer" in state.record));
    state.record.answer = 42;
    flushSync();
    expect(values).toEqual([false, true]);
  });

  it("leaves non-plain objects intact", () => {
    const date = new Date(0);
    const map = new Map([["answer", 42]]);
    const state = reactive({ date, map });
    expect(state.date).toBe(date);
    expect(state.date.getTime()).toBe(0);
    expect(state.map.get("answer")).toBe(42);
  });

  it("replaces immutable records instead of attempting in-place reconciliation", () => {
    const frozen = Object.freeze({ title: "old" });
    const state = reactive({ record: frozen });
    expect(() => writeReactive(state, ["record"], { title: "new" })).not.toThrow();
    expect(state.record).not.toBe(frozen);
    expect(state.record.title).toBe("new");
  });

  it("preserves sparse array holes during compiler writes", () => {
    const initial = new Array<string>(3);
    initial[1] = "middle";
    const state = reactive({ items: initial });
    const next = new Array<string>(4);
    next[2] = "next";
    writeReactive(state, ["items"], next);
    expect(state.items.length).toBe(4);
    expect(0 in state.items).toBe(false);
    expect(1 in state.items).toBe(false);
    expect(2 in state.items).toBe(true);
    expect(3 in state.items).toBe(false);
  });

  it("compares and snapshots cyclic graphs safely", () => {
    const value: { label: string; self?: unknown } = { label: "node" };
    value.self = value;
    const state = reactive({ value });
    const copy = snapshot(state.value);
    expect(copy).not.toBe(value);
    expect(copy.self).toBe(copy);
    expect(() => { state.value = value; }).not.toThrow();
  });

  it("notifies mutations performed before a throwing array comparator", () => {
    const state = reactive({ items: [3, 2, 1] });
    const seen: string[] = [];
    watch(() => seen.push(state.items.join(",")));
    let comparisons = 0;
    expect(() => state.items.sort((left, right) => {
      if (++comparisons > 1) throw new Error("stop");
      return left - right;
    })).toThrow("stop");
    flushSync();
    if (state.items.join(",") !== "3,2,1") expect(seen.at(-1)).toBe(state.items.join(","));
  });

  it("rejects conflicting key extractors registered for one collection", () => {
    const state = reactive({ records: [{ id: "a", slug: "first" }] });
    registerReactiveListKey(state.records, item => (item as { id: string }).id, "Tasks.tsx:10");

    expect(() => registerReactiveListKey(state.records, item => (item as { slug: string }).slug, "Sidebar.tsx:20"))
      .toThrow("Conflicting this.map() key extractors");
  });

  it("uses compiler key metadata instead of recreated function identity", () => {
    const state = reactive({ records: [{ id: "a" }] });
    registerReactiveListKey(state.records, item => (item as { id: string }).id, "ListA", "member:id");
    expect(() => registerReactiveListKey(state.records, function differentSource(item) {
      return (item as { id: string }).id;
    }, "ListB", "member:id")).not.toThrow();
    expect(() => registerReactiveListKey(state.records, item => (item as { id: string }).id, "ListC", "member:slug"))
      .toThrow("Conflicting this.map() key extractors");
  });

  it("reconciles cyclic structured values without recursing indefinitely", () => {
    const initial: { name: string; self?: unknown } = { name: "node" };
    initial.self = initial;
    const state = reactive({ value: initial });
    const next: { name: string; self?: unknown } = { name: "node" };
    next.self = next;
    expect(() => writeReactive(state, ["value"], next)).not.toThrow();
    expect(state.value.self).toBe(state.value);
  });

  it("fails a self-invalidating reaction instead of looping forever", () => {
    const state = reactive({ count: 0 });
    watch(() => {
      if (state.count < 2_000) state.count++;
    });
    expect(() => flushSync()).toThrow("exceeded its flush limit");
  });

  it("preserves postfix-update and array-mutator return semantics", () => {
    const state = reactive({ count: 1, items: ["a"] });
    expect(updateReactiveValue(state, ["count"], previous => Number(previous) + 1, true)).toBe(1);
    expect(state.count).toBe(2);
    expect(mutateReactiveArray(state, ["items"], "push", ["b"])).toBe(2);
    expect(mutateReactiveArray(state, ["items"], "pop", [])).toBe("b");
  });

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

  it("tracks direct array length truncation", () => {
    const state = reactive({ items: ["a", "b", "c"] });
    const list = computed(() => state.items.join(""));
    const seen: string[] = [];
    const source = ref(list)!;

    subscribe(source, () => seen.push(source.get()));
    expect(unwrap(list)).toBe("abc");

    state.items.length = 1;
    flushSync();

    expect(seen).toEqual(["a"]);
    expect(unwrap(list)).toBe("a");
  });

  it("tracks array splice, sort, and reverse as structural changes", () => {
    const state = reactive({ items: ["c", "a", "b"] });
    const list = computed(() => state.items.join(""));
    const seen: string[] = [];
    const source = ref(list)!;

    subscribe(source, () => seen.push(source.get()));
    expect(unwrap(list)).toBe("cab");

    state.items.splice(1, 1, "d");
    flushSync();
    state.items.sort();
    flushSync();
    state.items.reverse();
    flushSync();

    expect(seen).toEqual(["cdb", "bcd", "dcb"]);
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
