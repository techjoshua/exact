import { createErrorReport, handleComponentError } from "@exact/core";
import { preserveFocus } from "./focus.js";
import { findOwnerInstance } from "./ownership.js";
import { eventHandlers } from "./state.js";
import type { Root } from "./types.js";

/** Ensures a delegated event listener exists for a root/type pair. */
export function ensureDelegated(root: Root, type: string): void {
  if (root.delegated.has(type)) return;

  const listener = (event: Event) => {
    let cursor = eventTargetElement(event.target);
    while (cursor && cursor !== root.container.parentElement) {
      const handler = eventHandlers.get(cursor)?.get(type);
      if (handler) {
        const current = cursor;
        preserveFocus(root, () => {
          try {
            callDelegatedHandler(handler, current, event);
          } catch (error) {
            const owner = findOwnerInstance(current);
            handleComponentError(owner, createErrorReport(error, "event", owner, type));
          }
        });
      }
      if (event.cancelBubble) break;
      if (cursor === root.container) break;
      cursor = cursor.parentElement;
    }
  };

  root.container.addEventListener(type, listener);
  root.delegated.set(type, listener);
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
