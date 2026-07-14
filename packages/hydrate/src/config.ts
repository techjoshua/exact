import { hasOnlyKeys } from "./validation.js";
import type {
  ClientIslandRegistry,
  ExactEndpointRoutes,
  ExactEndpointTransport,
  ExactHydrationConfig,
  ExactHydrationRegistration,
  HydrateOptions,
  ExactStateContract
} from "./types.js";

/** Reads and validates the serialized hydration configuration embedded in the document. */
export function readExactHydrationConfig(root: ParentNode = document, scriptId = "__exact_hydration"): ExactHydrationConfig {
  const script = Array.from(root.querySelectorAll("script")).find(candidate => candidate.id === scriptId);
  if (!script) return {};
  try {
    const value = JSON.parse(script.textContent ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return {
      endpoint: typeof record.endpoint === "string" ? record.endpoint : undefined,
      endpoints: isEndpointRoutes(record.endpoints) ? record.endpoints : undefined,
      state: record.state,
      stateContracts: isStateContractMap(record.stateContracts) ? record.stateContracts : undefined,
      actionBoundaries: isActionBoundaryMap(record.actionBoundaries) ? record.actionBoundaries : undefined
    };
  } catch {
    return {};
  }
}

/** Combines explicit hydration options with the nearest serialized document config. */
export function resolveHydrateOptions(container: Element, options: HydrateOptions): HydrateOptions {
  const config = readNearestHydrationConfig(container);
  return {
    ...options,
    endpoint: options.endpoint ?? config.endpoint,
    endpoints: mergeEndpointRoutes(config.endpoints, options.endpoints),
    state: options.state === undefined ? config.state : options.state,
    stateContracts: options.stateContracts ?? config.stateContracts,
    actionBoundaries: options.actionBoundaries ?? config.actionBoundaries
  };
}

/** Merges a late-loaded hydration registration into an existing client runtime configuration. */
export function mergeHydrationRegistration(options: HydrateOptions, registration: ExactHydrationRegistration): void {
  if (registration.endpoint !== undefined) {
    if (options.endpoint !== undefined && options.endpoint !== registration.endpoint) {
      throw new Error("Conflicting eXact hydration endpoint registration");
    }
    options.endpoint = registration.endpoint;
  }
  options.endpoints = mergeHydrationEndpointRoutes(options.endpoints, registration.endpoints);
  if (registration.state !== undefined) options.state = registration.state;
  if (registration.stateContracts) {
    options.stateContracts = mergeUniqueRecord(
      options.stateContracts,
      registration.stateContracts,
      "state contract",
      sameJsonValue
    );
  }
  if (registration.actionBoundaries) {
    options.actionBoundaries = mergeUniqueRecord(
      options.actionBoundaries,
      registration.actionBoundaries,
      "action boundary",
      (left, right) => sameStringList(left, right)
    );
  }
  if (registration.islands) mergeClientIslands(options, registration.islands);
  if (registration.transports) {
    options.transports = mergeUniqueRecord(
      options.transports,
      registration.transports,
      "endpoint transport",
      sameEndpointTransport
    );
  }
}

/** Merges client island component registrations while rejecting conflicting names. */
export function mergeClientIslands(options: HydrateOptions, islands: ClientIslandRegistry): void {
  options.islands = mergeUniqueRecord(
    options.islands,
    islands,
    "client island",
    (left, right) => left === right
  );
}

/** Creates a stable cache key for a header object independent of property order. */
export function headersCacheKey(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join("\n");
}

function mergeEndpointRoutes(
  base: ExactEndpointRoutes | undefined,
  override: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
  const actions = {
    ...(base?.actions ?? {}),
    ...(override?.actions ?? {})
  };
  const boundaries = {
    ...(base?.boundaries ?? {}),
    ...(override?.boundaries ?? {})
  };
  return Object.keys(actions).length || Object.keys(boundaries).length
    ? {
      ...(Object.keys(actions).length ? { actions } : {}),
      ...(Object.keys(boundaries).length ? { boundaries } : {})
    }
    : undefined;
}

/** Clones endpoint routing maps so runtime mutation does not alter serialized config objects. */
export function cloneEndpointRoutes(routes: ExactEndpointRoutes | undefined): ExactEndpointRoutes | undefined {
  return mergeEndpointRoutes(undefined, routes);
}

function mergeHydrationEndpointRoutes(
  base: ExactEndpointRoutes | undefined,
  registration: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
  if (!registration) return cloneEndpointRoutes(base);
  return mergeEndpointRoutes(base, {
    actions: mergeUniqueRecord(base?.actions, registration.actions, "action endpoint route", (left, right) => left === right),
    boundaries: mergeUniqueRecord(base?.boundaries, registration.boundaries, "boundary endpoint route", (left, right) => left === right)
  });
}

function mergeUniqueRecord<T>(
  base: Record<string, T> | undefined,
  next: Record<string, T> | undefined,
  label: string,
  same: (left: T, right: T) => boolean
): Record<string, T> | undefined {
  if (!base && !next) return undefined;
  const output: Record<string, T> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(next ?? {})) {
    // Duplicate registrations are accepted only when they are byte-for-byte equivalent;
    // this lets independently loaded bundles share manifests without masking conflicts.
    if (Object.prototype.hasOwnProperty.call(output, key) && !same(output[key]!, value)) {
      throw new Error(`Conflicting eXact hydration ${label} registration: ${key}`);
    }
    output[key] = value;
  }
  return output;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => right[index] === value);
}

