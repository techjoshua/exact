// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement } from "@exact/react-compat";
import { exposeExactComponent } from "@exact/react-compat/interop";
import { createRoot } from "@exact/react-dom-compat/client19";
import type { Component } from "@exact/core";
import { RouterControllerContext } from "./context.js";
import {
  Link,
  MemoryRouter,
  Outlet,
  Route,
  RouterProvider,
  Routes,
  createMemoryRouter,
  useLoaderData,
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
});
