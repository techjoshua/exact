import { escapeAttr } from "./html.js";
import type { HydrationScriptOptions } from "./types.js";

/** Renders the JSON script tag consumed by the hydration client. */
export function renderHydrationScript(options: HydrationScriptOptions = {}): string {
  const payloadValue = omitUndefinedProperties({
    endpoint: options.endpoint,
    endpoints: options.endpoints,
    state: options.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries
  });
  if (!isStrictJsonSafe(payloadValue, {
    maxDepth: options.maxHydrationDepth,
    maxNodes: options.maxHydrationNodes
  })) {
    throw new Error("Hydration payload must be JSON-serializable");
  }
  const payload = serializeHydrationPayload(payloadValue);
  if (new TextEncoder().encode(payload).byteLength > positiveLimit(options.maxHydrationBytes, 16 * 1024 * 1024)) {
    throw new Error("Hydration payload exceeded maxHydrationBytes");
  }
  const id = options.scriptId ?? "__exact_hydration";
  const nonce = options.nonce ? ` nonce="${escapeAttr(options.nonce)}"` : "";
  return `<script type="application/json" id="${escapeAttr(id)}"${nonce}>${payload}</script>`;
}

/** Serializes hydration JSON while escaping script-breaking characters. */
export function serializeHydrationPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Returns the first non-JSON-safe path in a value, or undefined when it is safe. */
export function jsonUnsafePath(value: unknown, path = "$", seen = new Set<object>()): string | undefined {
  return findJsonUnsafePath(value, path, seen, false, {});
}

/** Returns whether a value can be safely serialized into hydration JSON. */
export function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  return jsonUnsafePath(value, "$", seen) === undefined;
}

function omitUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item;
  }
  return output;
}

function isStrictJsonSafe(value: unknown, limits: { maxDepth?: number; maxNodes?: number }): boolean {
  return findJsonUnsafePath(value, "$", new Set(), true, limits) === undefined;
}

function findJsonUnsafePath(
  value: unknown,
  path: string,
  seen: Set<object>,
  strict: boolean,
  limits: { maxDepth?: number; maxNodes?: number }
): string | undefined {
  const maxDepth = positiveLimit(limits.maxDepth, 100);
  const maxNodes = positiveLimit(limits.maxNodes, 100_000);
  const pending: Array<{ value: unknown; path: string; depth: number }> = [{ value, path, depth: 0 }];
  let nodes = 0;
  try {
    while (pending.length) {
      const current = pending.pop()!;
      if (++nodes > maxNodes || current.depth > maxDepth) return current.path;
      const item = current.value;
      if (item === null || (!strict && item === undefined)) continue;
      if (typeof item === "string" || typeof item === "boolean") continue;
      if (typeof item === "number") { if (!Number.isFinite(item)) return current.path; continue; }
      if (typeof item !== "object" || seen.has(item)) return current.path;
      seen.add(item);
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) return current.path;
      const keys = Object.keys(item);
      if (nodes + pending.length + keys.length > maxNodes) return current.path;
      for (let index = keys.length - 1; index >= 0; index--) {
        const key = keys[index]!;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !("value" in descriptor)) return `${current.path}${Array.isArray(item) ? `[${key}]` : `.${key}`}`;
        pending.push({
          value: descriptor.value,
          path: `${current.path}${Array.isArray(item) ? `[${key}]` : `.${key}`}`,
          depth: current.depth + 1
        });
      }
    }
    return undefined;
  } catch {
    return path;
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
