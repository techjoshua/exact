import { type StopHandle, unwrap, watch } from "@exact/core";
import type { EffectScope } from "@exact/reactive";
import { describeNode, domDebug } from "./debug.js";
import { ensureDelegated } from "./events.js";
import { preserveFocus } from "./focus.js";
import { eventHandlers, propBindings } from "./state.js";
import { normalizeClass, toCssProperty } from "./style.js";
import type { Root } from "./types.js";

/** Applies prop changes to a DOM element, including reactive bindings and delegated events. */
export function updateProps(root: Root, element: Element, previous: Record<string, unknown>, next: Record<string, unknown>, scope: EffectScope): void {
  preserveFocus(root, () => {
    for (const key of Object.keys(previous)) {
      if (!(key in next)) setProp(root, element, key, undefined, previous[key], scope);
    }

    for (const [key, value] of Object.entries(next)) {
      if (!Object.is(previous[key], value)) setProp(root, element, key, value, previous[key], scope);
    }
  });
}

/** Stops reactive prop bindings and removes delegated event handlers for an element. */
export function clearElementProps(element: Element): void {
  for (const stop of propBindings.get(element)?.values() ?? []) {
    stop();
  }
  propBindings.delete(element);
  eventHandlers.delete(element);
}

function setProp(root: Root, element: Element, key: string, value: unknown, previous: unknown, scope: EffectScope): void {
  if (key === "children") return;

  clearPropBinding(element, key);

  if (key === "ref") {
    if (previous && previous !== value) {
      (previous as { fulfill(value: unknown): void }).fulfill(undefined);
    }
    (value as { fulfill(value: unknown): void } | undefined)?.fulfill(element);
    return;
  }

  if (/^on[A-Z]/.test(key)) {
    const type = key.slice(2).toLowerCase();
    let handlers = eventHandlers.get(element);
    if (!handlers) {
      handlers = new Map();
      eventHandlers.set(element, handlers);
    }

    if (typeof value === "function") {
      handlers.set(type, value as EventListener);
      ensureDelegated(root, type);
    } else {
      handlers.delete(type);
    }
    return;
  }

  if (key === "style") {
    if (previous !== value) {
      (element as HTMLElement).removeAttribute("style");
    }
    const stop = bindStyle(element as HTMLElement, value, scope);
    setPropBinding(element, key, stop);
    return;
  }

  clearPropBinding(element, key);
  const stop = watch(() => preserveFocus(root, () => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      clearDomProp(element, key);
      return;
    }

    setDomProp(root, element, key, key === "class" || key === "className" ? normalizeClass(actual) : actual);
  }), undefined, { scope });
  setPropBinding(element, key, stop);
}

function bindStyle(element: HTMLElement, value: unknown, scope: EffectScope): StopHandle {
  let previousNames = new Set<string>();
  let previousCssText: string | undefined;
  const previousValues = new Map<string, string>();
  return watch(() => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      if (element.hasAttribute("style")) {
        element.removeAttribute("style");
      }
      previousNames.clear();
      previousCssText = undefined;
      previousValues.clear();
      return;
    }

    if (typeof actual === "string") {
      if (previousCssText !== actual || element.style.cssText !== actual) {
        element.style.cssText = actual;
      }
      previousNames.clear();
      previousCssText = actual;
      previousValues.clear();
      return;
    }

    if (!actual || typeof actual !== "object") {
      if (element.hasAttribute("style")) {
        element.removeAttribute("style");
      }
      previousNames.clear();
      previousCssText = undefined;
      previousValues.clear();
      return;
    }

    previousCssText = undefined;
    // Track individual property names so removed keys from an object style are
    // cleaned up without wiping unrelated browser-normalized style state.
    const nextNames = new Set<string>();
    for (const [name, rawValue] of Object.entries(actual)) {
      const styleValue = unwrap(rawValue);
      const property = toCssProperty(name);
      nextNames.add(property);
      if (styleValue === null || styleValue === undefined || styleValue === false) {
        if (previousValues.has(property) || element.style.getPropertyValue(property)) {
          element.style.removeProperty(property);
        }
        previousValues.delete(property);
      } else {
        const nextValue = String(styleValue);
        if (previousValues.get(property) !== nextValue || element.style.getPropertyValue(property) !== nextValue) {
          element.style.setProperty(property, nextValue);
        }
        previousValues.set(property, nextValue);
      }
    }

    for (const name of previousNames) {
      if (!nextNames.has(name)) {
        element.style.removeProperty(name);
        previousValues.delete(name);
      }
    }
    previousNames = nextNames;
  }, undefined, { scope });
}

function setDomProp(root: Root, element: Element, key: string, value: unknown): void {
  const property = normalizePropName(key);

  if (property === "defaultValue" && isFocusedTextControl(element)) {
    domDebug(root, "skip focused defaultValue", {
      element: describeNode(element),
      value
    });
    return;
  }

  if (property in element) {
    try {
      const record = element as unknown as Record<string, unknown>;
      if (Object.is(record[property], value)) {
        syncBooleanAttribute(element, property, value);
        return;
      }

      if (property === "value" || property === "defaultValue") {
        domDebug(root, "set form value prop", {
          element: describeNode(element),
          property,
          active: describeNode(document.activeElement),
          value
        });
      }
      record[property] = value;
      syncBooleanAttribute(element, property, value);
      return;
    } catch {
      // Fall through to attribute setting for readonly DOM properties.
    }
  }

  const attributeValue = String(value);
  if (element.getAttribute(property) !== attributeValue) {
    element.setAttribute(property, attributeValue);
  }
}

function syncBooleanAttribute(element: Element, property: string, value: unknown): void {
  if (typeof value !== "boolean") return;
  if (value) {
    if (!element.hasAttribute(property)) element.setAttribute(property, "");
  } else {
    if (element.hasAttribute(property)) element.removeAttribute(property);
  }
}

function clearDomProp(element: Element, key: string): void {
  const property = normalizePropName(key);
  if (property in element) {
    const current = (element as unknown as Record<string, unknown>)[property];
    try {
      if (typeof current === "boolean") {
        (element as unknown as Record<string, unknown>)[property] = false;
      } else if (typeof current === "string") {
        (element as unknown as Record<string, unknown>)[property] = "";
      }
    } catch {
      // Attribute removal below is still the portable fallback.
    }
  }

  element.removeAttribute(property);
}

function normalizePropName(key: string): string {
  return key === "className" ? "class" : key;
}

function isFocusedTextControl(element: Element): boolean {
  return document.activeElement === element
    && (
      element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
    );
}

function clearPropBinding(element: Element, key: string): void {
  const bindings = propBindings.get(element);
  const stop = bindings?.get(key);
  if (!stop) return;
  stop();
  bindings?.delete(key);
}

function setPropBinding(element: Element, key: string, stop: StopHandle): void {
  let bindings = propBindings.get(element);
  if (!bindings) {
    bindings = new Map();
    propBindings.set(element, bindings);
  }
  bindings.set(key, stop);
}
