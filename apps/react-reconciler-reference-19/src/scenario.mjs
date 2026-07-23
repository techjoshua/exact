import React, { Component, Suspense, act, cache, createContext, createElement, createRef, startTransition, useContext, useEffect, useState } from "react";
import createReconciler from "react-reconciler";
import { ConcurrentRoot, DefaultEventPriority } from "react-reconciler/constants.js";

const HostTransitionContext = createContext(null);
const hostContext = {};
let currentPriority = DefaultEventPriority;
const append = (parent, child) => { parent.children = parent.children.filter(value => value !== child); parent.children.push(child); };
const insert = (parent, child, before) => { parent.children = parent.children.filter(value => value !== child); parent.children.splice(parent.children.indexOf(before), 0, child); };
const remove = (parent, child) => { parent.children = parent.children.filter(value => value !== child); };

const reconciler = createReconciler({
  rendererPackageName: "@exactjs/react-reconciler-reference-19",
  rendererVersion: "0.0.0",
  isPrimaryRenderer: false,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getRootHostContext: () => hostContext,
  getChildHostContext: () => hostContext,
  getPublicInstance: instance => instance,
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  preparePortalMount: () => {},
  createInstance: (type, props) => ({ type, props: { ...props, children: undefined }, children: [], hidden: false }),
  appendInitialChild: append,
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  createTextInstance: text => ({ type: "#text", text: String(text), hidden: false }),
  appendChild: append,
  appendChildToContainer: append,
  insertBefore: insert,
  insertInContainerBefore: insert,
  removeChild: remove,
  removeChildFromContainer: remove,
  commitUpdate: (instance, _type, _oldProps, newProps) => { instance.props = { ...newProps, children: undefined }; },
  commitTextUpdate: (instance, _oldText, newText) => { instance.text = String(newText); },
  resetTextContent: instance => { instance.children = []; },
  clearContainer: container => { container.children = []; },
  hideInstance: instance => { instance.hidden = true; },
  unhideInstance: instance => { instance.hidden = false; },
  hideTextInstance: instance => { instance.hidden = true; },
  unhideTextInstance: instance => { instance.hidden = false; },
  detachDeletedInstance: () => {},
  setCurrentUpdatePriority: priority => { currentPriority = priority; },
  getCurrentUpdatePriority: () => currentPriority,
  resolveUpdatePriority: () => DefaultEventPriority,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false,
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null,
  NotPendingTransition: null,
  HostTransitionContext,
  resetFormInstance: () => {},
  bindToConsole: (_method, args) => args,
  supportsTestSelectors: false
});

const Theme = createContext("default");
const effects = [];
let setCount;
let resourceReady = false;
let resolveResource;
let resourcePromise;
let cacheComputations = 0;
const cachedValue = cache(key => ({ key, id: ++cacheComputations }));
const cacheValues = new Map();
function Counter() {
  const [count, update] = useState(0);
  setCount = update;
  const theme = useContext(Theme);
  useEffect(() => { effects.push(`mount:${count}`); return () => effects.push(`cleanup:${count}`); }, [count]);
  return createElement("label", { theme, count }, `${theme}:${count}`);
}
function AsyncValue() {
  if (!resourceReady) throw resourcePromise;
  return createElement("async", { ready: true }, "resolved");
}
function CacheProbe({ rootName }) {
  const first = cachedValue("shared-key");
  const second = cachedValue("shared-key");
  cacheValues.set(rootName, { first, second });
  return createElement("cache", { rootName, id: first.id });
}
class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? createElement("error", { message: this.state.error.message }) : this.props.children; }
}
function Broken({ fail }) { if (fail) throw new Error("renderer failure"); return createElement(Counter); }

const waitForUpdate = (root, element) => new Promise((resolve, reject) => {
  reconciler.updateContainer(element, root, null, resolve);
  setTimeout(() => reject(new Error("renderer update timed out")), 2000).unref?.();
});
const actUpdate = async (root, element) => {
  await act(() => { reconciler.updateContainer(element, root, null, null); });
  await new Promise(resolve => setTimeout(resolve, 0));
};
const serialize = node => node.type === "#text" ? node.text : { type: node.type, props: node.props, children: node.children.map(serialize), hidden: node.hidden };

/** Runs scenario with the supplied execution context. */
export async function runScenario() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resourceReady = false;
  resourcePromise = new Promise(resolve => { resolveResource = () => { resourceReady = true; resolve(); }; });
  cacheComputations = 0;
  cacheValues.clear();
  effects.length = 0;
  const container = { children: [] };
  const portalContainer = { children: [] };
  const secondaryContainer = { children: [] };
  const errors = [];
  const root = reconciler.createContainer(container, ConcurrentRoot, null, false, null, "exact19-", error => errors.push(error), error => errors.push(error), error => errors.push(error), null);
  const secondaryRoot = reconciler.createContainer(secondaryContainer, ConcurrentRoot, null, false, null, "exact19-secondary-", error => errors.push(error), error => errors.push(error), error => errors.push(error), null);
  const hostRef = createRef();
  const view = fail => createElement(Theme.Provider, { value: "dark" },
    createElement(Suspense, { key: "suspense", fallback: createElement("loading") }, createElement(AsyncValue)),
    createElement(Boundary, { key: "boundary" }, createElement(Broken, { fail })),
    createElement("referenced", { key: "ref", ref: hostRef }),
    createElement(CacheProbe, { key: "cache", rootName: "primary" }),
    reconciler.createPortal(createElement("portal", { value: "outside" }), portalContainer, null, "portal-key")
  );
  await actUpdate(root, view(false));
  const suspenseFallback = container.children.some(child => child.type === "loading");
  await act(() => resolveResource());
  await actUpdate(root, view(false));
  if (typeof setCount !== "function") throw new Error(`React 19 initial renderer commit failed: ${errors.map(error => error?.stack ?? error).join(" | ") || JSON.stringify(container.children)}`);
  await act(() => startTransition(() => setCount(value => value + 1)));
  await actUpdate(secondaryRoot, createElement(CacheProbe, { rootName: "secondary" }));
  await actUpdate(root, view(true));
  const mounted = container.children.map(serialize);
  const primaryCache = cacheValues.get("primary");
  const secondaryCache = cacheValues.get("secondary");
  const assertions = {
    suspenseFallback,
    suspenseResolved: mounted.some(child => child.type === "async"),
    ref: hostRef.current?.type === "referenced",
    portal: portalContainer.children.some(child => child.type === "portal"),
    transition: effects.includes("mount:1"),
    multipleRoots: secondaryContainer.children.some(child => child.type === "cache"),
    cacheWithinRoot: primaryCache?.first === primaryCache?.second,
    cacheIsolatedAcrossRoots: primaryCache?.first !== secondaryCache?.first
  };
  await actUpdate(root, null);
  await actUpdate(secondaryRoot, null);
  return { target: 19, reconciler: "0.33.0", mounted, afterUnmount: container.children.length + portalContainer.children.length + secondaryContainer.children.length, effects, assertions, errors: errors.map(error => error.message) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) console.log(JSON.stringify(await runScenario()));
