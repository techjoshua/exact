import type { HydrateOptions } from '../types.js';
import { logFrameworkEvent } from '@exactjs/core';

const activationEvents = [
	'click',
	'input',
	'change',
	'submit',
	'keydown',
	'focusin',
	'compositionstart'
] as const;

type InteractionController = {
	activate(boundary: Element, event: Event): boolean;
	dispose(): void;
};

const controllers = new WeakMap<Node, InteractionController>();

/**
 * Installs the small capture-phase broker that activates a dormant island before its event reaches
 * the target or the renderer's delegated bubble listener.
 */
export function ensureInteractionHydration(
	container: Element | Document,
	activate: (boundary: Element, event: Event) => boolean,
	options: HydrateOptions
): void {
	controllers.get(container)?.dispose();
	const listener = (event: Event) => {
		const target = eventTargetElement(event.target);
		const boundary = target?.closest('[data-exact-client-boundary]');
		if (
			!boundary ||
			!container.contains(boundary) ||
			boundary.getAttribute('data-exact-client-hydration') !== 'interaction' ||
			boundary.getAttribute('data-exact-client-hydrated') === 'true'
		)
			return;
		const generation = boundary.getAttribute('data-exact-client-generation');
		const identity = target ? captureTargetIdentity(boundary, target) : undefined;
		let activated = false;
		try {
			activated = activate(boundary, event);
		} catch (error) {
			logFrameworkEvent(
				'error',
				'hydrate',
				'interaction',
				'interaction island activation failed',
				error,
				options.logger
			);
		}
		if (!activated) return;
		if (
			!target ||
			boundary.getAttribute('data-exact-client-generation') !== generation ||
			!container.contains(boundary)
		) {
			cancelOriginalInteraction(event);
			if (!hasDormantIsland(container)) dispose();
			return;
		}
		if (boundary.contains(target)) {
			if (!hasDormantIsland(container)) dispose();
			return;
		}
		cancelOriginalInteraction(event);
		const replacement = identity ? resolveTargetIdentity(boundary, identity) : undefined;
		if (replacement) replayInteraction(event, replacement);
		if (!hasDormantIsland(container)) dispose();
	};
	const dispose = () => {
		for (const type of activationEvents) container.removeEventListener(type, listener, true);
		options.signal?.removeEventListener('abort', dispose);
		controllers.delete(container);
	};
	for (const type of activationEvents) container.addEventListener(type, listener, true);
	options.signal?.addEventListener('abort', dispose, { once: true });
	controllers.set(container, { activate, dispose });
}

/** Removes an interaction broker when its hydration root is explicitly released. */
export function disposeInteractionHydration(container: Element | Document): void {
	controllers.get(container)?.dispose();
}

function eventTargetElement(target: EventTarget | null): Element | undefined {
	if (target instanceof Element) return target;
	if (target instanceof Node) return target.parentElement ?? undefined;
	return undefined;
}

function hasDormantIsland(container: Element | Document): boolean {
	return !!container.querySelector(
		'[data-exact-client-hydration="interaction"]:not([data-exact-client-hydrated="true"])'
	);
}

type TargetIdentity = Readonly<{
	exactId?: string;
	id?: string;
	name?: string;
	signature: string;
	path: readonly number[];
}>;

function captureTargetIdentity(boundary: Element, target: Element): TargetIdentity {
	const path: number[] = [];
	for (
		let cursor: Node | null = target;
		cursor && cursor !== boundary;
		cursor = cursor.parentNode
	) {
		if (!cursor.parentNode) break;
		path.unshift(Array.prototype.indexOf.call(cursor.parentNode.childNodes, cursor));
	}
	return {
		exactId: target.getAttribute('data-exact-id') ?? undefined,
		id: target.id || undefined,
		name: target.getAttribute('name') ?? undefined,
		signature: targetSignature(target),
		path
	};
}

function resolveTargetIdentity(boundary: Element, identity: TargetIdentity): Element | undefined {
	for (const [attribute, value] of [
		['data-exact-id', identity.exactId],
		['id', identity.id],
		['name', identity.name]
	] as const) {
		if (!value) continue;
		const candidates = Array.from(boundary.querySelectorAll(`[${attribute}]`)).filter(
			(candidate) => candidate.getAttribute(attribute) === value
		);
		if (candidates.length === 1 && targetSignature(candidates[0]!) === identity.signature)
			return candidates[0];
	}
	let cursor: Node | undefined = boundary;
	for (const index of identity.path) cursor = cursor?.childNodes[index];
	return cursor instanceof Element && targetSignature(cursor) === identity.signature
		? cursor
		: undefined;
}

function targetSignature(target: Element): string {
	return `${target.namespaceURI ?? ''}|${target.localName}|${
		target instanceof HTMLInputElement ? target.type : ''
	}`;
}

function cancelOriginalInteraction(event: Event): void {
	event.preventDefault();
	event.stopImmediatePropagation();
}

function replayInteraction(event: Event, target: Element): void {
	if (event.type === 'click' && target instanceof HTMLElement) {
		target.click();
		return;
	}
	if (event.type === 'submit') {
		const form =
			target instanceof HTMLFormElement
				? target
				: target.closest('form') instanceof HTMLFormElement
					? target.closest('form')
					: undefined;
		if (form) {
			const submitter =
				target instanceof HTMLButtonElement || target instanceof HTMLInputElement
					? target
					: undefined;
			form.requestSubmit(submitter);
			return;
		}
	}
	target.dispatchEvent(cloneInteractionEvent(event));
}

function cloneInteractionEvent(event: Event): Event {
	const options = {
		bubbles: event.bubbles,
		cancelable: event.cancelable,
		composed: event.composed
	};
	if (event instanceof KeyboardEvent)
		return new KeyboardEvent(event.type, {
			...options,
			key: event.key,
			code: event.code,
			altKey: event.altKey,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			shiftKey: event.shiftKey,
			repeat: event.repeat
		});
	if (event instanceof InputEvent)
		return new InputEvent(event.type, {
			...options,
			data: event.data,
			inputType: event.inputType,
			isComposing: event.isComposing
		});
	return new Event(event.type, options);
}
