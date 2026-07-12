import { isSafeObjectKey } from "./safety.js";
import type { ExactStateContract } from "./types.js";

export function stateForContract(state: unknown, contract: ExactStateContract | undefined): unknown {
  if (!contract) return state;
  const reads = contract.reads?.filter(read => read.kind === "read" && read.confidence === "exact") ?? [];
  if (!reads.length) return {};
  const output: Record<string, unknown> = {};
  for (const read of reads) {
    const value = getPath(state, read.path);
    if (value !== undefined) setPath(output, read.path, value);
  }
  return output;
}

function getPath(value: unknown, path: string): unknown {
  if (path === "*") return value;
  let cursor = value;
  for (const segment of path.split(".")) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  if (path === "*") return;
  const segments = path.split(".");
  if (!segments.every(isSafeObjectKey)) return;
  let cursor: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}
