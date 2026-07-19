// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, createElement } from "@exact/react-compat";
import { exposeExactComponent } from "@exact/react-compat/interop";
import { createRoot } from "@exact/react-dom-compat/client19";
import { renderToString } from "@exact/react-dom-compat/server19";
import type { Component } from "@exact/core";
import { RouterControllerContext } from "./context.js";
import {
  Link,
  MemoryRouter,
  Outlet,
  Route,
  Router,
  RouterProvider,
  StaticRouterProvider,
  Routes,
  createBrowserRouter,
  createMemoryRouter,
  createStaticRouter,
  createStaticHandler,
  useLoaderData,
  useHref,
  useBlocker,
  useLocation,
  useParams,
  useRouteError
} from "./modern.js";

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("React Router modern facade", () => {
  it("renders declarative routes, params, outlets, and navigation", async () => {
    function Layout() { return createElement("main", null, createElement(Outlet, {})); }
    function User() {
      const params = useParams();
      const location = useLocation();
      return createElement("p", null, `${params.id}:${location.pathname}`);
    }
    const container = document.createElement("div");
    createRoot(container).render(createElement(MemoryRouter, { initialEntries: ["/users/1"] },
      createElement(Routes, null,
        createElement(Route, { element: createElement(Layout, {}) },
          createElement(Route, { path: "users/:id", element: createElement(User, {}) }),
          createElement(Route, { path: "next", element: createElement("p", null, "Next") })
        )
      ),
      createElement(Link, { to: "/next" }, "Go")
    ));
    await settle();
    expect(container.textContent).toContain("1:/users/1");
    container.querySelector("a")!.click();
    await settle();
    expect(container.textContent).toContain("Next");
  });

  it("runs data loaders through RouterProvider", async () => {
    function User() {
      const data = useLoaderData<{ name: string }>();
      return createElement("p", null, data.name);
    }
    const router = createMemoryRouter([
      { id: "user", path: "users/:id", loader: ({ params }) => ({ name: `User ${params.id}` }), Component: User }
    ], { initialEntries: ["/users/42"] });
    const container = document.createElement("div");
    createRoot(container).render(createElement(RouterProvider, { router, fallbackElement: "Loading" }));
    await settle();
    await settle();
    expect(container.textContent).toBe("User 42");
  });

  it("shares the controller token with native eXact component boundaries", async () => {
    function NativeLocation(this: Component<{ version: number }>) {
      this.state.version = 0;
      const router = this.getContext(RouterControllerContext);
      let unsubscribe: (() => void) | undefined;
      this.onMount(() => { unsubscribe = router.subscribe(() => { this.state.version++; }); });
      this.onUnmount(() => unsubscribe?.());
      return () => {
        void this.state.version;
        return router.getSnapshot().location.pathname;
      };
    }
    const ExactLocation = exposeExactComponent(NativeLocation, "NativeLocation");
    const container = document.createElement("div");
    createRoot(container).render(createElement(MemoryRouter, { initialEntries: ["/"] },
      createElement(ExactLocation, {}),
      createElement(Link, { to: "/shared" }, "Move")
    ));
    await settle();
    expect(container.textContent).toContain("/");
    container.querySelector("a")!.click();
    await settle();
    expect(container.textContent).toContain("/shared");
  });

  it("runs static loaders with request context and returns redirect responses", async () => {
    const requestContext = { tenant: "exact" };
    const handler = createStaticHandler([
      {
        id: "home",
        path: "home",
        loader: ({ context }) => ({ tenant: (context as typeof requestContext).tenant })
      },
      { id: "old", path: "old", loader: () => new Response(null, { status: 307, headers: { Location: "/home" } }) }
    ]);
    const context = await handler.query(new Request("https://example.test/home"), { requestContext });
    expect(context).toMatchObject({ loaderData: { home: { tenant: "exact" } }, statusCode: 200 });
    const response = await handler.query(new Request("https://example.test/old"));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get("Location")).toBe("https://example.test/home");
  });

  it("preserves static loader response status and headers and follows thrown action redirects", async () => {
    const handler = createStaticHandler([
      {
        id: "report",
        path: "report",
        loader: () => new Response("ready", {
          status: 202,
          headers: { "Content-Type": "text/plain", "X-Route": "report" }
        }),
        action: () => { throw new Response(null, { status: 303, headers: { Location: "/done" } }); }
      },
      { id: "done", path: "done" }
    ]);
    const context = await handler.query(new Request("https://example.test/report"));
    expect(context).not.toBeInstanceOf(Response);
    expect(context).toMatchObject({ statusCode: 202, loaderData: { report: "ready" } });
    expect((context as Exclude<typeof context, Response>).loaderHeaders.report?.get("X-Route")).toBe("report");
    const redirect = await handler.query(new Request("https://example.test/report", { method: "POST" }));
    expect(redirect).toBeInstanceOf(Response);
    expect((redirect as Response).status).toBe(303);
    expect((redirect as Response).headers.get("Location")).toBe("https://example.test/done");
  });

  it("resolves parent navigation by route hierarchy", async () => {
    function Detail() {
      return createElement("a", { href: useHref("..") }, "Parent");
    }
    const router = createMemoryRouter([{
      id: "users",
      path: "users",
      children: [{ id: "detail", path: ":id", Component: Detail }]
    }], { initialEntries: ["/users/42"] });
    const container = document.createElement("div");
    createRoot(container).render(createElement(RouterProvider, { router }));
    await settle();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/users");
  });

  it("blocks and explicitly proceeds with modern navigation", async () => {
    function Page() {
      const blocker = useBlocker(true);
      return createElement("section", null,
        createElement(Link, { to: "/next" }, "Move"),
        blocker.state === "blocked"
          ? createElement("button", { onClick: () => blocker.proceed?.() }, "Proceed")
          : null
      );
    }
    const router = createMemoryRouter([
      { id: "home", index: true, Component: Page },
      { id: "next", path: "next", element: "Next" }
    ], { initialEntries: ["/"] });
    const container = document.createElement("div");
    createRoot(container).render(createElement(RouterProvider, { router }));
    await settle();
    container.querySelector("a")!.click();
    await settle();
    expect(router.getSnapshot().location.pathname).toBe("/");
    container.querySelector("button")!.click();
    await settle();
    expect(router.getSnapshot().location.pathname).toBe("/next");
  });

  it("emits escaped hydration data from StaticRouterProvider", async () => {
    const routes = [
      { id: "home", path: "home", loader: () => ({ markup: "</script><script>alert(1)</script>" }) }
    ];
    const handler = createStaticHandler(routes);
    const context = await handler.query(new Request("https://example.test/home"));
    expect(context).not.toBeInstanceOf(Response);
    const router = createStaticRouter(routes, context as Exclude<typeof context, Response>);
    const html = renderToString(createElement(StaticRouterProvider, {
      router,
      context: context as Exclude<typeof context, Response>,
      nonce: "router-nonce"
    }));
    expect(html).toContain('id="__exact_router_hydration"');
    expect(html).toContain('nonce="router-nonce"');
    expect(html).toContain("\\u003C/script>");
    expect(html).not.toContain("</script><script>alert(1)</script>");
  });

  it("adopts server hydration data without rerunning the initial loader", async () => {
    window.history.replaceState(null, "", "/home");
    const hydration = document.createElement("script");
    hydration.id = "__exact_router_hydration";
    hydration.type = "application/json";
    hydration.textContent = JSON.stringify({
      protocol: 1,
      key: "default",
      location: "/home",
      matches: ["home"],
      data: { loaderData: { home: { source: "server" } } }
    });
    document.body.appendChild(hydration);
    let loaderCalls = 0;
    const router = createBrowserRouter([
      { id: "home", path: "home", loader: () => { loaderCalls++; return { source: "client" }; } }
    ]);
    await settle();
    expect(router.getSnapshot().loaderData).toEqual({ home: { source: "server" } });
    expect(loaderCalls).toBe(0);
    expect(document.getElementById("__exact_router_hydration")).toBeNull();
    router.dispose();
  });

  it("rejects hydration for another location and supports keyed router roots", async () => {
    window.history.replaceState(null, "", "/home");
    const stale = document.createElement("script");
    stale.id = "__exact_router_hydration";
    stale.type = "application/json";
    stale.textContent = JSON.stringify({
      protocol: 1,
      key: "default",
      location: "/other",
      matches: ["home"],
      data: { loaderData: { home: "stale" } }
    });
    document.body.appendChild(stale);
    let loaderCalls = 0;
    const rejected = createBrowserRouter([
      { id: "home", path: "home", loader: () => { loaderCalls++; return "fresh"; } }
    ]);
    await rejected.initialize();
    expect(rejected.getSnapshot().loaderData).toEqual({ home: "fresh" });
    expect(loaderCalls).toBe(1);
    rejected.dispose();

    const keyed = document.createElement("script");
    keyed.id = "__exact_router_hydration_account";
    keyed.type = "application/json";
    keyed.textContent = JSON.stringify({
      protocol: 1,
      key: "account",
      location: "/home",
      matches: ["home"],
      data: { loaderData: { home: "account server" } }
    });
    document.body.appendChild(keyed);
    const adopted = createBrowserRouter([
      { id: "home", path: "home", loader: () => "client" }
    ], { hydrationKey: "account" });
    expect(adopted.getSnapshot().loaderData).toEqual({ home: "account server" });
    adopted.dispose();
  });

  it("updates controlled router locations and navigation types", async () => {
    function Location() {
      const location = useLocation();
      return createElement("p", null, location.pathname);
    }
    const navigator = {
      push() {},
      replace() {},
      go() {}
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => root.render(createElement(Router, {
      location: "/one",
      navigationType: "PUSH",
      navigator
    }, createElement(Location, {}))));
    expect(container.textContent).toBe("/one");
    await act(() => root.render(createElement(Router, {
      location: "/two",
      navigationType: "REPLACE",
      navigator
    }, createElement(Location, {}))));
    expect(container.textContent).toBe("/two");
  });

  it("leaves cross-origin links to normal browser navigation", async () => {
    const container = document.createElement("div");
    createRoot(container).render(createElement(MemoryRouter, null,
      createElement(Link, { to: "https://docs.example.test/guide" }, "Docs")
    ));
    await settle();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    container.querySelector("a")!.onclick?.call(container.querySelector("a")!, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("preserves ancestor layouts and exposes descendant loader errors to the selected boundary", async () => {
    function Layout() { return createElement("main", null, "Layout:", createElement(Outlet, {})); }
    function Boundary() {
      const error = useRouteError() as Error;
      return createElement("p", null, `Caught ${error.message}`);
    }
    const router = createMemoryRouter([{
      id: "root",
      Component: Layout,
      children: [{
        id: "section",
        ErrorBoundary: Boundary,
        children: [{
          id: "broken",
          path: "broken",
          loader: () => { throw new Error("loader failed"); }
        }]
      }]
    }], { initialEntries: ["/broken"] });
    const container = document.createElement("div");
    createRoot(container).render(createElement(RouterProvider, { router }));
    await settle();
    await settle();
    expect(container.textContent).toBe("Layout:Caught loader failed");
  });

  it("exposes component rendering failures through route error boundaries", async () => {
    function Broken(): never { throw new Error("render failed"); }
    function Boundary() {
      const error = useRouteError() as Error;
      return createElement("p", null, `Caught ${error.message}`);
    }
    const router = createMemoryRouter([{
      id: "broken",
      path: "broken",
      Component: Broken,
      ErrorBoundary: Boundary
    }], {
      initialEntries: ["/broken"],
      hydrationData: {}
    });
    const container = document.createElement("div");
    createRoot(container).render(createElement(RouterProvider, { router }));
    await settle();
    expect(container.textContent).toBe("Caught render failed");
  });
});
