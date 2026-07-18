// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "@exact/react-compat";
import { createRoot } from "@exact/react-dom-compat/client19";
import {
  Link,
  MemoryRouter,
  Prompt,
  Route,
  Switch,
  useHistory,
  useParams,
  withRouter
} from "./v5.js";
import type { RouteComponentProps } from "./v5.js";

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("React Router v5 facade", () => {
  it("preserves Switch declaration order and route component props", async () => {
    function User() {
      const params = useParams<{ id: string }>();
      return createElement("p", null, `User ${params.id}`);
    }
    const container = document.createElement("div");
    createRoot(container).render(createElement(MemoryRouter, { initialEntries: ["/users/42"] },
      createElement(Switch, null,
        createElement(Route, { path: "/users/:id", component: User }),
        createElement(Route, { path: "/users/42", render: () => createElement("p", null, "Too specific") })
      ),
      createElement(Link, { to: "/about" }, "About")
    ));
    await settle();
    expect(container.textContent).toContain("User 42");
    expect(container.textContent).not.toContain("Too specific");
  });

  it("supports history navigation, render children, and withRouter", async () => {
    let observed = "";
    function Details(props: any) {
      observed = `${props.location.pathname}:${props.match.url}:${props.match.params.id}`;
      return createElement("p", null, `${props.location.pathname}:${props.match.params.id}`);
    }
    const Wrapped = withRouter(Details);
    function Controls() {
      const history = useHistory();
      return createElement("button", { onClick: () => history.push("/items/2") }, "Move");
    }
    const container = document.createElement("div");
    createRoot(container).render(createElement(MemoryRouter, { initialEntries: ["/items/1"] },
      createElement(Route, { path: "/items/:id" },
        (props: RouteComponentProps) => createElement("section", null,
          createElement(Wrapped, {}),
          createElement(Controls, {}),
          props.match ? "matched" : "missed"
        )
      )
    ));
    await settle();
    expect(container.textContent).toContain("/items/1:1");
    container.querySelector("button")!.click();
    await settle();
    expect(observed).toBe("/items/2:/items/2:2");
  });

  it("blocks Prompt navigation when confirmation is declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const container = document.createElement("div");
    createRoot(container).render(createElement(MemoryRouter, { initialEntries: ["/"] },
      createElement(Prompt, { message: "Leave?" }),
      createElement(Link, { to: "/blocked" }, "Move"),
      createElement(Route, { path: "/", exact: true, render: () => "Home" }),
      createElement(Route, { path: "/blocked", render: () => "Blocked" })
    ));
    await settle();
    container.querySelector("a")!.click();
    await settle();
    expect(confirm).toHaveBeenCalledWith("Leave?");
    expect(container.textContent).toContain("Home");
    expect(container.textContent).not.toContain("Blocked");
    confirm.mockRestore();
  });
});
