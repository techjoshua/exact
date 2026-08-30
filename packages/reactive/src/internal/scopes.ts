import type { ExactProfileSink } from '@exactjs/instrumentation';
import type {
	EffectScope,
	EffectScopeImpl,
	Reaction,
	ReactiveProfileEvent,
	WorkPriority
} from './types.js';
import {
	discardScheduledScopeWork,
	isHigherWorkPriority,
	resumeScheduledWork
} from './scheduler.js';

const scopeStack: EffectScopeImpl[] = [];

const emptyScopes: ReadonlySet<EffectScopeImpl> = new Set();
const emptyReactions: ReadonlySet<Reaction> = new Set();
const emptyCleanups: ReadonlySet<() => void> = new Set();
const emptyResumeWaiters: ReadonlySet<() => void> = new Set();

/**
 * Stores reactive ownership with shared lifecycle methods and first-use collections.
 *
 * A scope participates in its parent's child collection immediately, but reactions, cleanups,
 * descendants, and pause waiters do not allocate storage until their corresponding capability is
 * used.
 */
class EffectScopeRecord implements EffectScopeImpl {
	active = true;
	selfPaused = false;
	workPriority?: WorkPriority;
	parent?: EffectScopeRecord;
	readonly onError?: (error: unknown) => void;
	readonly onProfile?: ExactProfileSink<ReactiveProfileEvent>;
	private childrenValue?: Set<EffectScopeImpl>;
	private reactionsValue?: EffectScopeImpl['reactions'];
	private cleanupsValue?: Set<() => void>;
	private resumeWaitersValue?: Set<() => void>;

	constructor(
		parent: EffectScopeRecord | undefined,
		onError: ((error: unknown) => void) | undefined,
		onProfile: ExactProfileSink<ReactiveProfileEvent> | undefined
	) {
		this.parent = parent;
		this.onError = onError ?? parent?.onError;
		this.onProfile = onProfile ?? parent?.onProfile;
		parent?.children.add(this);
	}

	get paused(): boolean {
		return isEffectScopePaused(this);
	}

	get children(): Set<EffectScopeImpl> {
		return (this.childrenValue ??= new Set());
	}

	get reactions(): EffectScopeImpl['reactions'] {
		return (this.reactionsValue ??= new Set());
	}

	get cleanups(): Set<() => void> {
		return (this.cleanupsValue ??= new Set());
	}

	get resumeWaiters(): Set<() => void> {
		return (this.resumeWaitersValue ??= new Set());
	}

	pause(): void {
		this.selfPaused = true;
	}

	resume(): void {
		if (!this.selfPaused) return;
		this.selfPaused = false;
		notifyResumedSubtree(this);
		resumeScheduledWork();
	}

	stop(): void {
		stopEffectScope(this);
	}

	/** Returns descendants without materializing an empty child collection. */
	ownedChildren(): ReadonlySet<EffectScopeImpl> {
		return this.childrenValue ?? emptyScopes;
	}

	/** Returns reactions without materializing an empty reaction collection. */
	ownedReactions(): ReadonlySet<Reaction> {
		return this.reactionsValue ?? emptyReactions;
	}

	/** Returns cleanups without materializing an empty cleanup collection. */
	ownedCleanups(): ReadonlySet<() => void> {
		return this.cleanupsValue ?? emptyCleanups;
	}

	/** Returns pause waiters without materializing an empty waiter collection. */
	ownedResumeWaiters(): ReadonlySet<() => void> {
		return this.resumeWaitersValue ?? emptyResumeWaiters;
	}

	/** Removes a child without allocating storage for a collection that cannot contain it. */
	removeChild(child: EffectScopeImpl): void {
		this.childrenValue?.delete(child);
		if (this.childrenValue?.size === 0) this.childrenValue = undefined;
	}

	/** Removes a reaction and releases its now-empty backing collection. */
	removeReaction(reaction: Reaction): void {
		this.reactionsValue?.delete(reaction);
		if (this.reactionsValue?.size === 0) this.reactionsValue = undefined;
	}

	/** Removes a cleanup and releases its now-empty backing collection. */
	removeCleanup(cleanup: () => void): void {
		this.cleanupsValue?.delete(cleanup);
		if (this.cleanupsValue?.size === 0) this.cleanupsValue = undefined;
	}

	/** Releases every settled pause waiter without retaining an empty set. */
	releaseResumeWaiters(): void {
		this.resumeWaitersValue = undefined;
	}

	/** Releases empty ownership collections after final disposal. */
	releaseCollections(): void {
		this.childrenValue = undefined;
		this.reactionsValue = undefined;
		this.cleanupsValue = undefined;
		this.resumeWaitersValue = undefined;
	}
}

/** Registers one reaction against a live scope using first-use ownership storage. */
export function registerEffectScopeReaction(scope: EffectScopeImpl, reaction: Reaction): void {
	(scope as EffectScopeRecord).reactions.add(reaction);
}

