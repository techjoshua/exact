/** Collects observable Phase 3 portal, Suspense, lazy, and transition behavior. */
export async function collectReactPhase3Trace({ React, ReactDOM, ReactDOMClient, JSDOM, baseline }) {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div><aside id=\"portal\"></aside>", { url: "https://exact.invalid/" });
  const previousGlobals = installDomGlobals(dom.window);
  let resolveLazy;
  const lazyModule = new Promise(resolve => { resolveLazy = resolve; });
  const LazyValue = React.lazy(() => lazyModule);
  const Tone = React.createContext("default");

  function App() {
    const [value, setValue] = React.useState("first");
    const [pending, start] = React.useTransition();
    const deferred = React.useDeferredValue(value);
    return React.createElement(Tone.Provider, { value: `portal-${value}` },
      React.createElement("button", { onClick: () => start(() => setValue("second")) }, `${value}/${deferred}/${pending}`),
      ReactDOM.createPortal(React.createElement(PortalValue), dom.window.document.getElementById("portal")),
      React.createElement(React.Suspense, { fallback: React.createElement("i", null, "loading") }, React.createElement(LazyValue))
    );
  }
  function PortalValue() { return React.createElement("span", null, React.useContext(Tone)); }

  const container = dom.window.document.getElementById("root");
  const portal = dom.window.document.getElementById("portal");
  const root = ReactDOMClient.createRoot(container);
  try {
    await React.act(async () => { root.render(React.createElement(App)); });
    const initial = { root: container.textContent, portal: portal.textContent };
    await React.act(async () => { container.querySelector("button").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    const transitioned = { root: container.textContent, portal: portal.textContent };
    await React.act(async () => {
      resolveLazy({ default: () => React.createElement("b", null, "ready") });
      await lazyModule;
      await Promise.resolve();
    });
    const resolved = { root: container.textContent, portal: portal.textContent };
    await React.act(async () => { root.unmount(); });
    return { baseline, initial, transitioned, resolved, unmount: { root: container.innerHTML, portal: portal.innerHTML } };
  } finally {
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
}

function installDomGlobals(window) {
  const names = [
    "window", "document", "navigator", "Node", "Element", "HTMLElement", "HTMLFormElement", "DocumentFragment", "CharacterData",
    "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Event", "MouseEvent"
  ];
  const previous = new Map();
  for (const name of names) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
  }
  previous.set("IS_REACT_ACT_ENVIRONMENT", Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"));
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
  return previous;
}

function restoreDomGlobals(previous) {
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
