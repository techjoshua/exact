import { type Component, type ComponentInstance } from '@exact/core';
import {
	cloneHookSlot,
	runEffectCleanup,
	type EffectKind,
	type HookSlot
} from './runtime/hook-slots.js';
import type { ReactNode } from './types.js';

import { readReactRootRuntime } from './runtime/nodes.js';
import {
	ReactCacheContext,
	ReactSharedInternals18,
	ReactSharedInternals19,
	setCurrentDispatcher,
	type ReactCacheScope,
	type ReactOwnerFrame,
	type ReactRootRuntime
} from './runtime/shared.js';
export {
	adaptReactType,
	exactComponentForReactInstance,
	isUnmountedReactClassInstance
} from './runtime/adapters.js';
export {
	childrenArray,
	contextForSpecial,
	isReactClassType,
	reactTypeName,
	routeClassLifecycleError,
	unsupportedType
} from './runtime/class-support.js';
export { toExactNode } from './runtime/nodes.js';
export { assignReactRef } from './runtime/refs.js';
export * from './runtime/shared.js';

import { createExactDispatcher } from './runtime/dispatcher.js';

const ownerFrames = new WeakMap<ComponentInstance<any>, ReactOwnerFrame>();
let currentOwnerFrame: ReactOwnerFrame | null = null;

export function currentReactOwnerFrame(): ReactOwnerFrame | unknown | null {
	const externalOwner = ReactSharedInternals19.A?.getOwner?.();
	return externalOwner ?? currentOwnerFrame;
}

export function createOwnerFrame(
	component: ComponentInstance<any>,
	type: unknown,
	stateNode: unknown = null
): ReactOwnerFrame {
	let parent = component.parent;
	let parentFrame: ReactOwnerFrame | undefined;
	while (parent && !parentFrame) {
		parentFrame = ownerFrames.get(parent);
		parent = parent.parent;
	}
	const frame: ReactOwnerFrame = {
		type,
		return: parentFrame ?? null,
		child: null,
		sibling: null,
		alternate: null,
		memoizedState: null,
		stateNode
	};
	if (parentFrame) {
		if (!parentFrame.child) parentFrame.child = frame;
		else {
			let sibling = parentFrame.child;
			while (sibling.sibling) sibling = sibling.sibling;
			sibling.sibling = frame;
		}
	}
	ownerFrames.set(component, frame);
	return frame;
}

export function removeOwnerFrame(component: ComponentInstance<any>): void {
	const frame = ownerFrames.get(component);
	if (!frame) return;
	const parent = frame.return;
	if (parent?.child === frame) parent.child = frame.sibling;
	else if (parent) {
		let sibling = parent.child;
		while (sibling?.sibling && sibling.sibling !== frame) sibling = sibling.sibling;
		if (sibling?.sibling === frame) sibling.sibling = frame.sibling;
	}
	frame.return = null;
	frame.child = null;
	frame.sibling = null;
	frame.memoizedState = null;
	frame.stateNode = null;
	ownerFrames.delete(component);
}

/**
 * Installs class-render owner state and returns an idempotent restoration callback.
 *
 * Class adapters use this boundary instead of mutating hook-runtime globals.
 */
export function enterReactOwnerScope(
	component: Component<Record<string, unknown>>,
	ownerFrame: ReactOwnerFrame
): () => void {
	const previousRuntime = currentRootRuntime;
	const previousOwnerFrame = currentOwnerFrame;
	const previousReact18Owner = ReactSharedInternals18.ReactCurrentOwner.current;
	currentOwnerFrame = ownerFrame;
	ReactSharedInternals18.ReactCurrentOwner.current = ownerFrame;
	currentRootRuntime = readReactRootRuntime(component);
	return () => {
		ReactSharedInternals18.ReactCurrentOwner.current = previousReact18Owner;
		currentOwnerFrame = previousOwnerFrame;
		currentRootRuntime = previousRuntime;
	};
}

import { HookState } from './runtime/hook-state.js';