/** Releases one reaction and its empty scope storage after final disposal. */
export function releaseEffectScopeReaction(scope: EffectScopeImpl, reaction: Reaction): void {
	(scope as EffectScopeRecord).removeReaction(reaction);
}

/** Registers one cleanup against a live scope using first-use ownership storage. */
export function registerEffectScopeCleanup(scope: EffectScope, cleanup: () => void): void {
	(scope as EffectScopeRecord).cleanups.add(cleanup);
}

/** Releases one cleanup and its empty scope storage after external disposal. */
export function releaseEffectScopeCleanup(scope: EffectScope, cleanup: () => void): void {
	(scope as EffectScopeRecord).removeCleanup(cleanup);
}

/** Creates an effect scope that can stop all child scopes and reactions as one unit. */
export function createEffectScope(
	parent: EffectScope | undefined = currentEffectScope(),
	onError?: (error: unknown) => void,
	onProfile?: ExactProfileSink<ReactiveProfileEvent>
): EffectScope {
	const parentScope = parent as EffectScopeRecord | undefined;
	if (parentScope && !parentScope.active) {
		throw new Error('Cannot create an effect scope beneath an inactive parent scope');
	}
	return new EffectScopeRecord(parentScope, onError, onProfile);
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
	const child = scope as EffectScopeRecord;
	const nextParent = parent as EffectScopeRecord | undefined;
	if (!child.active) throw new Error('Cannot transfer an inactive effect scope');
	if (nextParent && !nextParent.active)
		throw new Error('Cannot transfer an effect scope beneath an inactive parent scope');
	for (let cursor = nextParent; cursor; cursor = cursor.parent) {
		if (cursor === child) throw new Error('Cannot create an effect scope cycle');
	}
	if (child.parent === nextParent) return;
	child.parent?.removeChild(child);
	child.parent = nextParent;
	nextParent?.children.add(child);
	notifyResumedSubtree(child);
	resumeScheduledWork();
}

function stopEffectScope(root: EffectScopeRecord): void {
	if (!root.active) return;
	const pending: Array<{ readonly scope: EffectScopeRecord; readonly complete: boolean }> = [
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
			for (const resume of scope.ownedResumeWaiters()) resume();
			scope.releaseResumeWaiters();
			pending.push({ scope, complete: true });
			const children = [...scope.ownedChildren()] as EffectScopeRecord[];
			for (let index = children.length - 1; index >= 0; index--) {
				pending.push({ scope: children[index]!, complete: false });
			}
			continue;
		}

		for (const reaction of [...scope.ownedReactions()]) {
			try {
				reaction.stop();
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
		for (const cleanup of [...scope.ownedCleanups()]) {
			try {
				cleanup();
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
		// Cleanup callbacks may synchronously enqueue final work. Purge ownership only after every
		// callback has run so an inactive paused scope cannot become globally retained again.
		discardScheduledScopeWork(scope);
		scope.parent?.removeChild(scope);
		scope.parent = undefined;
		scope.releaseCollections();
	}

	resumeScheduledWork();
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

/** Waits until a live effect scope is no longer paused, resolving on final disposal as well. */
export function whenEffectScopeResumed(scope: EffectScope): Promise<void> {
	const owned = scope as EffectScopeRecord;
	if (!owned.active || !owned.paused) return Promise.resolve();
	return new Promise<void>((resolve) => owned.resumeWaiters.add(resolve));
}

/**
 * Constrains work owned by a scope and its descendants to a scheduling priority.
 *
 * Clearing the constraint restores ordinary priority inheritance without changing lifecycle state.
 */
export function setEffectScopeWorkPriority(
	scope: EffectScope,
	priority: WorkPriority | undefined
): void {
	(scope as EffectScopeRecord).workPriority = priority;
}

/** Resolves a requested priority through every effective ancestor constraint. */
export function effectScopeWorkPriority(
	scope: EffectScope | undefined,
	requested: WorkPriority
): WorkPriority {
	let resolved = requested;
	for (let cursor = scope as EffectScopeRecord | undefined; cursor; cursor = cursor.parent) {
		if (cursor.workPriority && isHigherWorkPriority(resolved, cursor.workPriority))
			resolved = cursor.workPriority;
	}
	return resolved;
}

function isEffectScopePaused(scope: EffectScopeRecord): boolean {
	for (let cursor: EffectScopeRecord | undefined = scope; cursor; cursor = cursor.parent) {
		if (cursor.selfPaused) return true;
	}
	return false;
}

function notifyResumedSubtree(root: EffectScopeRecord): void {
	const pending = [root];
	while (pending.length) {
		const scope = pending.pop()!;
		if (scope.active && !scope.paused && scope.ownedResumeWaiters().size) {
			for (const resume of scope.ownedResumeWaiters()) resume();
			scope.releaseResumeWaiters();
		}
		for (const child of scope.ownedChildren()) pending.push(child as EffectScopeRecord);
	}
}
