import type { Reaction } from "./types.js";

const queuedReactions = new Set<Reaction>();
const queuedComputations = new Set<() => void>();
let flushScheduled = false;

export function queueReaction(reaction: Reaction): void {
  queuedReactions.add(reaction);
  scheduleFlush();
}

export function queueComputation(computation: () => void): void {
  queuedComputations.add(computation);
  scheduleFlush();
}

export function removeQueuedComputation(computation: () => void): void {
  queuedComputations.delete(computation);
}

export function flushSync(): void {
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
