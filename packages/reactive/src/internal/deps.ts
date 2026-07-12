import type { Dep, Reaction } from "./types.js";

const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const reactionStack: Reaction[] = [];

/** Records that the active reaction depends on a target/key pair. */
export function track(target: object, key: PropertyKey): void {
  const reaction = reactionStack[reactionStack.length - 1];
  if (!reaction) return;

  const dep = getDep(target, key);
  dep.add(reaction);
  reaction.deps.add(dep);
}

/** Schedules every reaction currently subscribed to a target/key pair. */
export function trigger(target: object, key: PropertyKey): void {
  const dep = getDep(target, key);
  for (const reaction of [...dep]) {
    reaction.schedule();
  }
}

/** Returns the dependency set for a target/key pair, creating it on first use. */
export function getDep(target: object, key: PropertyKey): Dep {
  let targetDeps = deps.get(target);
  if (!targetDeps) {
    targetDeps = new Map();
    deps.set(target, targetDeps);
  }

  let dep = targetDeps.get(key);
  if (!dep) {
    dep = new Set();
    targetDeps.set(key, dep);
  }

  return dep;
}

/** Removes a reaction from all dependency sets it currently belongs to. */
export function cleanupReaction(reaction: Reaction): void {
  for (const dep of reaction.deps) {
    dep.delete(reaction);
  }
  reaction.deps.clear();
}

/** Runs a function while collecting all reactive reads into the supplied reaction. */
export function runTracked(reaction: Reaction, fn: () => void): void {
  cleanupReaction(reaction);
  reactionStack.push(reaction);
  try {
    fn();
  } finally {
    reactionStack.pop();
  }
}

/** Runs a function without linking its reads to the currently active reaction. */
export function peek<T>(fn: () => T): T {
  const previous = reactionStack.pop();
  try {
    return fn();
  } finally {
    if (previous) reactionStack.push(previous);
  }
}
