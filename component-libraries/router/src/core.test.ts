import { describe, expect, it, vi } from "vitest";
import { createMemoryLocationSource } from "./index.js";
import { createExactRouter, generatePath, matchPath, matchRoutes, type ExactRouteDefinition } from "./core.js";

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
});
