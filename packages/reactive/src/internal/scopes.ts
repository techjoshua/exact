import type { EffectScope, EffectScopeImpl } from "./types.js";

const scopeStack: EffectScopeImpl[] = [];

/** Creates an effect scope that can stop all child scopes and reactions as one unit. */
export function createEffectScope(
  parent: EffectScope | undefined = currentEffectScope(),
  onError?: (error: unknown) => void
): EffectScope {
  const parentScope = parent as EffectScopeImpl | undefined;
  if (parentScope && !parentScope.active) {
    throw new Error("Cannot create an effect scope beneath an inactive parent scope");
  }
  const scope: EffectScopeImpl = {
    active: true,
    parent: parentScope,
    children: new Set(),
    reactions: new Set(),
    onError: onError ?? parentScope?.onError,
    stop() {
      stopEffectScope(scope);
    }
  };
  scope.parent?.children.add(scope);
  return scope;
}

function stopEffectScope(root: EffectScopeImpl): void {
  if (!root.active) return;
  const pending: Array<{ readonly scope: EffectScopeImpl; readonly complete: boolean }> = [
    { scope: root, complete: false }
  ];
  let firstError: unknown;
  let failed = false;

  while (pending.length) {
    const { scope, complete } = pending.pop()!;
    if (!complete) {
      if (!scope.active) continue;
      // Mark first so teardown callbacks cannot create more owned work or
      // recursively stop the same subtree.
      scope.active = false;
      pending.push({ scope, complete: true });
      const children = [...scope.children];
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push({ scope: children[index]!, complete: false });
      }
      continue;
    }

    for (const reaction of [...scope.reactions]) {
      try { reaction.stop(); }
      catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    scope.children.clear();
    scope.reactions.clear();
    scope.parent?.children.delete(scope);
    scope.parent = undefined;
  }

  if (failed) throw firstError;
}

/** Runs a function with the supplied scope as the current reactive ownership scope. */
export function withEffectScope<T>(scope: EffectScope | undefined, fn: () => T): T {
  if (!scope) return fn();
  if (!scope.active) throw new Error("Cannot create reactive work inside an inactive effect scope");
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
