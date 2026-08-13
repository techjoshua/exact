import { logFrameworkEvent } from '@exactjs/core';
import type { ExactLazyEventPolicy, HydrateOptions } from '../types.js';
import {
	captureInteractionControlState,
	restoreInteractionControlState,
	type InteractionControlState
} from './interaction-control-state.js';

const maxQueuedInteractions = 256;
const islandBoundarySelector = '[data-exact-client-boundary], [data-xh]';

type InteractionController = { dispose(): void };
type PolicyResolver = (
	boundary: Element,
	target: Element,
	type: string
) => ExactLazyEventPolicy | undefined;

const controllers = new WeakMap<Node, InteractionController>();

/** Installs policy-specific capture listeners for compiler-proven dormant islands. */
export function ensureInteractionHydration(
	container: Element | Document,
	activate: (boundary: Element, event: Event) => boolean | Promise<boolean>,
	eventTypes: readonly ExactLazyEventPolicy['type'][],
	resolvePolicy: PolicyResolver,
	options: HydrateOptions
): void {
	controllers.get(container)?.dispose();
	const pending = new WeakMap<Element, QueuedActivation>();
	const activations = new Set<QueuedActivation>();
	const failedGenerations = new WeakMap<Element, string | null>();
	let replaying = false;
	const listener = (event: Event) => {
		if (replaying) return;
		const target = eventTargetElement(event.target);
		const boundary = target?.closest(islandBoundarySelector);
		if (
			!target ||
			!boundary ||
			!container.contains(boundary) ||
			boundary.getAttribute('data-exact-client-hydration') !== 'interaction' ||
			boundary.getAttribute('data-exact-client-hydrated') === 'true'
		)
			return;
		const policy = resolvePolicy(boundary, target, event.type);
		if (!policy) return;
		const generation = boundary.getAttribute('data-exact-client-generation');
		if (failedGenerations.get(boundary) === generation) return;
		const queued = captureQueuedInteraction(boundary, target, event, policy);
		const existing = pending.get(boundary);
		if (existing) {
			interceptOriginalInteraction(event, policy);
			queueInteraction(existing.events, queued, options);
			return;
		}
		let activated: boolean | Promise<boolean> = false;
		try {
			activated = activate(boundary, event);
		} catch (error) {
			logActivationFailure(error, options);
		}
		if (activated instanceof Promise) {
			interceptOriginalInteraction(event, policy);
			const activation: QueuedActivation = { boundary, events: [queued], released: false };
			pending.set(boundary, activation);
			activations.add(activation);
			void activated.then(
				(result) => {
					pending.delete(boundary);
					activations.delete(activation);
					if (activation.released || !sameGeneration(container, boundary, generation)) return;
					if (!result) failedGenerations.set(boundary, generation);
					replaying = true;
					try {
						if (result) replayQueued(boundary, activation.events, false);
						else replayQueued(boundary, activation.events, true);
					} finally {
						replaying = false;
					}
					if (result && !hasDormantIsland(container)) dispose();
					activation.events.length = 0;
				},
				(error) => {
					pending.delete(boundary);
					activations.delete(activation);
					logActivationFailure(error, options);
					if (activation.released || !sameGeneration(container, boundary, generation)) return;
					failedGenerations.set(boundary, generation);
					replaying = true;
					try {
						replayQueued(boundary, activation.events, true);
					} finally {
						replaying = false;
					}
					activation.events.length = 0;
				}
			);
			return;
		}
		if (!activated) return;
		if (!sameGeneration(container, boundary, generation)) {
			interceptOriginalInteraction(event, policy);
			if (!hasDormantIsland(container)) dispose();
			return;
		}
		if (boundary.contains(target)) {
			if (!hasDormantIsland(container)) dispose();
			return;
		}
		interceptOriginalInteraction(event, policy);
		replaying = true;
		try {
			replayQueued(boundary, [queued], false);
		} finally {
			replaying = false;
		}
		if (!hasDormantIsland(container)) dispose();
	};
	const listenedEvents = [...new Set(eventTypes)];
	const dispose = () => {
		for (const activation of activations) {
			activation.released = true;
			activation.events.length = 0;
			pending.delete(activation.boundary);
		}
		activations.clear();
		for (const type of listenedEvents) container.removeEventListener(type, listener, true);
		options.signal?.removeEventListener('abort', dispose);
		controllers.delete(container);
	};
	for (const type of listenedEvents) container.addEventListener(type, listener, true);
	options.signal?.addEventListener('abort', dispose, { once: true });
	controllers.set(container, { dispose });
}

