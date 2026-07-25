import {
	batch,
	createErrorReport,
	handleComponentError,
	observeComponentAsync
} from '@exactjs/core';
import { runWithPriority } from '@exactjs/reactive';
import { preserveFocus } from './focus.js';
import { findOwnerInstance } from './ownership.js';
import { eventHandlers } from './state.js';
import type { Root } from './types.js';

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
							batch(() => callDelegatedHandler(handler, current, event))
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
