import { describeNode, domDebug } from "./debug.js";
import type { Root } from "./types.js";

/** Runs DOM work and restores focus if patching drops focus back to the document body. */
export function preserveFocus<T>(root: Root, work: () => T): T {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const result = work();
  if (
    active
    && active.isConnected
    && document.activeElement === document.body
  ) {
    domDebug(root, "restore focus", {
      active: describeNode(active),
      bodyOwnsFocus: document.activeElement === document.body
    });
    active.focus({ preventScroll: true });
  }
  return result;
}
