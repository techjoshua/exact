/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createErrorContext, createVNode, ErrorContext, type Component } from "@exact/core";
import { render } from "@exact/dom";
import { renderToString } from "@exact/ssr";
import { runWithRequestContext } from "@exact/request";
import { createMemoryLocationSource, Link, Navigate, NavLink, Outlet, Route, RouteContext, Router } from "./index.js";

describe("router", () => {
  it("matches nested dynamic routes and navigates", () => {
    function Layout() { return () => createVNode("main", null, createVNode(Outlet, {})); }
    function User(this: Component<{}>) { const route = this.getContext(RouteContext); return () => createVNode("p", null, `User ${route.params.id}`); }
    function Home() { return () => createVNode(Link, { to: "/users/42" }, "Open"); }
    const source = createMemoryLocationSource("https://example.test/");
    const container = document.createElement("div");
    render(<Router source={source}><Route component={Layout}><Route index component={Home} /><Route path="users/:id" component={User} /></Route></Router>, container);
    expect(container.textContent).toBe("Open");
    container.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(container.textContent).toBe("User 42");
    source.push(new URL("https://example.test/users/99"));
    expect(container.textContent).toBe("User 99");
  });

  it("normalizes basenames and generates hash links", () => {
    function Page() { return () => <NavLink to="/start">Start</NavLink>; }
    const source = createMemoryLocationSource("https://example.test/app/start");
    const container = document.createElement("div");
    render(<Router source={source} basename="/app" mode="hash"><Route path="start" component={Page} /></Router>, container);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("#/app/start");
    expect(container.querySelector("a")?.getAttribute("aria-current")).toBe("page");
  });

  it("matches explicit fragment-bearing hash sources for SSR parity", () => {
    function Page(this: Component<{}>) {
      const route = this.getContext(RouteContext);
      return () => <><p>{route.location.search}</p><Link to="?page=2">Next</Link></>;
    }
    const source = createMemoryLocationSource("https://example.test/#/app/start?from=ssr");
    const container = document.createElement("div");
    render(<Router source={source} basename="/app" mode="hash"><Route path="start" component={Page} /></Router>, container);
    expect(container.querySelector("p")?.textContent).toBe("?from=ssr");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("#/app/start?page=2");
  });

  it("keeps the current pathname for query and fragment targets", () => {
    function Page() { return () => <><Link to="?page=2">Query</Link><Link to="#details">Hash</Link></>; }
    const source = createMemoryLocationSource("https://example.test/users/42");
    const container = document.createElement("div");
    render(<Router source={source}><Route path="users/:id" component={Page} /></Router>, container);
    expect(Array.from(container.querySelectorAll("a"), anchor => anchor.getAttribute("href"))).toEqual(["/users/42?page=2", "/users/42#details"]);
  });

  it("does not strip a basename from a partial segment", () => {
    function Page() { return () => <p>Apple</p>; }
    const container = document.createElement("div");
    render(<Router source={createMemoryLocationSource("https://example.test/apple")} basename="/app"><Route path="le" component={Page} /></Router>, container);
    expect(container.textContent).toBe("");
  });

  it("reads SSR request URLs and records redirects", () => {
    let redirect: { location: string; status?: number } | undefined;
    runWithRequestContext({
      url: new URL("https://example.test/old"),
      redirect(location, status) { redirect = { location: String(location), status }; }
    }, () => renderToString(<Router><Route path="old" component={Navigate} componentProps={{ to: "/new", status: 301 }} /></Router>));
    expect(redirect).toEqual({ location: "https://example.test/new", status: 301 });

    runWithRequestContext({
      url: new URL("https://example.test/old"),
      redirect(location, status) { redirect = { location: String(location), status }; }
    }, () => renderToString(<Router><Route path="old" component={Navigate} componentProps={{ to: "/pushed", replace: false, status: 307 }} /></Router>));
    expect(redirect).toEqual({ location: "https://example.test/pushed", status: 307 });
  });

  it("observes rejected consumer link callbacks", async () => {
    const errors = createErrorContext();
    function Page() { return () => <Link to="/next" onClick={async () => { throw new Error("link failed"); }}>Next</Link>; }
    function App(this: Component<{}>) {
      this.setContext(ErrorContext, errors);
      return () => <Router source={createMemoryLocationSource("https://example.test/")}><Route index component={Page} /></Router>;
    }
    const container = document.createElement("div");
    render(<App />, container);
    container.querySelector("a")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.errors[0]?.error).toEqual(new Error("link failed"));
  });
});
