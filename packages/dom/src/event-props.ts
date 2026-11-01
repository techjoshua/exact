import { createErrorReport, handleComponentError, observeComponentAsync } from '@exactjs/core';
import { publishBatch } from '@exactjs/reactive/framework/runtime';
import { assertNativeEventHandler } from '@exactjs/core/framework/render-structure';
import {
	authoredEventKey,
	ensureDelegated,
	eventTypeForProp,
	requiresDirectListener,
	runEventInteraction,
	runInteractiveEvent
} from './events.js';
import { findOwnerInstance } from './ownership.js';
import { directEventHandlers, eventHandlers } from './state.js';
import type { Root } from './types.js';

/** Installs or removes one settled handler while retaining its reactive binding owner. */
export function applyEventProp(root: Root, element: Element, key: string, value: unknown): void {
	const closedInteraction = key.startsWith('__exactClosedInteraction:');
	const directInteraction = closedInteraction || key.startsWith('__exactDirectInteraction:');
	const eventKey = authoredEventKey(key);
	assertNativeEventHandler(value);
	const { type, capture } = eventTypeForProp(eventKey);
	if (closedInteraction || capture || requiresDirectListener(type)) {
		setDirectEventHandler(
			root,
			element,
			key,
			type,
			value,
			capture,
			directInteraction,
			closedInteraction
		);
		return;
	}
	let handlers = eventHandlers.get(element);
	if (!handlers) {
		handlers = new Map();
		eventHandlers.set(element, handlers);
	}

	if (typeof value === 'function') {
		const handler = value as EventListener;
		const flags = (directInteraction ? 1 : 0) | (closedInteraction ? 2 : 0);
		const container = eventContainerFor(root, element);
		const current = handlers.get(type);
		if (
			!current ||
			current[0] !== handler ||
			current[1] !== flags ||
			current[2] !== root ||
			current[3] !== container
		)
			handlers.set(type, [handler, flags, root, container]);
		ensureDelegated(root, type, container);
	} else {
		handlers.delete(type);
	}
}

/** Replaces a direct listener while preserving event ownership and error routing. */
export function setDirectEventHandler(
	root: Root,
	element: Element,
	key: string,
	type: string,
	value: unknown,
	capture: boolean,
	directInteraction = false,
	closedInteraction = false
): void {
	const previous = directEventHandlers.get(element)?.get(key);
	if (previous) {
		element.removeEventListener(previous.type, previous.listener, previous.capture);
		const direct = directEventHandlers.get(element);
		direct?.delete(key);
		if (direct && !direct.size) directEventHandlers.delete(element);
	}
	if (typeof value !== 'function') return;
	const handler = value as EventListener;
	const listener: EventListener = (event) => {
		try {
			const owner = findOwnerInstance(element);
			const invoke = () =>
				closedInteraction
					? (handler as (this: Element) => unknown).call(element)
					: (handler as (this: Element, event: Event) => unknown).call(element, event);
			const result = closedInteraction
				? runInteractiveEvent(root, owner, invoke, true)
				: publishBatch(() =>
						runEventInteraction(root, owner, invoke, undefined, directInteraction)
					);
			observeComponentAsync(owner, result, 'event', type);
		} catch (error) {
			const owner = findOwnerInstance(element);
			handleComponentError(owner, createErrorReport(error, 'event', owner, type));
		}
	};
	const entry = { type, listener, capture };
	let direct = directEventHandlers.get(element);
	if (!direct) {
		direct = new Map();
		directEventHandlers.set(element, direct);
	}
	direct.set(key, entry);
	element.addEventListener(type, listener, capture);
}

/** Reactive replacements retain the nearest physical portal container chosen during mounting. */
function eventContainerFor(root: Root, element: Element): Node {
	if (root.eventContainer) return root.eventContainer;
	if (root.container.contains(element)) return root.container;
	let container: Node | undefined;
	for (const target of root.portalTargets)
		if (target.contains(element) && (!container || container.contains(target))) container = target;
	return container ?? root.container;
}
