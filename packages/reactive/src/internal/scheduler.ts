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
  try {
    while (queuedComputations.size || queuedReactions.size) {
      if (++passes > maxFlushPasses) {
        queuedComputations.clear();
        queuedReactions.clear();
        throw new Error("eXact reactive scheduler exceeded its flush limit; a reaction is repeatedly invalidating itself");
      }
      while (queuedComputations.size) {
        const computations = [...queuedComputations];
        queuedComputations.clear();
        for (const computation of computations) {
          try {
            computation();
          } catch (error) {
            firstError ??= error;
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
          firstError ??= error;
        }
      }
    }
  } finally {
    flushScheduled = false;
  }
  if (firstError !== undefined) throw firstError;
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushSync);
}
