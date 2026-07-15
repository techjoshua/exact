import { PassThrough } from "node:stream";

/** Collects stable React DOM server and hydration observations for Phase 5. */
export async function collectReactPhase5Trace({ React, ReactDOMClient, ReactDOMServer, JSDOM, baseline }) {
  const markupTree = React.createElement("label", {
    htmlFor: "field",
    tabIndex: 0,
    disabled: true,
    spellCheck: false,
    style: { backgroundColor: "red", lineHeight: 2, marginTop: 4 }
  }, "first", "second");
  const serverString = ReactDOMServer.renderToString(markupTree);
  const staticMarkup = ReactDOMServer.renderToStaticMarkup(markupTree);
  const pipeable = await pipeableText(ReactDOMServer, React.createElement("main", null, "streamed"));

  const dom = new JSDOM('<!doctype html><div id="root"><button>0</button></div>', { url: "https://exact.invalid/" });
  const previousGlobals = installDomGlobals(dom.window);
  const originalError = console.error;
  console.error = () => {};
  let renders = 0;
  function Counter() {
    const [count, setCount] = React.useState(0);
    renders++;
    return React.createElement("button", { onClick: () => setCount(value => value + 1) }, String(count));
  }
  const container = dom.window.document.getElementById("root");
  const serverButton = container.firstElementChild;
  let root;
  try {
    await React.act(async () => { root = ReactDOMClient.hydrateRoot(container, React.createElement(Counter)); });
    const adopted = container.firstElementChild === serverButton;
    await React.act(async () => { serverButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    const updated = container.innerHTML;
    await React.act(async () => { root.unmount(); });
    return { baseline, serverString, staticMarkup, pipeable, hydration: { adopted, updated, renders, unmounted: container.innerHTML } };
  } finally {
    console.error = originalError;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
}

async function pipeableText(server, tree) {
  const destination = new PassThrough();
  let html = "";
  destination.setEncoding("utf8");
  destination.on("data", chunk => { html += chunk; });
  const ended = new Promise((resolve, reject) => destination.on("end", resolve).on("error", reject));
  server.renderToPipeableStream(tree).pipe(destination);
  await ended;
  return html;
}

function installDomGlobals(window) {
  const names = [
    "window", "document", "navigator", "Node", "Element", "HTMLElement", "DocumentFragment", "CharacterData", "Comment", "Text",
    "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLFormElement", "HTMLScriptElement",
    "HTMLButtonElement", "Event", "MouseEvent"
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
