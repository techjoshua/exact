import { unwrap } from "@exact/reactive";
import { escapeAttr, escapeAttrName } from "./html.js";
import type { SsrContext } from "./types.js";

/** Renders vnode props into escaped HTML attributes, skipping event and framework-only props. */
export function renderAttrs(props: Record<string, unknown>): string {
  let attrs = "";
  for (const [name, rawValue] of Object.entries(props)) {
    if (name === "children" || name === "key" || name === "ref" || /^on[A-Z]/.test(name)) continue;
    const value = unwrap(rawValue);
    if (value === false || value === null || value === undefined) continue;
    const attrName = name === "className" ? "class" : name;
    if (attrName === "style") {
      const style = renderStyle(value);
      if (style) attrs += ` style="${escapeAttr(style)}"`;
      continue;
    }
    if (value === true) {
      attrs += ` ${escapeAttrName(attrName)}`;
      continue;
    }
    attrs += ` ${escapeAttrName(attrName)}="${escapeAttr(String(value))}"`;
  }
  return attrs;
}

/** Renders content inside a generated exact marker pair. */
export function withMarker(context: SsrContext, kind: string, key: string | undefined, render: () => string): string {
  return markerPair(context, markerId(context, kind, undefined, key), render);
}

/** Renders a stable exact marker pair around sync or async HTML content. */
export function markerPair(context: SsrContext, id: string, render: () => string): string;
export function markerPair(context: SsrContext, id: string, render: () => Promise<string>): Promise<string>;
export function markerPair(context: SsrContext, id: string, render: () => string | Promise<string>): string | Promise<string> {
  if (!context.markers) return render();
  const rendered = render();
  if (rendered instanceof Promise) {
    return rendered.then(html => `<!--exact:${id}-->${html}<!--/exact:${id}-->`);
  }
  return `<!--exact:${id}-->${rendered}<!--/exact:${id}-->`;
}

/** Allocates a marker id from render context, kind, optional name, and optional key. */
export function markerId(context: SsrContext, kind: string, name?: string, key?: string): string {
  const id = `${kind}:${context.nextId++}${name ? `:${name}` : ""}${key ? `:${key}` : ""}`;
  return id.replace(/--/g, "");
}

/** Normalizes a compiler-provided exact marker id by removing a leading exact prefix. */
export function exactMarkerId(id: string): string {
  return id.startsWith("exact:") ? id.slice("exact:".length) : id;
}

/** Creates the marker id used for one keyed list item. */
export function keyedItemMarkerId(key: string): string {
  return `item:${key}`.replace(/--/g, "");
}

function renderStyle(value: unknown): string {
  const actual = unwrap(value);
  if (!actual || actual === false) return "";
  if (typeof actual === "string") return actual;
  if (typeof actual !== "object") return "";
  const chunks: string[] = [];
  for (const [name, raw] of Object.entries(actual)) {
    const styleValue = unwrap(raw);
    if (styleValue === null || styleValue === undefined || styleValue === false) continue;
    chunks.push(`${toCssProperty(name)}: ${String(styleValue)};`);
  }
  return chunks.join(" ");
}

function toCssProperty(name: string): string {
  return name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}
