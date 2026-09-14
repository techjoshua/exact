import type { ExactProfileSink } from '@exactjs/instrumentation';
import type {
	EffectScope,
	EffectScopeImpl,
	Reaction,
	ReactiveProfileEvent,
	WorkPriority
} from './types.js';
import {
	createScheduledScopePurge,
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

/** Returns the current ownership parent for framework integrations that preserve nested scope identity. */
export function effectScopeParent(scope: EffectScope): EffectScope | undefined {
	return (scope as EffectScopeRecord).parent;
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
	const stopped = createScheduledScopePurge();
	const pending: Array<EffectScopeRecord | undefined> = [root];
	let firstError: unknown;
	let failed = false;

	while (pending.length) {
		const entry = pending.pop();
		// An undefined marker above a scope schedules its exit after its children, without
		// allocating separate entry/exit records for every scope in the subtree.
		const complete = entry === undefined;
		const scope = complete ? pending.pop()! : entry;
		if (!complete) {
			if (!scope.active) continue;
			// Mark first so teardown callbacks cannot create more owned work or
			// recursively stop the same subtree.
			scope.active = false;
			for (const resume of scope.ownedResumeWaiters()) resume();
			scope.releaseResumeWaiters();
			const children = scope.ownedChildren();
			if (children.size) {
				pending.push(scope, undefined);
				const childStart = pending.length;
				for (const child of children) pending.push(child as EffectScopeRecord);
				// Preserve insertion-order teardown using the work stack itself as the snapshot.
				for (let left = childStart, right = pending.length - 1; left < right; left++, right--) {
					const child = pending[left];
					pending[left] = pending[right];
					pending[right] = child;
				}
				continue;
			}
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
		if (stopped) stopped.add(scope);
		else discardScheduledScopeWork(scope);
		scope.parent?.removeChild(scope);
		scope.parent = undefined;
		scope.releaseCollections();
	}

	// Cleanup callbacks may enqueue final work for an already stopped descendant. Purge once
	// after the entire subtree settles, without rescanning unrelated queued work for each scope.
	if (stopped) discardScheduledScopeWork(undefined, stopped);
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

/** Waits for resumption or disposal; aborting an optional signal resolves and releases the waiter. */
export function whenEffectScopeResumed(scope: EffectScope, signal?: AbortSignal): Promise<void> {
	const owned = scope as EffectScopeRecord;
	if (!owned.active || !owned.paused || signal?.aborted) return Promise.resolve();
	return new Promise<void>((resolve) => {
		const waiters = owned.resumeWaiters;
		const finish = () => {
			waiters.delete(finish);
			signal?.removeEventListener('abort', finish);
			resolve();
		};
		waiters.add(finish);
		signal?.addEventListener('abort', finish, { once: true });
	});
}

/**
 * Queues one continuation after resumption or disposal without allocating a wait promise.
 * The returned disposer cancels both parked and already queued work. Framework callers own errors
 * from the continuation, which runs in a microtask rather than during scope lifecycle traversal.
 */
export function scheduleEffectScopeResume(
	scope: EffectScope,
	continuation: () => void
): () => void {
	const owned = scope as EffectScopeRecord;
	const waiters = owned.active && owned.paused ? owned.resumeWaiters : undefined;
	let active = true;
	const resume = () => {
		waiters?.delete(resume);
		queueMicrotask(() => {
			if (!active) return;
			active = false;
			continuation();
		});
	};
	if (waiters) waiters.add(resume);
	else resume();
	return () => {
		active = false;
		waiters?.delete(resume);
	};
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
