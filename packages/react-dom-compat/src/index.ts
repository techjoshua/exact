import { batch, flushSync as flushExact } from "@exact/reactive";
import type { Key, ReactNode, ReactPortal } from "@exact/react-compat";
import { useActionState } from "@exact/react-compat";
import { recordReactResourceHint } from "@exact/react-compat/exact";
import { exactComponentForReactInstance, isUnmountedReactClassInstance } from "@exact/react-compat/exact";
import { findComponentDomNode } from "@exact/dom";
import { createRoot as createClientRoot, hydrateRoot as hydrateClientRoot, legacyHydrate, legacyRender, legacyUnmount, type Root, type RootOptions } from "./client.js";

export const version = "19.2.0-exact";

/** Runs a callback and synchronously flushes compatibility updates before returning. */
export function flushSync<T>(callback?: () => T): T | undefined {
  let result: T | undefined;
  try { result = callback?.(); }
  finally { flushExact(); }
  return result;
}

/** Batches reactive notifications produced by a callback. */
export function unstable_batchedUpdates<T>(callback: () => T): T {
  return batch(callback);
}

/** Creates a React-compatible portal targeting an external DOM container. */
export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: Key | null): ReactPortal {
  if (!(container instanceof Node)) throw new TypeError("createPortal target must be a DOM Node");
  return {
    $$typeof: Symbol.for("react.portal"),
    key: key === null || key === undefined ? null : String(key),
    children,
    containerInfo: container,
    implementation: null
  };
}

/** Resolves a mounted compatibility component or DOM value to its host node. */
export function findDOMNode(componentOrElement: unknown): Node | null {
  if (componentOrElement === null || componentOrElement === undefined) return null;
  if (componentOrElement instanceof Node) return componentOrElement;
  const owner = exactComponentForReactInstance(componentOrElement);
  if (!owner && isUnmountedReactClassInstance(componentOrElement)) return null;
  if (!owner) throw new TypeError("findDOMNode expected a mounted React class instance or DOM Node");
  return findComponentDomNode(owner);
}

/** Creates a concurrent React-compatible client root. */
export function createRoot(container: Element | DocumentFragment, options?: RootOptions): Root { return createClientRoot(container, options); }
/** Hydrates a React-compatible tree into existing server markup. */
export function hydrateRoot(container: Element | DocumentFragment, children: ReactNode, options?: RootOptions): Root { return hydrateClientRoot(container, children, options); }
/** Hydrates through the legacy ReactDOM root API. */
export function hydrate(children: ReactNode, container: Element, callback?: () => void): null { return legacyHydrate(children, container, callback); }
/** Renders through the legacy ReactDOM root API. */
export function render(children: ReactNode, container: Element, callback?: () => void): null { return legacyRender(children, container, callback); }
/** Unmounts a legacy root, returning whether one was present. */
export function unmountComponentAtNode(container: Element): boolean { return legacyUnmount(container); }
/** Reports that React's removed subtree rendering API is unsupported. */
export function unstable_renderSubtreeIntoContainer(): never { throw new Error("unstable_renderSubtreeIntoContainer is not supported by eXact React compatibility"); }

