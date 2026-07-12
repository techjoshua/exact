import { isSafeObjectKey } from "./safety.js";
import type { ExactStateContract } from "./types.js";

type MutableStateContainer = Record<string, unknown> | unknown[];

/** Returns only the client state paths required by an exact server action contract. */
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
    if (Array.isArray(cursor)) {
      if (!isArrayIndex(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
      cursor = cursor[Number(segment)];
      continue;
    }
    if (!cursor || typeof cursor !== "object") return undefined;
    if (!isSafeObjectKey(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  if (path === "*") return;
  const segments = path.split(".");
  if (!segments.every(segment => isSafeObjectKey(segment) || isArrayIndex(segment))) return;
  let cursor: MutableStateContainer = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    const nextSegment = segments[index + 1]!;
    if (Array.isArray(cursor) && !isArrayIndex(segment)) return;

    const next = readContainerValue(cursor, segment);
    if (!isMutableStateContainer(next)) {
      // Numeric path segments create arrays so contracts like projects.1.id preserve
      // the same shape the server validator expects, even if that means sparse JSON.
      const nextContainer: MutableStateContainer = isArrayIndex(nextSegment) ? [] : {};
      writeContainerValue(cursor, segment, nextContainer);
      cursor = nextContainer;
    } else {
      cursor = next;
    }
  }
  const last = segments[segments.length - 1]!;
  if (Array.isArray(cursor) && !isArrayIndex(last)) return;
  writeContainerValue(cursor, last, value);
}

function readContainerValue(container: MutableStateContainer, segment: string): unknown {
  return Array.isArray(container) ? container[Number(segment)] : container[segment];
}

function writeContainerValue(container: MutableStateContainer, segment: string, value: unknown): void {
  if (Array.isArray(container)) {
    container[Number(segment)] = value;
  } else {
    container[segment] = value;
  }
}

function isMutableStateContainer(value: unknown): value is MutableStateContainer {
  return Boolean(value && typeof value === "object");
}

function isArrayIndex(segment: string): boolean {
  return /^(0|[1-9]\d*)$/.test(segment);
}
