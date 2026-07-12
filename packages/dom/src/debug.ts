import { logFrameworkEvent, type VNode } from "@exact/core";
import type { Root } from "./types.js";

export function domDebug(root: Root, message: string, details?: Record<string, unknown>): void {
  logFrameworkEvent("trace", "dom", "patch", message, details, root.logger);
}

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

export function describeVNodeType(type: VNode["type"]): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name || "anonymous";
  return String(type.description ?? type.toString());
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
