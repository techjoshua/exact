import type { HydrateOptions } from '../types.js';
import { logFrameworkEvent } from '@exactjs/core';

const activationEvents = [
	'auxclick',
	'beforeinput',
	'contextmenu',
	'click',
	'dblclick',
	'dragenter',
	'dragleave',
	'dragover',
	'dragstart',
	'dragend',
	'drop',
	'blur',
	'focus',
	'focusout',
	'input',
	'change',
	'submit',
	'keydown',
	'keyup',
	'mousedown',
	'mouseup',
	'pointerdown',
	'pointerup',
	'touchstart',
	'touchend',
	'wheel',
	'focusin',
	'compositionstart',
	'compositionupdate',
	'compositionend'
] as const;
const maxQueuedInteractions = 256;

type InteractionController = {
	activate(boundary: Element, event: Event): boolean | Promise<boolean>;
	dispose(): void;
};

const controllers = new WeakMap<Node, InteractionController>();

/**
 * Installs the small capture-phase broker that activates a dormant island before its event reaches
 * the target or the renderer's delegated bubble listener.
 */
export function ensureInteractionHydration(
	container: Element | Document,
	activate: (boundary: Element, event: Event) => boolean | Promise<boolean>,
	options: HydrateOptions
): void {
	controllers.get(container)?.dispose();
	const pending = new WeakMap<Element, QueuedActivation>();
	let replaying = false;
	const listener = (event: Event) => {
		if (replaying) return;
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
		const queued = captureQueuedInteraction(event, identity);
		const existing = pending.get(boundary);
		if (existing) {
			cancelOriginalInteraction(event);
			queueInteraction(existing.events, queued);
			return;
		}
		let activated: boolean | Promise<boolean> = false;
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
		if (activated instanceof Promise) {
			cancelOriginalInteraction(event);
			const activation: QueuedActivation = { events: [queued] };
			pending.set(boundary, activation);
			void activated
				.then((result) => {
					pending.delete(boundary);
					if (
						boundary.getAttribute('data-exact-client-generation') !== generation ||
						!container.contains(boundary)
					)
						return;
					replaying = true;
					try {
						for (const interaction of activation.events) {
							const replacement = interaction.identity
								? resolveTargetIdentity(boundary, interaction.identity)
								: undefined;
							if (!replacement) continue;
							replayInteraction(interaction.event, replacement, interaction.submitterIdentity);
						}
					} finally {
						replaying = false;
					}
					if (result && !hasDormantIsland(container)) dispose();
				})
				.catch((error) => {
					pending.delete(boundary);
					logFrameworkEvent(
						'error',
						'hydrate',
						'interaction',
						'interaction island activation failed',
						error,
						options.logger
					);
					if (container.contains(boundary)) {
						replaying = true;
						try {
							for (const interaction of activation.events) {
								const replacement = interaction.identity
									? resolveTargetIdentity(boundary, interaction.identity)
									: undefined;
								if (replacement)
									replayInteraction(interaction.event, replacement, interaction.submitterIdentity);
							}
						} finally {
							replaying = false;
						}
					}
				});
			return;
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
		if (replacement) replayInteraction(event, replacement, queued.submitterIdentity);
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

type QueuedInteraction = Readonly<{
	event: Event;
	identity: TargetIdentity | undefined;
	submitterIdentity: TargetIdentity | undefined;
	key: string;
	stateLike: boolean;
}>;

type QueuedActivation = {
	events: QueuedInteraction[];
};

function captureQueuedInteraction(
	event: Event,
	identity: TargetIdentity | undefined
): QueuedInteraction {
	return {
		event: cloneInteractionEvent(event),
		identity,
		submitterIdentity:
			event instanceof SubmitEvent && event.submitter instanceof Element
				? captureTargetIdentity(
						event.submitter.closest('[data-exact-client-boundary]') ?? event.submitter,
						event.submitter
					)
				: undefined,
		key: `${event.type}:${identity?.exactId ?? identity?.id ?? identity?.name ?? identity?.path.join('.') ?? ''}`,
		stateLike: event.type === 'input' || event.type === 'change'
	};
}

function queueInteraction(queue: QueuedInteraction[], interaction: QueuedInteraction): void {
	if (interaction.stateLike) {
		const previous = queue.findIndex((candidate) => candidate.key === interaction.key);
		if (previous >= 0) queue.splice(previous, 1);
	}
	if (queue.length >= maxQueuedInteractions) queue.shift();
	queue.push(interaction);
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

function replayInteraction(
	event: Event,
	target: Element,
	submitterIdentity?: TargetIdentity
): void {
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
			const resolvedSubmitter = submitterIdentity
				? resolveTargetIdentity(form, submitterIdentity)
				: undefined;
			const submitter =
				resolvedSubmitter instanceof HTMLButtonElement ||
				resolvedSubmitter instanceof HTMLInputElement
					? resolvedSubmitter
					: target instanceof HTMLButtonElement || target instanceof HTMLInputElement
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
	if (typeof CompositionEvent !== 'undefined' && event instanceof CompositionEvent)
		return new CompositionEvent(event.type, {
			...options,
			data: event.data
		});
	if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent)
		return new PointerEvent(event.type, mouseEventOptions(event, options));
	if (typeof WheelEvent !== 'undefined' && event instanceof WheelEvent)
		return new WheelEvent(event.type, {
			...mouseEventOptions(event, options),
			deltaX: event.deltaX,
			deltaY: event.deltaY,
			deltaZ: event.deltaZ,
			deltaMode: event.deltaMode
		});
	if (event instanceof MouseEvent)
		return new MouseEvent(event.type, mouseEventOptions(event, options));
	if (typeof FocusEvent !== 'undefined' && event instanceof FocusEvent)
		return new FocusEvent(event.type, {
			...options,
			relatedTarget: event.relatedTarget
		});
	return new Event(event.type, options);
}

function mouseEventOptions(event: MouseEvent, options: EventInit): MouseEventInit {
	return {
		...options,
		detail: event.detail,
		screenX: event.screenX,
		screenY: event.screenY,
		clientX: event.clientX,
		clientY: event.clientY,
		ctrlKey: event.ctrlKey,
		shiftKey: event.shiftKey,
		altKey: event.altKey,
		metaKey: event.metaKey,
		button: event.button,
		buttons: event.buttons,
		relatedTarget: event.relatedTarget
	};
}
