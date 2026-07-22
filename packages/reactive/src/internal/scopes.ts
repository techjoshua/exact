import type { ExactProfileSink } from '@exact/instrumentation';
import type { EffectScope, EffectScopeImpl, ReactiveProfileEvent } from './types.js';

const scopeStack: EffectScopeImpl[] = [];

/** Creates an effect scope that can stop all child scopes and reactions as one unit. */
export function createEffectScope(
	parent: EffectScope | undefined = currentEffectScope(),
	onError?: (error: unknown) => void,
	onProfile?: ExactProfileSink<ReactiveProfileEvent>
): EffectScope {
	const parentScope = parent as EffectScopeImpl | undefined;
	if (parentScope && !parentScope.active) {
		throw new Error('Cannot create an effect scope beneath an inactive parent scope');
	}
	const scope: EffectScopeImpl = {
		active: true,
		parent: parentScope,
		children: new Set(),
		reactions: new Set(),
		cleanups: new Set(),
		onError: onError ?? parentScope?.onError,
		onProfile: onProfile ?? parentScope?.onProfile,
		stop() {
			stopEffectScope(scope);
		}
	};
	scope.parent?.children.add(scope);
	return scope;
}

/** Creates an effect scope whose owned scheduler work emits profiling events. */
export function createProfiledEffectScope(
	onProfile: ExactProfileSink<ReactiveProfileEvent>,
	parent: EffectScope | undefined = currentEffectScope(),
	onError?: (error: unknown) => void
): EffectScope {
	return createEffectScope(parent, onError, onProfile);
}

/** Transfers a live scope beneath another live scope without stopping owned work. */
export function transferEffectScope(scope: EffectScope, parent?: EffectScope): void {
	const child = scope as EffectScopeImpl;
	const nextParent = parent as EffectScopeImpl | undefined;
	if (!child.active) throw new Error('Cannot transfer an inactive effect scope');
	if (nextParent && !nextParent.active)
		throw new Error('Cannot transfer an effect scope beneath an inactive parent scope');
	for (let cursor = nextParent; cursor; cursor = cursor.parent) {
		if (cursor === child) throw new Error('Cannot create an effect scope cycle');
	}
	if (child.parent === nextParent) return;
	child.parent?.children.delete(child);
	child.parent = nextParent;
	nextParent?.children.add(child);
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
			try {
				reaction.stop();
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
		for (const cleanup of [...scope.cleanups]) {
			try {
				cleanup();
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
		scope.children.clear();
		scope.reactions.clear();
		scope.cleanups.clear();
		scope.parent?.children.delete(scope);
		scope.parent = undefined;
	}

	if (failed) throw firstError;
}

/** Runs a function with the supplied scope as the current reactive ownership scope. */
export function withEffectScope<T>(scope: EffectScope | undefined, fn: () => T): T {
	if (!scope) return fn();
	if (!scope.active) throw new Error('Cannot create reactive work inside an inactive effect scope');
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