export class HookHost extends HookState {
	render(run: () => ReactNode): ReactNode {
		const profileStarted = this.onProfile ? performance.now() : undefined;
		if (this.disposed) throw new Error('Cannot render an unmounted React compatibility component');
		if (this.rendering) throw new Error('React compatibility component rendered recursively');
		this.rendering = true;
		this.cursor = 0;
		this.working = this.committed.map(cloneHookSlot);
		this.syncOwnerHooks();
		const previous = currentHost;
		const previousRuntime = currentRootRuntime;
		const previousDispatcher = setCurrentDispatcher(createExactDispatcher(this));
		const previousOwnerFrame = currentOwnerFrame;
		const previousReact18Owner = ReactSharedInternals18.ReactCurrentOwner.current;
		currentOwnerFrame = ownerFrames.get(this.component as ComponentInstance<any>) ?? null;
		ReactSharedInternals18.ReactCurrentOwner.current = currentOwnerFrame;
		currentHost = this;
		currentRootRuntime = readReactRootRuntime(this.component);
		try {
			const output = run();
			if (this.expectedHooks !== undefined && this.cursor !== this.expectedHooks) {
				throw new Error(
					`Rendered ${this.cursor} hooks, but the previous render used ${this.expectedHooks}`
				);
			}
			this.expectedHooks = this.cursor;
			this.committed = this.working;
			if (currentOwnerFrame) currentOwnerFrame.memoizedState = ownerHookList(this.committed);
			return output;
		} finally {
			ReactSharedInternals18.ReactCurrentOwner.current = previousReact18Owner;
			currentOwnerFrame = previousOwnerFrame;
			setCurrentDispatcher(previousDispatcher);
			currentHost = previous;
			currentRootRuntime = previousRuntime;
			this.working = undefined;
			this.rendering = false;
			if (profileStarted !== undefined) {
				this.onProfile?.(
					Object.freeze({
						subsystem: 'react-compat',
						phase: 'render',
						elapsedMs: performance.now() - profileStarted,
						counts: Object.freeze({ hooks: this.cursor })
					})
				);
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.mounted = false;
		this.commitScheduled = false;
		this.passiveScheduled = false;
		let firstError: unknown;
		for (const slot of this.committed) {
			try {
				if (slot.kind === 'effect') runEffectCleanup(slot);
				else if (slot.kind === 'external-store') slot.unsubscribe?.();
			} catch (error) {
				firstError ??= error;
			}
		}
		this.committed = [];
		this.working = undefined;
		this.providedContexts.clear();
		if (firstError !== undefined) throw firstError;
	}

	mount(): void {
		if (this.disposed) return;
		this.mounted = true;
		this.commit();
	}

	scheduleCommit(): void {
		if (!this.mounted || this.disposed || this.commitScheduled) return;
		this.commitScheduled = true;
		queueMicrotask(() => {
			this.commitScheduled = false;
			if (!this.disposed && this.mounted) this.commit();
		});
	}

	private commit(): void {
		const profileStarted = this.onProfile ? performance.now() : undefined;
		try {
			this.commitEffects('insertion');
			this.commitExternalStores();
			this.commitEffects('layout');
			if (
				this.committed.some(
					(slot) => slot.kind === 'effect' && slot.effectKind === 'passive' && slot.pending
				)
			)
				this.schedulePassiveEffects();
		} finally {
			if (profileStarted !== undefined) {
				this.onProfile?.(
					Object.freeze({
						subsystem: 'react-compat',
						phase: 'commit',
						elapsedMs: performance.now() - profileStarted,
						counts: Object.freeze({ hooks: this.committed.length })
					})
				);
			}
		}
	}

	private commitEffects(kind: EffectKind): void {
		for (const slot of this.committed) {
			if (slot.kind !== 'effect' || slot.effectKind !== kind || !slot.pending) continue;
			slot.pending = false;
			runEffectCleanup(slot);
			const cleanup = slot.create();
			if (cleanup !== undefined && typeof cleanup !== 'function')
				throw new TypeError(`${kind} effect must return a cleanup function or undefined`);
			slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
		}
	}

	private schedulePassiveEffects(): void {
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		queueMicrotask(() => {
			this.passiveScheduled = false;
			if (!this.disposed && this.mounted) this.commitEffects('passive');
		});
	}

	private commitExternalStores(): void {
		for (const slot of this.committed) {
			if (slot.kind !== 'external-store' || !slot.pendingSubscription) continue;
			slot.pendingSubscription = false;
			slot.unsubscribe?.();
			const notify = () => {
				if (this.disposed) return;
				const next = slot.getSnapshot();
				if (Object.is(next, slot.value)) return;
				slot.value = next;
				this.invalidate();
			};
			slot.unsubscribe = slot.subscribe(notify);
			if (typeof slot.unsubscribe !== 'function')
				throw new TypeError('useSyncExternalStore subscribe must return an unsubscribe function');
			notify();
		}
	}

	protected syncOwnerHooks(): void {
		const frame = ownerFrames.get(this.component as ComponentInstance<any>);
		if (frame && this.working) frame.memoizedState = ownerHookList(this.working);
	}
}

function ownerHookList(slots: readonly HookSlot[]): ReactOwnerFrame['memoizedState'] {
	let first: ReactOwnerFrame['memoizedState'] = null;
	let previous: NonNullable<ReactOwnerFrame['memoizedState']> | undefined;
	for (const slot of slots) {
		const hook = {
			memoizedState: ownerHookValue(slot),
			next: null as ReactOwnerFrame['memoizedState']
		};
		if (!first) first = hook;
		else previous!.next = hook;
		previous = hook;
	}
	return first;
}

function ownerHookValue(slot: HookSlot): unknown {
	if (slot.kind === 'ref') return slot.value;
	if (slot.kind === 'effect') return slot.cleanup ?? slot.create;
	if (slot.kind === 'external-store') return slot.value;
	if (slot.kind === 'effect-event') return slot.callback;
	if (slot.kind === 'memo-cache') return slot.value;
	return slot.value;
}

let currentHost: HookHost | undefined;
let currentRootRuntime: ReactRootRuntime | undefined;
export function activeHookHost(): HookHost {
	if (!currentHost)
		throw new Error(
			'Invalid hook call. Hooks can only be called inside a React compatibility component.'
		);
	return currentHost;
}

export function activeReactCacheScope(): ReactCacheScope | undefined {
	if (!currentHost) return undefined;
	try {
		return currentHost.exactContext(ReactCacheContext);
	} catch {
		return undefined;
	}
}

export function recordReactResourceHint(key: string, priority: number, html: string): boolean {
	const resources = currentRootRuntime?.resources;
	if (!resources) return false;
	if (!resources.has(key)) resources.set(key, { priority, html });
	return true;
}
