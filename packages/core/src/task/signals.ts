/** Event-listener options augmented with framework-owned cancellation. */
export type ManagedEventListenerOptions = EventListenerOptions & {
  once?: boolean;
  passive?: boolean;
  signal?: AbortSignal;
};

/** Returns whether an unknown value implements the AbortSignal contract. */
export function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value
    && typeof value === "object"
    && typeof (value as AbortSignal).addEventListener === "function"
    && typeof (value as AbortSignal).aborted === "boolean";
}

/**
 * Combines two abort signals while preserving the reason from the first abort.
 */
export function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  const nativeAny = (AbortSignal as typeof AbortSignal & {
    any?(signals: AbortSignal[]): AbortSignal;
  }).any;
  if (nativeAny) return nativeAny.call(AbortSignal, [left, right]);

  const controller = new AbortController();
  const abort = (event: Event) => {
    left.removeEventListener("abort", abort);
    right.removeEventListener("abort", abort);
    controller.abort((event.currentTarget as AbortSignal | null)?.reason);
  };
  if (left.aborted) controller.abort(left.reason);
  else if (right.aborted) controller.abort(right.reason);
  else {
    left.addEventListener("abort", abort, { once: true });
    right.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

/** Combines an author signal with the signal that owns a task generation. */
export function combineTaskSignal(owner: AbortSignal, existing?: AbortSignal): AbortSignal {
  if (!existing || existing === owner) return owner;
  return combineAbortSignals(existing, owner);
}

/** Attaches framework ownership without discarding author event options. */
export function withAbortSignal(
  options: boolean | ManagedEventListenerOptions | undefined,
  owner: AbortSignal
): ManagedEventListenerOptions {
  const normalized: ManagedEventListenerOptions = typeof options === "boolean"
    ? { capture: options }
    : options ? { ...options } : {};
  const existing = normalized.signal;
  if (!existing || existing === owner) return { ...normalized, signal: owner };
  return { ...normalized, signal: combineAbortSignals(existing, owner) };
}

/** Adds task cancellation to an arbitrary API options object. */
export function withTaskSignal<T extends object | undefined>(
  options: T,
  owner: AbortSignal
): T & { signal: AbortSignal } {
  const normalized = options ? { ...options } : {};
  const existing = "signal" in normalized && isAbortSignal(normalized.signal)
    ? normalized.signal
    : undefined;
  return {
    ...normalized,
    signal: combineTaskSignal(owner, existing)
  } as T & { signal: AbortSignal };
}

/** Converts an abort reason into the error used to reject task continuations. */
export function createTaskAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? "Task aborted" : String(reason));
  error.name = "AbortError";
  return error;
}