/** Emits or records a preconnect resource hint for an origin. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
  const crossOrigin = resourceCrossOrigin(options?.crossOrigin);
  if (recordReactResourceHint(`preconnect:${href}:${crossOrigin}`, 20,
    `<link rel="preconnect" href="${escapeResource(href)}"${crossOrigin === undefined ? "" : ` crossorigin="${escapeResource(crossOrigin)}"`}/>`)) return;
  ensureLink("preconnect", href, options);
}
/** Emits or records a DNS-prefetch resource hint. */
export function prefetchDNS(href: string): void {
  if (recordReactResourceHint(`dns:${href}`, 10, `<link href="${escapeResource(href)}" rel="dns-prefetch"/>`)) return;
  ensureLink("dns-prefetch", href);
}
/** Preinitializes a stylesheet or classic script resource. */
export function preinit(href: string, options: Record<string, unknown> & { as: "style" | "script" }): void {
  if (options.as === "style") {
    const precedence = options.precedence === undefined ? "default" : String(options.precedence);
    const crossOrigin = resourceCrossOrigin(options.crossOrigin);
    const html = `<link rel="stylesheet" href="${escapeResource(href)}" data-precedence="${escapeResource(precedence)}"${crossOrigin === undefined ? "" : ` crossorigin="${escapeResource(crossOrigin)}"`}/>`;
    if (recordReactResourceHint(`style:${href}`, 40, html)) return;
    ensureLink("stylesheet", href, options);
  } else {
    const nonce = options.nonce === undefined ? "" : ` nonce="${escapeResource(String(options.nonce))}"`;
    if (recordReactResourceHint(`script:${href}`, 50, `<script src="${escapeResource(href)}" async=""${nonce}></script>`)) return;
    ensureScript(href, false, options);
  }
}
/** Preinitializes an ECMAScript module resource. */
export function preinitModule(href: string, options?: Record<string, unknown>): void {
  const nonce = options?.nonce === undefined ? "" : ` nonce="${escapeResource(String(options.nonce))}"`;
  if (recordReactResourceHint(`module-script:${href}`, 50, `<script src="${escapeResource(href)}" type="module" async=""${nonce}></script>`)) return;
  ensureScript(href, true, options);
}
/** Emits or records a preload hint for a typed resource. */
export function preload(href: string, options: Record<string, unknown> & { as: string }): void {
  const crossOrigin = resourceCrossOrigin(options.crossOrigin);
  const type = options.type === undefined ? "" : ` type="${escapeResource(String(options.type))}"`;
  const html = `<link rel="preload" href="${escapeResource(href)}" as="${escapeResource(options.as)}"${crossOrigin === undefined ? "" : ` crossorigin="${escapeResource(crossOrigin)}"`}${type}/>`;
  if (recordReactResourceHint(`preload:${options.as}:${href}`, 30, html)) return;
  ensureLink("preload", href, options);
}
/** Emits or records a modulepreload resource hint. */
export function preloadModule(href: string, options?: Record<string, unknown>): void {
  if (recordReactResourceHint(`modulepreload:${href}`, 60, `<link rel="modulepreload" href="${escapeResource(href)}"/>`)) return;
  ensureLink("modulepreload", href, options);
}
/** Restores a form's controls to their authored default values. */
export function requestFormReset(form: HTMLFormElement): void {
  if (!(form instanceof HTMLFormElement)) throw new TypeError("requestFormReset expects an HTMLFormElement");
  form.reset();
}
/** Compatibility alias for React's action-state form hook. */
export function useFormState<State, Payload>(
  action: (previousState: State, payload: Payload) => State | Promise<State>,
  initialState: State,
  permalink?: string
): readonly [State, (payload: Payload) => void, boolean] {
  return useActionState(action, initialState, permalink);
}
/** Returns the status of the nearest compatibility form submission. */
export function useFormStatus(): { pending: boolean; data: FormData | null; method: string | null; action: string | ((formData: FormData) => unknown) | null } {
  return { pending: false, data: null, method: null, action: null };
}

function ensureLink(rel: string, href: string, options?: Record<string, unknown>): void {
  if (typeof document === "undefined" || !href) return;
  const selector = `link[rel="${cssEscape(rel)}"][href="${cssEscape(href)}"]`;
  if (document.head.querySelector(selector)) return;
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  applyResourceOptions(link, options);
  document.head.appendChild(link);
}

function ensureScript(src: string, module: boolean, options?: Record<string, unknown>): void {
  if (typeof document === "undefined" || !src) return;
  const selector = `script[src="${cssEscape(src)}"]${module ? "[type=module]" : ":not([type=module])"}`;
  if (document.head.querySelector(selector)) return;
  const script = document.createElement("script");
  script.src = src;
  if (module) script.type = "module";
  applyResourceOptions(script, options);
  document.head.appendChild(script);
}

function applyResourceOptions(element: HTMLElement, options?: Record<string, unknown>): void {
  if (!options) return;
  const names: Record<string, string> = {
    as: "as", crossOrigin: "crossorigin", fetchPriority: "fetchpriority", imageSizes: "imagesizes",
    imageSrcSet: "imagesrcset", integrity: "integrity", nonce: "nonce", referrerPolicy: "referrerpolicy", type: "type"
  };
  for (const [name, attribute] of Object.entries(names)) {
    const value = options[name];
    if (value !== undefined && value !== null) element.setAttribute(attribute, String(value));
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, character => `\\${character}`);
}

function resourceCrossOrigin(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value === "use-credentials" ? "use-credentials" : "";
}

function escapeResource(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ReactDOM = {
  createPortal,
  createRoot,
  findDOMNode,
  flushSync,
  hydrate,
  hydrateRoot,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  render,
  requestFormReset,
  unmountComponentAtNode,
  unstable_batchedUpdates,
  unstable_renderSubtreeIntoContainer,
  useFormState,
  useFormStatus,
  version
};

export default ReactDOM;
