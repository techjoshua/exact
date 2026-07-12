import type {
  ExactContextEffect,
  ExactInvocationRequest,
  ExactInvocationResult,
  ExactPatch,
  ExactServerManifest,
  ExactStateContract
} from "./types.js";
import { hasOnlyKeys, isJsonSafe } from "./protocol.js";

/** Returns whether an invocation references an action or boundary allowed by the manifest. */
export function isManifestAllowed(input: ExactInvocationRequest, manifest: ExactServerManifest): boolean {
  if (input.type === "action") return Boolean(manifest.actions?.[input.id]);
  if (input.type === "refresh") return Boolean(manifest.boundaries?.[input.id]);
  return false;
}

/** Returns whether a handler result is JSON-safe and matches the invocation result envelope. */
export function isInvocationResultSafe(result: unknown): result is ExactInvocationResult {
  if (!isJsonSafe(result)) return false;
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["patches", "state", "html"])) return false;
  if ("state" in record && record.state === undefined) return false;
  if (record.patches !== undefined) {
    if (!Array.isArray(record.patches)) return false;
    if (!record.patches.every(isPatchSafe)) return false;
  }
  if (record.html !== undefined && typeof record.html !== "string") return false;
  return true;
}

/** Returns whether submitted boundary snapshots are allowed for the invocation. */
export function boundaryHintsAllowed(input: ExactInvocationRequest, manifest: ExactServerManifest): boolean {
  if (!input.boundaryHtmls) return true;
  if (input.type === "action") {
    const allowed = manifest.actionBoundaries?.[input.id];
    if (allowed) {
      const allowedSet = new Set(allowed);
      return Object.keys(input.boundaryHtmls).every(id => allowedSet.has(id));
    }
  }
  for (const id of Object.keys(input.boundaryHtmls)) {
    if (!manifest.boundaries?.[id]) return false;
  }
  return true;
}

/** Returns whether submitted state satisfies every exact read required by a contract. */
export function stateMatchesContract(state: unknown, contract: ExactStateContract): boolean {
  for (const read of contract.reads ?? []) {
    if (read.kind !== "read" || read.confidence !== "exact") continue;
    if (!hasStatePath(state, read.path)) return false;
  }
  return true;
}

/** Returns whether submitted context tokens match the compiler-provided context contract. */
export function contextMatchesContract(context: Record<string, unknown> | undefined, contract: ExactContextEffect[] | undefined): boolean {
  if (!context) return !requiresExactContext(contract);
  if (!contract?.length) return false;

  const allowed = new Set(contract
    .filter(effect => effect.confidence === "exact")
    .map(effect => effect.token));
  if (!Object.keys(context).every(token => allowed.has(token))) return false;

  for (const effect of contract) {
    if (effect.kind !== "read" || effect.confidence !== "exact") continue;
    if (!Object.prototype.hasOwnProperty.call(context, effect.token)) return false;
  }
  return true;
}

function isPatchSafe(patch: unknown): patch is ExactPatch {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  const record = patch as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.id !== "string" || !record.id) return false;

  switch (record.type) {
    case "text":
      return hasOnlyKeys(record, ["type", "id", "value"]) && typeof record.value === "string";
    case "prop":
      return hasOnlyKeys(record, ["type", "id", "name", "value"])
        && typeof record.name === "string"
        && "value" in record
        && record.value !== undefined;
    case "style":
      return hasOnlyKeys(record, ["type", "id", "name", "value"]) && typeof record.name === "string" && (typeof record.value === "string" || record.value === null);
    case "list":
      return hasOnlyKeys(record, ["type", "id", "op", "key", "before", "html"])
        && typeof record.key === "string"
        && (record.op === "insert" || record.op === "move" || record.op === "remove")
        && (record.before === undefined || typeof record.before === "string")
        && (record.html === undefined || typeof record.html === "string");
    case "state":
      return hasOnlyKeys(record, ["type", "id", "value"]) && "value" in record && record.value !== undefined;
    case "replace":
      return hasOnlyKeys(record, ["type", "id", "html"]) && typeof record.html === "string";
    default:
      return false;
  }
}

function requiresExactContext(contract: ExactContextEffect[] | undefined): boolean {
  return Boolean(contract?.some(effect => effect.kind === "read" && effect.confidence === "exact"));
}

function hasStatePath(value: unknown, path: string): boolean {
  if (path === "*") return value !== undefined;
  let cursor = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(cursor)) {
      if (!isArrayIndex(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
      cursor = cursor[Number(segment)];
      continue;
    }
    if (!cursor || typeof cursor !== "object") return false;
    if (!isSafeObjectKey(segment)) return false;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return true;
}

function isArrayIndex(segment: string): boolean {
  return /^(0|[1-9]\d*)$/.test(segment);
}

function isSafeObjectKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
