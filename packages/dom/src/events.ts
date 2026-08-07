import {
	batch,
	createErrorReport,
	handleComponentError,
	observeComponentAsync,
	runComponentInteraction,
	unwrap,
	type ComponentInstance
} from '@exactjs/core';
import { runWithPriority } from '@exactjs/reactive';
import { preserveFocus } from './focus.js';
import { findOwnerInstance } from './ownership.js';
import { eventHandlers } from './state.js';
import type { Root } from './types.js';

const eventGenerations = new WeakMap<object, number>();

// Delegation is valid only for events whose platform contract bubbles.
const DIRECT_EVENTS = new Set([
	'abort',
	'blur',
	'cancel',
	'canplay',
	'canplaythrough',
	'close',
	'cuechange',
	'durationchange',
	'emptied',
	'ended',
	'error',
	'focus',
	'gotpointercapture',
	'invalid',
	'load',
	'loadeddata',
	'loadedmetadata',
	'loadstart',
	'lostpointercapture',
	'mouseenter',
	'mouseleave',
	'pause',
	'play',
	'playing',
	'pointerenter',
	'pointerleave',
	'progress',
	'ratechange',
	'resize',
	'scroll',
	'seeked',
	'seeking',
	'stalled',
	'suspend',
	'timeupdate',
	'toggle',
	'volumechange',
	'waiting'
]);

/** Returns whether ordinary DOM semantics require a listener on the target element. */
export function requiresDirectListener(type: string): boolean {
	return DIRECT_EVENTS.has(type);
}

/** Ensures a delegated event listener exists for a root/type pair. */
export function ensureDelegated(root: Root, type: string, container: Node = root.container): void {
	let listeners = root.delegated.get(container);
	if (!listeners) {
		listeners = new Map();
		root.delegated.set(container, listeners);
	}
	if (listeners.has(type)) return;

	const listener = (event: Event) => {
		const path = eventPath(event, container);
		for (const cursor of path) {
			const handler = eventHandlers.get(cursor)?.get(type);
			if (handler) {
				const current = cursor;
				preserveFocus(root, () => {
					try {
						const owner = findOwnerInstance(current);
						const result = runWithPriority('interactive', () =>
							batch(() =>
								runEventInteraction(owner, () => callDelegatedHandler(handler, current, event))
							)
						);
						observeComponentAsync(owner, result, 'event', type);
					} catch (error) {
						const owner = findOwnerInstance(current);
						handleComponentError(owner, createErrorReport(error, 'event', owner, type));
					}
				});
			}
			if (event.cancelBubble) break;
			if (cursor === container) break;
		}
	};

	container.addEventListener(type, listener);
	listeners.set(type, listener);
}

/**
 * Runs one direct or delegated DOM callback in the owning component interaction.
 *
 * The caller retains responsibility for the synchronous reactive batch and error observation.
 */
export function runEventInteraction<Result>(
	owner: ComponentInstance<any> | undefined,
	work: () => Result | PromiseLike<Result>
): Result | PromiseLike<Result> {
	if (!owner) return work();
	return runComponentInteraction(
		owner,
		'event',
		nextEventGeneration(owner),
		'interactive',
		new AbortController(),
		() => work()
	);
}

/**
 * Installs one independently owned same-element subscription for a target contribution.
 *
 * Native listener ordering preserves `stopImmediatePropagation()`. Cleanup removes only this
 * owner's subscription, and callback failures are attributed to the contributing component.
 */
export function installOwnedEventSubscription(
	root: Root,
	element: Element,
	key: string,
	source: unknown,
	owner: ComponentInstance<any> | undefined
): () => void {
	const { type, capture } = eventTypeForProp(key);
	const listener: EventListener = (event) =>
		preserveFocus(root, () => {
			const activeOwner = owner ?? findOwnerInstance(element);
			try {
				const handler = unwrap(source);
				if (typeof handler !== 'function') return;
				const result = runWithPriority('interactive', () =>
					batch(() =>
						runEventInteraction(activeOwner, () =>
							callDelegatedHandler(handler as EventListener, element, event)
						)
					)
				);
				observeComponentAsync(activeOwner, result, 'event', type);
			} catch (error) {
				handleComponentError(activeOwner, createErrorReport(error, 'event', activeOwner, type));
			}
		});
	element.addEventListener(type, listener, capture);
	return () => element.removeEventListener(type, listener, capture);
}

/** Converts JSX's DOM-style handler names to platform event names and capture mode. */
export function eventTypeForProp(key: string): { type: string; capture: boolean } {
	// Pointer capture lifecycle events are event names, not capture-phase variants.
	const pointerCaptureLifecycle = key === 'onLostPointerCapture' || key === 'onGotPointerCapture';
	const capture = key.endsWith('Capture') && !pointerCaptureLifecycle;
	const name = key.slice(2, capture ? -7 : undefined);
	const aliases: Record<string, string> = {
		DoubleClick: 'dblclick',
		FocusIn: 'focusin',
		FocusOut: 'focusout'
	};
	return { type: aliases[name] ?? name.toLowerCase(), capture };
}

function nextEventGeneration(owner: object): number {
	const generation = (eventGenerations.get(owner) ?? 0) + 1;
	eventGenerations.set(owner, generation);
	return generation;
}

/** Removes every event listener delegated through a renderer root. */
export function clearDelegated(root: Root): void {
	for (const [container, listeners] of root.delegated) {
		for (const [type, listener] of listeners) container.removeEventListener(type, listener);
	}
	root.delegated.clear();
	root.portalTargets.clear();
}

function eventPath(event: Event, container: Node): Element[] {
	const native = typeof event.composedPath === 'function' ? event.composedPath() : [];
	if (native.length) {
		const path: Element[] = [];
		for (const target of native) {
			if (!(target instanceof Element)) continue;
			if (target !== container && !container.contains(target)) continue;
			path.push(target);
			if (target === container) break;
		}
		return path;
	}
	const path: Element[] = [];
	let cursor = eventTargetElement(event.target);
	while (cursor) {
		path.push(cursor);
		if (cursor === container) break;
		cursor = cursor.parentElement;
	}
	return path;
}

function callDelegatedHandler(handler: EventListener, current: Element, event: Event): unknown {
	const ownDescriptor = Object.getOwnPropertyDescriptor(event, 'currentTarget');
	// Delegation runs one root listener, so expose the matched element as currentTarget
	// during the user handler to preserve ordinary DOM event ergonomics.
	Object.defineProperty(event, 'currentTarget', {
		configurable: true,
		value: current
	});
	try {
		return (handler as (this: Element, event: Event) => unknown).call(current, event);
	} finally {
		if (ownDescriptor) {
			Object.defineProperty(event, 'currentTarget', ownDescriptor);
		} else {
			delete (event as { currentTarget?: EventTarget | null }).currentTarget;
		}
	}
}

function eventTargetElement(target: EventTarget | null): Element | null {
	if (target instanceof Element) return target;
	if (target instanceof Node) return target.parentElement;
	return null;
}
