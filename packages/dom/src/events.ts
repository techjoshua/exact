import { batch, createErrorReport, handleComponentError } from "@exact/core";
import { preserveFocus } from "./focus.js";
import { findOwnerInstance } from "./ownership.js";
import { eventHandlers } from "./state.js";
import type { Root } from "./types.js";

/** Ensures a delegated event listener exists for a root/type pair. */
export function ensureDelegated(root: Root, type: string): void {
  if (root.delegated.has(type)) return;

  const listener = (event: Event) => {
    const path = eventPath(event, root.container);
    for (const cursor of path) {
      const handler = eventHandlers.get(cursor)?.get(type);
      if (handler) {
        const current = cursor;
        preserveFocus(root, () => {
          try {
            batch(() => callDelegatedHandler(handler, current, event));
          } catch (error) {
            const owner = findOwnerInstance(current);
            handleComponentError(owner, createErrorReport(error, "event", owner, type));
          }
        });
      }
      if (event.cancelBubble) break;
      if (cursor === root.container) break;
    }
  };

  root.container.addEventListener(type, listener);
  root.delegated.set(type, listener);
}

/** Removes every event listener delegated through a renderer root. */
export function clearDelegated(root: Root): void {
  for (const [type, listener] of root.delegated) {
    root.container.removeEventListener(type, listener);
  }
  root.delegated.clear();
}

function eventPath(event: Event, container: Element): Element[] {
  const native = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (native.length) {
    const path: Element[] = [];
    for (const target of native) {
      if (!(target instanceof Element)) continue;
      if (target !== container && !container.contains(target)) continue;
      path.push(target);
      if (target === container) break;
    }
    return path;
  }
  const path: Element[] = [];
  let cursor = eventTargetElement(event.target);
  while (cursor) {
    path.push(cursor);
    if (cursor === container) break;
    cursor = cursor.parentElement;
  }
  return path;
}

function callDelegatedHandler(handler: EventListener, current: Element, event: Event): void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(event, "currentTarget");
  // Delegation runs one root listener, so expose the matched element as currentTarget
  // during the user handler to preserve ordinary DOM event ergonomics.
  Object.defineProperty(event, "currentTarget", {
    configurable: true,
    value: current
  });
  try {
    handler.call(current, event);
  } finally {
    if (ownDescriptor) {
      Object.defineProperty(event, "currentTarget", ownDescriptor);
    } else {
      delete (event as { currentTarget?: EventTarget | null }).currentTarget;
    }
  }
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}
