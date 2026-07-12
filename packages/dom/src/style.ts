import { computed, unwrap, type ReactiveValue } from "@exact/reactive";

export type CssValue = string | number | ReactiveValue<string>;

type CssInput = unknown;

export const px = unit("px");
export const rem = unit("rem");
export const em = unit("em");
export const percent = unit("%");
export const vh = unit("vh");
export const vw = unit("vw");
export const vmin = unit("vmin");
export const vmax = unit("vmax");
export const fr = unit("fr");
export const ms = unit("ms");
export const s = unit("s");
export const deg = unit("deg");
export const rad = unit("rad");
export const turn = unit("turn");

/** Creates a reactive CSS unit helper such as px(2) or rem(count). */
export function unit(suffix: string): (value: CssInput) => ReactiveValue<string> {
  return (value: CssInput) => computed(() => `${unwrap(value) ?? ""}${suffix}`);
}

/** Normalizes string, array, object, and reactive class values into a class attribute string. */
export function normalizeClass(value: unknown): string {
  const actual = unwrap(value);
  if (actual === false || actual === null || actual === undefined) return "";
  if (typeof actual === "string") return actual;
  if (Array.isArray(actual)) {
    return actual.map(item => normalizeClass(item)).filter(Boolean).join(" ");
  }
  if (typeof actual === "object") {
    return Object.entries(actual).filter(([, enabled]) => Boolean(unwrap(enabled))).map(([name]) => name).join(" ");
  }
  return String(actual);
}

/** Converts a camelCase style property name to its CSS property spelling. */
export function toCssProperty(name: string): string {
  return name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}
