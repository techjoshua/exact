import type { EffectScope, EffectScopeImpl } from "./types.js";

const scopeStack: EffectScopeImpl[] = [];

export function createEffectScope(parent: EffectScope | undefined = currentEffectScope()): EffectScope {
  const scope: EffectScopeImpl = {
    active: true,
    parent: parent as EffectScopeImpl | undefined,
    children: new Set(),
    reactions: new Set(),
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

export function withEffectScope<T>(scope: EffectScope | undefined, fn: () => T): T {
  if (!scope || !scope.active) return fn();
  scopeStack.push(scope as EffectScopeImpl);
  try {
    return fn();
  } finally {
    scopeStack.pop();
  }
}

export function currentEffectScope(): EffectScopeImpl | undefined {
  return scopeStack[scopeStack.length - 1];
}
