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
  return `${kind}:${context.nextId++}${name ? `:${encodeMarkerKey(name)}` : ""}${key ? `:${encodeMarkerKey(key)}` : ""}`;
}

/** Normalizes a compiler-provided exact marker id by removing a leading exact prefix. */
export function exactMarkerId(id: string): string {
  return id.startsWith("exact:") ? id.slice("exact:".length) : id;
}

/** Creates the marker id used for one keyed list item. */
export function keyedItemMarkerId(key: string): string {
  return `item:${encodeMarkerKey(key)}`;
}

/** Encodes arbitrary UTF-8 marker data without lossy HTML-comment sanitizing. */
export function encodeMarkerKey(value: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(value) && !value.includes("--")) return value;
  return `~${Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Decodes marker data emitted by encodeMarkerKey; legacy safe keys pass through. */
export function decodeMarkerKey(value: string): string {
  if (!value.startsWith("~") || !/^(?:[0-9a-f]{2})+$/i.test(value.slice(1))) return value;
  const hex = value.slice(1);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
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