function sameEndpointTransport(left: ExactEndpointTransport, right: ExactEndpointTransport): boolean {
  return left.fetch === right.fetch && sameHeaderMap(left.headers, right.headers);
}

function sameHeaderMap(left: Record<string, string> | undefined, right: Record<string, string> | undefined): boolean {
  return headersCacheKey(left) === headersCacheKey(right);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  type Comparison = { kind: "compare" | "complete"; left: unknown; right: unknown };
  const pending: Comparison[] = [{ kind: "compare", left, right }];
  const activeLeft = new WeakSet<object>();
  const activeRight = new WeakSet<object>();
  const completedLeft = new WeakMap<object, object>();
  const completedRight = new WeakMap<object, object>();
  let compared = 0;

  while (pending.length) {
    if (++compared > 100_000) return false;
    const comparison = pending.pop()!;
    const currentLeft = comparison.left;
    const currentRight = comparison.right;
    if (comparison.kind === "complete") {
      activeLeft.delete(currentLeft as object);
      activeRight.delete(currentRight as object);
      completedLeft.set(currentLeft as object, currentRight as object);
      completedRight.set(currentRight as object, currentLeft as object);
      continue;
    }
    if (Object.is(currentLeft, currentRight)) continue;
    if (!currentLeft || !currentRight || typeof currentLeft !== "object" || typeof currentRight !== "object") {
      return false;
    }
    if (Array.isArray(currentLeft) !== Array.isArray(currentRight)) return false;
    if (!Array.isArray(currentLeft)) {
      const leftPrototype = Object.getPrototypeOf(currentLeft);
      const rightPrototype = Object.getPrototypeOf(currentRight);
      if ((leftPrototype !== Object.prototype && leftPrototype !== null)
        || (rightPrototype !== Object.prototype && rightPrototype !== null)) return false;
    }

    // Registration manifests are JSON data. Cycles are invalid, including
    // isomorphic cycles, and must fail closed instead of throwing while merging.
    if (completedLeft.get(currentLeft) === currentRight && completedRight.get(currentRight) === currentLeft) continue;
    if (activeLeft.has(currentLeft) || activeRight.has(currentRight)) return false;
    activeLeft.add(currentLeft);
    activeRight.add(currentRight);
    pending.push({ kind: "complete", left: currentLeft, right: currentRight });

    if (Array.isArray(currentLeft)) {
      const rightArray = currentRight as unknown[];
      if (currentLeft.length !== rightArray.length) return false;
      for (let index = currentLeft.length - 1; index >= 0; index--) {
        pending.push({ kind: "compare", left: currentLeft[index], right: rightArray[index] });
      }
      continue;
    }

    const leftDescriptors = Object.getOwnPropertyDescriptors(currentLeft);
    const rightDescriptors = Object.getOwnPropertyDescriptors(currentRight);
    const leftKeys = Object.keys(leftDescriptors).filter(key => leftDescriptors[key]!.enumerable).sort();
    const rightKeys = Object.keys(rightDescriptors).filter(key => rightDescriptors[key]!.enumerable).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    for (let index = leftKeys.length - 1; index >= 0; index--) {
      const key = leftKeys[index]!;
      const leftDescriptor = leftDescriptors[key]!;
      const rightDescriptor = rightDescriptors[key]!;
      if (!("value" in leftDescriptor) || !("value" in rightDescriptor)) return false;
      pending.push({ kind: "compare", left: leftDescriptor.value, right: rightDescriptor.value });
    }
  }
  return true;
}

function readNearestHydrationConfig(container: Element): ExactHydrationConfig {
  for (let cursor: Element | null = container; cursor; cursor = cursor.parentElement) {
    const config = readExactHydrationConfig(cursor);
    if (Object.keys(config).length) return config;
  }
  const root = container.getRootNode();
  if (root instanceof ShadowRoot) return readExactHydrationConfig(root);
  return readExactHydrationConfig(container.ownerDocument ?? document);
}

function isStateContractMap(value: unknown): value is Record<string, ExactStateContract> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isStateContract);
}

function isStateContract(value: unknown): value is ExactStateContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.reads === undefined || isStatePathList(record.reads))
    && (record.writes === undefined || isStatePathList(record.writes));
}

function isStatePathList(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return typeof record.path === "string"
      && (record.kind === "read" || record.kind === "write")
      && (record.confidence === "exact" || record.confidence === "broad" || record.confidence === "unknown");
  });
}

function isActionBoundaryMap(value: unknown): value is Record<string, readonly string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(boundaries => {
    return Array.isArray(boundaries) && boundaries.every(boundary => typeof boundary === "string" && boundary.length > 0);
  });
}

function isEndpointRoutes(value: unknown): value is ExactEndpointRoutes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["actions", "boundaries"])) return false;
  return (record.actions === undefined || isEndpointMap(record.actions))
    && (record.boundaries === undefined || isEndpointMap(record.boundaries));
}

function isEndpointMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([id, endpoint]) => {
    return id.length > 0 && typeof endpoint === "string" && endpoint.length > 0;
  });
}
