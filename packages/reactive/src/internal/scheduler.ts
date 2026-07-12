import type { Reaction } from "./types.js";

const queuedReactions = new Set<Reaction>();
const queuedComputations = new Set<() => void>();
let flushScheduled = false;

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
  while (queuedComputations.size || queuedReactions.size) {
    while (queuedComputations.size) {
      const computations = [...queuedComputations];
      queuedComputations.clear();
      for (const computation of computations) {
        computation();
      }
    }

    const reactions = [...queuedReactions];
    queuedReactions.clear();
    flushScheduled = false;

    for (const reaction of reactions) {
      if (reaction.active && (!reaction.scope || reaction.scope.active)) reaction.run();
    }
  }

  flushScheduled = false;
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushSync);
}
