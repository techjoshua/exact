import type { Reaction } from "./types.js";

const queuedReactions = new Set<Reaction>();
const queuedComputations = new Set<() => void>();
let flushScheduled = false;
const maxFlushPasses = 1_000;

/** Queues a reaction to run during the next scheduler flush. */
export function queueReaction(reaction: Reaction): void {
  queuedReactions.add(reaction);
  scheduleFlush();
}

/** Queues an arbitrary computation to run before reactions during the next flush. */
export function queueComputation(computation: () => void): void {
  queuedComputations.add(computation);
  scheduleFlush();
}

/** Removes a computation that was queued but has already been run synchronously. */
export function removeQueuedComputation(computation: () => void): void {
  queuedComputations.delete(computation);
}

/** Drains all pending computations and reactions until the scheduler reaches a stable state. */
export function flushSync(): void {
  // Computations run before reactions so derived values settle before render/watch effects observe them.
  let passes = 0;
  let firstError: unknown;
  let hasError = false;
  try {
    while (queuedComputations.size || queuedReactions.size) {
      if (++passes > maxFlushPasses) {
        queuedComputations.clear();
        queuedReactions.clear();
        throw new Error("eXact reactive scheduler exceeded its flush limit; a reaction is repeatedly invalidating itself");
      }
      while (queuedComputations.size) {
        if (++passes > maxFlushPasses) {
          queuedComputations.clear();
          queuedReactions.clear();
          throw new Error("eXact reactive scheduler exceeded its flush limit; a computation is repeatedly invalidating itself");
        }
        const computations = [...queuedComputations];
        queuedComputations.clear();
        for (const computation of computations) {
          try {
            computation();
          } catch (error) {
            if (!hasError) firstError = error;
            hasError = true;
          }
        }
      }

      const reactions = [...queuedReactions];
      queuedReactions.clear();

      for (const reaction of reactions) {
        if (!reaction.active || reaction.scope && !reaction.scope.active) continue;
        try {
          reaction.run();
        } catch (error) {
          if (!hasError) firstError = error;
          hasError = true;
        }
      }
    }
  } finally {
    flushScheduled = false;
    // Errors must not leave work queued without a corresponding microtask.
    // Overflow deliberately clears both queues above; ordinary failures may
    // have queued new work while their error was being handled.
    if (queuedComputations.size || queuedReactions.size) scheduleFlush();
  }
  if (hasError) throw firstError;
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushSync);
}
