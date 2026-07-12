import { logFrameworkEvent, type VNode } from "@exact/core";
import type { Root } from "./types.js";

/** Emits a DOM patch trace event through the root logger. */
export function domDebug(root: Root, message: string, details?: Record<string, unknown>): void {
  logFrameworkEvent("trace", "dom", "patch", message, details, root.logger);
}

/** Produces a compact human-readable description of a DOM node for logs. */
export function describeNode(node: Node | null | undefined): string {
  if (!node) return "none";
  if (node instanceof Element) {
    const id = node.id ? `#${node.id}` : "";
    const className = typeof node.className === "string" && node.className
      ? `.${node.className.split(/\s+/).filter(Boolean).join(".")}`
      : "";
    return `${node.tagName.toLowerCase()}${id}${className}`;
  }
  return node.nodeName;
}

/** Produces a compact human-readable description of a vnode type for logs. */
export function describeVNodeType(type: VNode["type"]): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name || "anonymous";
  return String(type.description ?? type.toString());
}

/** Formats unknown thrown values for error boundary output. */
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
