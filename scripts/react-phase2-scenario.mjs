/** Collects observable Phase 2 context/effect/ref/external-store behavior. */
export async function collectReactPhase2Trace({ React, ReactDOMClient, JSDOM, baseline }) {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "https://exact.invalid/" });
  const previousGlobals = installDomGlobals(dom.window);
  const events = [];
  const Tone = React.createContext("default");
  const domRef = React.createRef();
  const imperativeRef = React.createRef();
  let memoRenders = 0;
  let storeValue = 0;
  const listeners = new Set();
  let unsubscribeCount = 0;
  const subscribe = listener => {
    listeners.add(listener);
    return () => { if (listeners.delete(listener)) unsubscribeCount++; };
  };
  const getSnapshot = () => storeValue;

  const MemoLabel = React.memo(function MemoLabel({ label }) {
    memoRenders++;
    return React.createElement("span", { id: "tone" }, `${label}:${React.useContext(Tone)}`);
  });
  const Control = React.forwardRef(function Control({ label }, ref) {
    React.useImperativeHandle(ref, () => ({ label }), [label]);
    return React.createElement("i", null, label);
  });

  function App() {
    const [count, setCount] = React.useState(0);
    const external = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const firstId = React.useId();
    const secondId = React.useId();
    React.useInsertionEffect(() => { events.push(`insertion:${count}`); return () => events.push(`insertion-cleanup:${count}`); }, [count]);
    React.useLayoutEffect(() => { events.push(`layout:${count}`); return () => events.push(`layout-cleanup:${count}`); }, [count]);
    React.useEffect(() => { events.push(`passive:${count}`); return () => events.push(`passive-cleanup:${count}`); }, [count]);
    return React.createElement(Tone.Provider, { value: `tone-${count}` },
      React.createElement("button", { ref: domRef, onClick: () => setCount(value => value + 1), "data-first": firstId, "data-second": secondId }, `${count}/${external}`),
      React.createElement(MemoLabel, { label: "memo" }),
      React.createElement(Control, { ref: imperativeRef, label: `control-${count}` })
    );
  }

  const container = dom.window.document.getElementById("root");
  const root = ReactDOMClient.createRoot(container);
  try {
    await React.act(async () => { root.render(React.createElement(App)); });
    const button = container.querySelector("button");
    const initial = snapshot(container, button, domRef, imperativeRef, memoRenders);
    await React.act(async () => { root.render(React.createElement(App)); });
    const afterSameRootRender = { memoRenders, events: [...events] };
    await React.act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      storeValue = 1;
      for (const listener of [...listeners]) listener();
    });
    const updatedButton = container.querySelector("button");
    const updated = snapshot(container, updatedButton, domRef, imperativeRef, memoRenders);
    await React.act(async () => { root.unmount(); });
    return {
      baseline,
      initial,
      afterSameRootRender,
      updated,
      events,
      unmount: {
        html: container.innerHTML,
        domRefCleared: domRef.current === null,
        imperativeRefCleared: imperativeRef.current === null,
        unsubscribeCount
      }
    };
  } finally {
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
}

function snapshot(container, button, domRef, imperativeRef, memoRenders) {
  return {
    text: container.textContent,
    idsUnique: button.dataset.first !== button.dataset.second,
    domRefAttached: domRef.current === button,
    imperativeLabel: imperativeRef.current?.label,
    memoRenders
  };
}

function installDomGlobals(window) {
  const names = [
    "window", "document", "navigator", "Node", "Element", "HTMLElement", "DocumentFragment", "CharacterData",
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
