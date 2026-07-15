/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { Airplay } from "lucide-react-phase1";
import { Children, Suspense, cloneElement, createContext, createElement, forwardRef, lazy, use, useCallback, useContext, useMemo, useReducer, useRef, useState } from "@exact/react-compat";
import { flushSync } from "@exact/reactive";
import { createRoot, hydrateRoot } from "./client.js";
import { createPortal } from "./index.js";

describe("React compatibility root", () => {
  it("hydrates markerless server markup without replacing matching DOM", () => {
    let setCount!: (value: number) => void;
    function Counter() {
      const [count, update] = useState(0);
      setCount = update;
      return createElement("button", { onClick: () => update(value => value + 1) }, String(count));
    }
    const container = document.createElement("div");
    container.innerHTML = "<button>0</button>";
    const serverButton = container.firstElementChild;
    const root = hydrateRoot(container, createElement(Counter, null));
    expect(container.firstElementChild).toBe(serverButton);
    serverButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();
    expect(container.textContent).toBe("1");
    setCount(2);
    flushSync();
    expect(container.textContent).toBe("2");
    root.unmount();
    expect(container.childNodes).toHaveLength(0);
  });

  it("reports recoverable hydration mismatches and mounts the client tree", () => {
    const recoverable = vi.fn();
    const container = document.createElement("div");
    container.innerHTML = "<p>server</p>";
    hydrateRoot(container, createElement("span", null, "client"), { onRecoverableError: recoverable });
    expect(container.innerHTML).toBe("<span>client</span>");
    expect(recoverable).toHaveBeenCalledTimes(1);
  });

  it("renders function components and rerenders shallow custom hooks", () => {
    const renders = vi.fn();
    const useCounter = () => {
      const [count, setCount] = useState(0);
      const doubled = useMemo(() => count * 2, [count]);
      const increment = useCallback(() => setCount(value => value + 1), []);
      return { count, doubled, increment };
    };
    function Counter() {
      renders();
      const counter = useCounter();
      const persistent = useRef({ id: 1 });
      return createElement("button", { onClick: counter.increment, "data-id": persistent.current.id }, `${counter.count}/${counter.doubled}`);
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(createElement(Counter, null));
    expect(container.textContent).toBe("0/0");

    container.querySelector("button")!.click();
    flushSync();
    expect(container.textContent).toBe("1/2");
    expect(renders).toHaveBeenCalledTimes(2);
  });

  it("supports reducer dispatch including React's same-value reducer rerender", () => {
    const renders = vi.fn();
    function Counter() {
      renders();
      const [state, dispatch] = useReducer((value: number, action: "same" | "next") => action === "next" ? value + 1 : value, 0);
      return createElement("div", null,
        createElement("button", { id: "same", onClick: () => dispatch("same") }, "same"),
        createElement("button", { id: "next", onClick: () => dispatch("next") }, String(state))
      );
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(createElement(Counter, null));
    container.querySelector<HTMLElement>("#same")!.click();
    flushSync();
    expect(renders).toHaveBeenCalledTimes(2);
    container.querySelector<HTMLElement>("#next")!.click();
    flushSync();
    expect(container.querySelector("#next")!.textContent).toBe("1");
    expect(renders).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid hook calls and makes stale dispatches inert after unmount", () => {
    expect(() => useState(0)).toThrow(/Invalid hook call/);
    let update!: (value: number) => void;
    function Counter() {
      const [, setValue] = useState(0);
      update = setValue;
      return createElement("span", null, "mounted");
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(createElement(Counter, null));
    root.unmount();
    expect(container.childNodes).toHaveLength(0);
    expect(() => update(1)).not.toThrow();
    expect(() => root.render(createElement(Counter, null))).toThrow(/unmounted/);
  });

  it("preserves React elements through wrapper component children", () => {
    function Wrapper(props: { children?: unknown }) {
      expect(Children.count(props.children as never)).toBe(1);
      return cloneElement(Children.only(props.children as never), { title: "wrapped" });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(createElement(Wrapper, null, createElement("span", { title: "source" }, "child")));
    expect(container.querySelector("span")?.title).toBe("wrapped");
    expect(container.textContent).toBe("child");
  });

  it("renders the forwardRef component shape used by presentational packages", () => {
    const Icon = forwardRef<{ size: number }>((props, ref) => createElement("svg", {
      ref,
      width: props.size,
      height: props.size,
      viewBox: "0 0 24 24"
    }, createElement("path", { d: "M1 1h22v22H1z" })));
    const container = document.createElement("div");
    createRoot(container).render(createElement(Icon, { size: 16 }));
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M1 1h22v22H1z");
  });

  it("renders a published lucide-react component package", () => {
    const container = document.createElement("div");
    createRoot(container).render(createElement(Airplay as never, {
      size: 18,
      color: "rebeccapurple",
      "aria-label": "Airplay"
    }));
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("width")).toBe("18");
    expect(icon?.getAttribute("height")).toBe("18");
    expect(icon?.getAttribute("stroke")).toBe("rebeccapurple");
    expect(icon?.getAttribute("aria-label")).toBe("Airplay");
    expect(icon?.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("renders portals outside the root while preserving React context and ownership", () => {
    const container = document.createElement("div");
    const target = document.createElement("aside");
    const Message = createContext("default");
    function Child() { return createElement("span", null, useContext(Message)); }
    function App() {
      return createElement(Message.Provider, { value: "portal-context" }, createPortal(createElement(Child, null), target));
    }
    const root = createRoot(container);
    root.render(createElement(App, null));
    expect(container.textContent).toBe("");
    expect(target.innerHTML).toBe("<span>portal-context</span>");
    root.unmount();
    expect(target.textContent).toBe("");
  });

  it("retries Suspense children for React.lazy and React.use promises", async () => {
    let resolveModule!: (value: { default: () => ReturnType<typeof createElement> }) => void;
    const modulePromise = new Promise<{ default: () => ReturnType<typeof createElement> }>(resolve => { resolveModule = resolve; });
    const LazyMessage = lazy(() => modulePromise);
    const container = document.createElement("div");
    createRoot(container).render(createElement(Suspense, { fallback: createElement("i", null, "loading") }, createElement(LazyMessage, null)));
    await Promise.resolve();
    flushSync();
    expect(container.textContent).toBe("loading");

    resolveModule({ default: () => createElement("b", null, "ready") });
    await modulePromise;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    flushSync();
    expect(container.textContent).toBe("ready");

    const value = Promise.resolve("used");
    function Reader() { return createElement("strong", null, use(value)); }
    const second = document.createElement("div");
    createRoot(second).render(createElement(Suspense, { fallback: "waiting" }, createElement(Reader, null)));
    flushSync();
    expect(second.textContent).toBe("waiting");
    await value;
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    expect(second.textContent).toBe("used");
  });
});
