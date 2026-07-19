/** Mutable collector used to make multi-resource cleanup failure-complete. */
export type CleanupFailure = { failed: boolean; error: unknown };

/** Creates an empty collector for a failure-complete cleanup sequence. */
export function createCleanupFailure(): CleanupFailure {
  return { failed: false, error: undefined };
}

/** Records the first cleanup error while retaining the fact that cleanup failed. */
export function recordCleanupFailure(failure: CleanupFailure, error: unknown): void {
  if (!failure.failed) failure.error = error;
  failure.failed = true;
}

/**
 * Attempts one synchronous cleanup without interrupting subsequent cleanups.
 */
export function attemptCleanup(failure: CleanupFailure, cleanup: () => void): void {
  try {
    cleanup();
  } catch (error) {
    recordCleanupFailure(failure, error);
  }
}

/** Throws the first error recorded by a completed cleanup sequence. */
export function throwCleanupFailure(failure: CleanupFailure): void {
  if (failure.failed) throw failure.error;
}

/**
 * Preserves an active primary failure while retaining cleanup diagnostics.
 *
 * Attaching diagnostic metadata is deliberately best-effort because a frozen
 * or hostile primary value must never replace the error already in flight.
 */
export function attachSuppressedCleanupFailure(primary: unknown, cleanup: unknown): void {
  if (!primary || (typeof primary !== "object" && typeof primary !== "function")) return;
  try {
    const target = primary as { suppressed?: unknown[] };
    const suppressed = Array.isArray(target.suppressed) ? target.suppressed : [];
    suppressed.push(cleanup);
    if (target.suppressed !== suppressed) {
      Object.defineProperty(target, "suppressed", {
        configurable: true,
        value: suppressed
      });
    }
  } catch {
    // Preserving the primary failure takes precedence over diagnostics.
  }
}
