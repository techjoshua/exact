import { escapeAttr } from "./html.js";
import type { HydrationScriptOptions } from "./types.js";

export function renderHydrationScript(options: HydrationScriptOptions = {}): string {
  const payloadValue = omitUndefinedProperties({
    endpoint: options.endpoint,
    endpoints: options.endpoints,
    state: options.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries
  });
  if (!isStrictJsonSafe(payloadValue)) {
    throw new Error("Hydration payload must be JSON-serializable");
  }
  const payload = serializeHydrationPayload(payloadValue);
  const id = options.scriptId ?? "__exact_hydration";
  const nonce = options.nonce ? ` nonce="${escapeAttr(options.nonce)}"` : "";
  return `<script type="application/json" id="${escapeAttr(id)}"${nonce}>${payload}</script>`;
}

export function serializeHydrationPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function jsonUnsafePath(value: unknown, path = "$", seen = new Set<object>()): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "boolean") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? undefined : path;
  if (typeof value !== "object") return path;
  if (seen.has(value)) return path;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const unsafe = jsonUnsafePath(value[index], `${path}[${index}]`, seen);
      if (unsafe) return unsafe;
    }
    return undefined;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return path;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const unsafe = jsonUnsafePath(item, `${path}.${key}`, seen);
    if (unsafe) return unsafe;
  }
  return undefined;
}

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

function isStrictJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isStrictJsonSafe(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(item => isStrictJsonSafe(item, seen));
}
