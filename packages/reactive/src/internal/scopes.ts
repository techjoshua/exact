import type { EffectScope, EffectScopeImpl } from "./types.js";

const scopeStack: EffectScopeImpl[] = [];

/** Creates an effect scope that can stop all child scopes and reactions as one unit. */
export function createEffectScope(
  parent: EffectScope | undefined = currentEffectScope(),
  onError?: (error: unknown) => void
): EffectScope {
  const parentScope = parent as EffectScopeImpl | undefined;
  const scope: EffectScopeImpl = {
    active: true,
    parent: parentScope,
    children: new Set(),
    reactions: new Set(),
    onError: onError ?? parentScope?.onError,
    stop() {
      if (!scope.active) return;
      scope.active = false;
      for (const child of [...scope.children]) child.stop();
      for (const reaction of [...scope.reactions]) reaction.stop();
      scope.children.clear();
      scope.reactions.clear();
      scope.parent?.children.delete(scope);
      scope.parent = undefined;
    }
  };
  scope.parent?.children.add(scope);
  return scope;
}

/** Runs a function with the supplied scope as the current reactive ownership scope. */
export function withEffectScope<T>(scope: EffectScope | undefined, fn: () => T): T {
  if (!scope || !scope.active) return fn();
  scopeStack.push(scope as EffectScopeImpl);
  try {
    return fn();
  } finally {
    scopeStack.pop();
  }
}

/** Returns the currently active effect scope, if code is executing inside one. */
export function currentEffectScope(): EffectScopeImpl | undefined {
  return scopeStack[scopeStack.length - 1];
}
