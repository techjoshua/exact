import { describe, expect, it, vi } from "vitest";
import { createMemoryLocationSource } from "./index.js";
import {
  createExactRouter,
  generatePath,
  hydrationDataFromSnapshot,
  hydrationEnvelopeFromSnapshot,
  matchPath,
  matchRoutes,
  redirect,
  type ExactRouteDefinition
} from "./core.js";

describe("renderer-neutral router core", () => {
  const routes = [
    {
      id: "root",
      children: [
        { id: "home", index: true },
        { id: "user", path: "users/:id?" },
        { id: "files", path: "files/*" }
      ]
    }
  ] satisfies readonly ExactRouteDefinition[];

  it("matches pathless, index, optional, and splat routes", () => {
    expect(matchRoutes(routes, "/").map(match => match.id)).toEqual(["root", "home"]);
    expect(matchRoutes(routes, "/users").at(-1)?.params).toEqual({});
    expect(matchRoutes(routes, "/users/42").at(-1)?.params).toEqual({ id: "42" });
    expect(matchRoutes(routes, "/files/a/b").at(-1)).toMatchObject({
      params: { "*": "a/b" },
      pathnameBase: "/files"
    });
  });

  it("matches absolute child paths from the route root", () => {
    const absolute = [{
      id: "app",
      path: "/app",
      children: [{ id: "settings", path: "/app/settings" }]
    }] satisfies readonly ExactRouteDefinition[];
    expect(matchRoutes(absolute, "/app/settings").map(match => match.id)).toEqual(["app", "settings"]);
  });

  it("provides standalone matching and path generation", () => {
    expect(matchPath({ path: "/teams/:teamId", end: false }, "/teams/exact/members")?.params)
      .toEqual({ teamId: "exact" });
    expect(generatePath("/teams/:teamId/:tab?", { teamId: "exact" })).toBe("/teams/exact");
    expect(generatePath("/files/*", { "*": "a/b" })).toBe("/files/a/b");
  });

  it("publishes immutable snapshots and one notification per transition stage", async () => {
    const source = createMemoryLocationSource(["https://example.test/", "https://example.test/users/1"], 0);
    const router = createExactRouter({ source, routes });
    const listener = vi.fn();
    router.subscribe(listener);
    const initial = router.getSnapshot();
    await router.navigate("/users/2", { state: { from: "test" } });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(router.getSnapshot()).toMatchObject({
      historyAction: "PUSH",
      location: { pathname: "/users/2", state: { from: "test" } },
      navigation: { state: "idle" }
    });
    await router.navigate(-1);
    expect(router.getSnapshot()).toMatchObject({ historyAction: "POP", location: { pathname: "/" } });
  });

  it("blocks navigation and rejects use after disposal", async () => {
    const source = createMemoryLocationSource("https://example.test/");
    const router = createExactRouter({ source, routes });
    const unblock = router.block(() => true);
    await router.navigate("/users/1");
    expect(router.getSnapshot().location.pathname).toBe("/");
    unblock();
    await router.navigate("/users/1");
    expect(router.getSnapshot().location.pathname).toBe("/users/1");
    router.dispose();
    expect(() => router.subscribe(() => {})).toThrow(/disposed/);
  });

  it("initializes loaders, adopts hydration data, and cancels superseded navigation", async () => {
    let resolveSlow!: (value: unknown) => void;
    const slow = new Promise(resolve => { resolveSlow = resolve; });
    const dataRoutes = [{
      id: "root",
      children: [
        { id: "home", index: true, loader: () => "home" },
        { id: "slow", path: "slow", loader: async ({ signal }) => {
          const value = await slow;
          if (signal.aborted) throw signal.reason;
          return value;
        } },
        { id: "fast", path: "fast", loader: () => "fast" }
      ]
    }] satisfies readonly ExactRouteDefinition[];
    const router = createExactRouter({
      source: createMemoryLocationSource("https://example.test/"),
      routes: dataRoutes,
      context: { tenant: "exact" }
    });
    expect(router.getSnapshot().initialized).toBe(false);
    await router.initialize();
    expect(router.getSnapshot()).toMatchObject({ initialized: true, loaderData: { home: "home" } });
    const pending = router.navigate("/slow");
    const winning = router.navigate("/fast");
    resolveSlow("stale");
    await Promise.all([pending, winning]);
    expect(router.getSnapshot()).toMatchObject({
      location: { pathname: "/fast" },
      loaderData: { fast: "fast" }
    });

    const hydrated = createExactRouter({
      source: createMemoryLocationSource("https://example.test/"),
      routes: dataRoutes,
      hydrationData: { loaderData: { home: "server" } }
    });
    await hydrated.initialize();
    expect(hydrated.getSnapshot().loaderData).toEqual({ home: "server" });
  });

  it("runs actions, revalidates loaders, manages fetchers, and follows redirects", async () => {
    let count = 0;
    const dataRoutes = [{
      id: "root",
      children: [
        {
          id: "item",
          path: "items/:id",
          loader: ({ params }) => ({ id: params.id, count }),
          action: async ({ request }) => {
            count += Number(await request.text() || "1");
            return { count };
          }
        },
        { id: "old", path: "old", loader: () => redirect("/items/2", 301) }
      ]
    }] satisfies readonly ExactRouteDefinition[];
    const router = createExactRouter({
      source: createMemoryLocationSource("https://example.test/items/1"),
      routes: dataRoutes
    });
    await router.initialize();
    await router.submit("/items/1", { method: "POST", body: "2" });
    expect(router.getSnapshot()).toMatchObject({
      actionData: { item: { count: 2 } },
      loaderData: { item: { id: "1", count: 2 } },
      revalidation: "idle"
    });
    await router.fetch("item-2", "item", "/items/2");
    expect(router.getSnapshot().fetchers.get("item-2")).toEqual({
      state: "idle",
      data: { id: "2", count: 2 }
    });
    await router.navigate("/old");
    expect(router.getSnapshot()).toMatchObject({
      historyAction: "REPLACE",
      location: { pathname: "/items/2" }
    });
  });

  it("associates loader errors with route ids and materializes lazy routes", async () => {
    const failure = new Error("loader failed");
    const dataRoutes = [{
      id: "root",
      children: [
        { id: "bad", path: "bad", loader: () => { throw failure; } },
        { id: "lazy", path: "lazy", lazy: async () => ({ loader: () => "lazy data", handle: "ready" }) }
      ]
    }] satisfies readonly ExactRouteDefinition[];
    const router = createExactRouter({
      source: createMemoryLocationSource("https://example.test/bad"),
      routes: dataRoutes
    });
    await router.initialize();
    expect(router.getSnapshot().errors).toEqual({ bad: failure });
    await router.navigate("/lazy");
    expect(router.getSnapshot().loaderData).toEqual({ lazy: "lazy data" });
    expect((dataRoutes[0].children[1] as ExactRouteDefinition).handle).toBe("ready");
  });

  it("validates bounded JSON-safe route hydration data", async () => {
    const safe = createExactRouter({
      source: createMemoryLocationSource("/"),
      routes: [{ id: "root", index: true }],
      hydrationData: { loaderData: { root: { value: 1 } } }
    });
    expect(hydrationDataFromSnapshot(safe.getSnapshot())).toEqual({
      loaderData: { root: { value: 1 } },
      actionData: {},
      errors: {}
    });
    const unsafe = createExactRouter({
      source: createMemoryLocationSource("/"),
      routes: [{ id: "root", index: true }],
      hydrationData: { loaderData: { root: new Date() } }
    });
    expect(() => hydrationDataFromSnapshot(unsafe.getSnapshot())).toThrow(/not JSON-safe/);
    expect(() => hydrationDataFromSnapshot(safe.getSnapshot(), { maxBytes: 1 })).toThrow(/byte limits/);
    expect(hydrationEnvelopeFromSnapshot(safe.getSnapshot(), "account")).toMatchObject({
      protocol: 1,
      key: "account",
      location: "/",
      matches: ["root"],
      data: { loaderData: { root: { value: 1 } } }
    });
  });

  it("bounds redirect chains and supersedes fetchers by key", async () => {
    let firstResolve!: (value: unknown) => void;
    const first = new Promise(resolve => { firstResolve = resolve; });
    const router = createExactRouter({
      source: createMemoryLocationSource("/"),
      routes: [{
        id: "root",
        children: [
          { id: "loop", path: "loop", loader: () => redirect("/loop") },
          { id: "item", path: "items/:id", loader: ({ params }: any) => params.id === "1" ? first : params.id }
        ]
      }]
    });
    await expect(router.navigate("/loop")).rejects.toThrow(/maximum redirect depth/);
    const stale = router.fetch("same", "item", "/items/1");
    const current = router.fetch("same", "item", "/items/2");
    firstResolve("1");
    await Promise.all([stale, current]);
    expect(router.getSnapshot().fetchers.get("same")).toEqual({ state: "idle", data: "2" });
  });

  it("rejects stale initialization, action, and revalidation commits even when handlers ignore abort", async () => {
    let resolveInitial!: (value: unknown) => void;
    let resolveAction!: (value: unknown) => void;
    let resolveRevalidation!: (value: unknown) => void;
    const initial = new Promise(resolve => { resolveInitial = resolve; });
    const action = new Promise(resolve => { resolveAction = resolve; });
    const revalidation = new Promise(resolve => { resolveRevalidation = resolve; });
    let homeLoads = 0;
    const router = createExactRouter({
      source: createMemoryLocationSource("/home"),
      routes: [
        {
          id: "home",
          path: "home",
          loader: () => ++homeLoads === 1 ? initial : homeLoads === 4 ? revalidation : "home",
          action: () => action
        },
        { id: "next", path: "next", loader: () => "next" }
      ]
    });

    const staleInitialization = router.initialize();
    await router.navigate("/next");
    resolveInitial("stale initial");
    await staleInitialization;
    expect(router.getSnapshot()).toMatchObject({
      location: { pathname: "/next" },
      loaderData: { next: "next" },
      initialized: true
    });

    await router.navigate("/home");
    const staleAction = router.submit("/home", { method: "POST" });
    await router.navigate("/next");
    resolveAction({ stale: true });
    await staleAction;
    expect(router.getSnapshot()).toMatchObject({
      location: { pathname: "/next" },
      loaderData: { next: "next" },
      actionData: {}
    });

    await router.navigate("/home");
    const staleRevalidation = router.revalidate();
    await Promise.resolve();
    await router.navigate("/next");
    resolveRevalidation("stale revalidation");
    await staleRevalidation;
    expect(router.getSnapshot()).toMatchObject({
      location: { pathname: "/next" },
      loaderData: { next: "next" }
    });
  });

  it("lets fetchers finish without allowing their revalidation to overwrite navigation", async () => {
    let resolveRevalidation!: (value: unknown) => void;
    const revalidation = new Promise(resolve => { resolveRevalidation = resolve; });
    let loads = 0;
    const router = createExactRouter({
      source: createMemoryLocationSource("/item"),
      routes: [
        {
          id: "item",
          path: "item",
          loader: () => ++loads === 1 ? "initial" : revalidation,
          action: () => "saved"
        },
        { id: "next", path: "next", loader: () => "next" }
      ]
    });
    await router.initialize();
    const fetcher = router.fetch("save", "item", "/item", { method: "POST" });
    await Promise.resolve();
    await router.navigate("/next");
    resolveRevalidation("stale");
    await fetcher;
    expect(router.getSnapshot()).toMatchObject({
      location: { pathname: "/next" },
      loaderData: { next: "next" }
    });
    expect(router.getSnapshot().fetchers.get("save")).toEqual({ state: "idle", data: "saved" });
  });
});
