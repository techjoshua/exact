// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement } from "@exact/react-compat";
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
  useParams
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
    hydration.textContent = JSON.stringify({ loaderData: { home: { source: "server" } } });
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
});
