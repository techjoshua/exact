import { describe, expect, it } from "vitest";
import { generatePath as exactGeneratePath, matchPath as exactMatchPath } from "./core.js";
import {
  createMemoryRouter as createExactMemoryRouter,
  matchPath as modernMatchPath
} from "./modern.js";
import { matchPath as v5MatchPath } from "./v5.js";

describe("pinned React Router differential conformance", () => {
  it("matches v5 path parameters and exactness", async () => {
    const packageName = "react-router-dom-v5";
    const actual: any = await import(packageName);
    const scenarios = [
      ["/users/42", { path: "/users/:id", exact: true }],
      ["/users/42/edit", { path: "/users/:id", exact: false }],
      ["/other", { path: "/users/:id", exact: false }]
    ] as const;
    for (const [pathname, pattern] of scenarios) {
      expect(normalizeV5(v5MatchPath(pathname, pattern))).toEqual(normalizeV5(actual.matchPath(pathname, pattern)));
    }
    expect(exactGeneratePath("/users/:id", { id: "42" })).toBe(actual.generatePath("/users/:id", { id: "42" }));
  });

  it("matches pre-data v6 declarative helpers", async () => {
    const packageName = "react-router-dom-v63";
    const actual: any = await import(packageName);
    const scenarios = [
      ["/teams/exact", { path: "/teams/:team", end: true }],
      ["/teams/exact/members", { path: "/teams/:team", end: false }],
      ["/elsewhere", { path: "/teams/:team", end: false }]
    ] as const;
    for (const [pathname, pattern] of scenarios) {
      expect(normalizeModern(modernMatchPath(pattern, pathname))).toEqual(normalizeModern(actual.matchPath(pattern, pathname)));
    }
    expect(actual.createMemoryRouter).toBeUndefined();
  });

  it.each([
    ["final v6", "react-router-dom-v6"],
    ["v7", "react-router-dom-v7"]
  ])("matches %s memory data-router navigation and loader observations", async (_label, packageName) => {
    const actual: any = await import(packageName);
    const actualCalls: string[] = [];
    const exactCalls: string[] = [];
    const actualRouter = actual.createMemoryRouter([{
      id: "user",
      path: "/users/:id",
      loader: ({ params }: any) => {
        actualCalls.push(params.id);
        return { id: params.id };
      }
    }], { initialEntries: ["/users/1"] });
    await initialized(actualRouter);
    const exactRouter = createExactMemoryRouter([{
      id: "user",
      path: "/users/:id",
      loader: ({ params }) => {
        exactCalls.push(params.id!);
        return { id: params.id };
      }
    }], { initialEntries: ["/users/1"] });
    await exactRouter.initialize();
    await Promise.all([actualRouter.navigate("/users/2"), exactRouter.navigate("/users/2")]);
    expect({
      location: exactRouter.getSnapshot().location.pathname,
      loaderData: exactRouter.getSnapshot().loaderData,
      calls: exactCalls
    }).toEqual({
      location: actualRouter.state.location.pathname,
      loaderData: actualRouter.state.loaderData,
      calls: actualCalls
    });
    actualRouter.dispose();
    exactRouter.dispose();
  });
});

function normalizeV5(value: any): unknown {
  if (!value) return null;
  return {
    path: value.path,
    url: value.url,
    isExact: value.isExact,
    params: value.params
  };
}

function normalizeModern(value: any): unknown {
  if (!value) return null;
  return {
    pathname: value.pathname,
    pathnameBase: value.pathnameBase,
    params: value.params
  };
}

async function initialized(router: any): Promise<void> {
  if (router.state.initialized) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Pinned React Router did not initialize"));
    }, 2_000);
    const unsubscribe = router.subscribe((state: any) => {
      if (!state.initialized) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}