type QueuedInteraction = Readonly<{
	type: ExactLazyEventPolicy['type'];
	replay: ExactLazyEventPolicy['replay'];
	identity: TargetIdentity;
	submitterIdentity?: TargetIdentity;
	control?: InteractionControlState;
	key: string;
}>;

type QueuedActivation = {
	boundary: Element;
	events: QueuedInteraction[];
	released: boolean;
};

function captureQueuedInteraction(
	boundary: Element,
	target: Element,
	event: Event,
	policy: ExactLazyEventPolicy
): QueuedInteraction {
	const identity = captureTargetIdentity(boundary, target);
	return {
		type: policy.type,
		replay: policy.replay,
		identity,
		...(policy.replay === 'latest-value'
			? { control: captureInteractionControlState(target) }
			: {}),
		...(event instanceof SubmitEvent && event.submitter instanceof Element
			? { submitterIdentity: captureTargetIdentity(boundary, event.submitter) }
			: {}),
		key: `${policy.type}:${identity.exactId ?? identity.id ?? identity.name ?? identity.path.join('.')}`
	};
}

function queueInteraction(
	queue: QueuedInteraction[],
	interaction: QueuedInteraction,
	options: HydrateOptions
): void {
	if (interaction.replay === 'latest-value') {
		const previous = queue.findIndex((candidate) => candidate.key === interaction.key);
		if (previous >= 0) queue.splice(previous, 1);
	}
	if (queue.length >= maxQueuedInteractions) {
		const discard = queue.findIndex((candidate) => candidate.type !== 'submit');
		if (discard < 0) {
			logFrameworkEvent(
				'warn',
				'hydrate',
				'interaction-overflow',
				'interaction queue rejected a submit because its bounded capacity contains only submits',
				undefined,
				options.logger
			);
			return;
		}
		queue.splice(discard, 1);
	}
	queue.push(interaction);
}

function replayQueued(
	boundary: Element,
	queue: readonly QueuedInteraction[],
	failed: boolean
): void {
	for (const interaction of queue) {
		const target = resolveTargetIdentity(boundary, interaction.identity);
		if (target) replayInteraction(interaction, target, failed);
	}
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

function sameGeneration(
	container: Element | Document,
	boundary: Element,
	generation: string | null
): boolean {
	return (
		container.contains(boundary) &&
		boundary.getAttribute('data-exact-client-generation') === generation
	);
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

function interceptOriginalInteraction(event: Event, policy: ExactLazyEventPolicy): void {
	if (policy.replay === 'native-click' || policy.replay === 'request-submit')
		event.preventDefault();
	event.stopImmediatePropagation();
}

function replayInteraction(interaction: QueuedInteraction, target: Element, failed: boolean): void {
	if (interaction.control) restoreInteractionControlState(target, interaction.control);
	if (interaction.replay === 'native-click' && target instanceof HTMLElement) {
		target.click();
		return;
	}
	if (interaction.replay === 'request-submit') {
		const form =
			target instanceof HTMLFormElement
				? target
				: target.closest('form') instanceof HTMLFormElement
					? target.closest('form')
					: undefined;
		if (!form) return;
		const resolved = interaction.submitterIdentity
			? resolveTargetIdentity(boundaryFor(form), interaction.submitterIdentity)
			: undefined;
		const submitter =
			resolved instanceof HTMLButtonElement || resolved instanceof HTMLInputElement
				? resolved
				: undefined;
		form.requestSubmit(submitter);
		return;
	}
	if (!failed)
		target.dispatchEvent(
			new Event(interaction.type, {
				bubbles: interaction.type !== 'focus' && interaction.type !== 'blur',
				composed: true
			})
		);
}

function boundaryFor(element: Element): Element {
	return element.closest(islandBoundarySelector) ?? element;
}

function logActivationFailure(error: unknown, options: HydrateOptions): void {
	logFrameworkEvent(
		'error',
		'hydrate',
		'interaction',
		'interaction island activation failed',
		error,
		options.logger
	);
}
