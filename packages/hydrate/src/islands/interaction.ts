import { logFrameworkEvent } from '@exactjs/core';
import type { ExactLazyEventPolicy, HydrateOptions } from '../types.js';
import {
	captureInteractionControlState,
	restoreInteractionControlState,
	type InteractionControlState
} from './interaction-control-state.js';

const maxQueuedInteractions = 256;
const islandBoundarySelector = '[data-exact-client-boundary], [data-xh]';

type InteractionConfiguration = {
	activate: (boundary: Element, event: Event) => boolean | Promise<boolean>;
	eventTypes: readonly ExactLazyEventPolicy['type'][];
	resolvePolicy: PolicyResolver;
	options: HydrateOptions;
};
type InteractionController = {
	dispose(): void;
	releaseIfSettled(): void;
	refresh(configuration: InteractionConfiguration): boolean;
};
type PolicyResolver = (
	boundary: Element,
	target: Element,
	type: string
) => ExactLazyEventPolicy | undefined;

const controllers = new WeakMap<Node, InteractionController>();

/** Installs policy-specific capture listeners for compiler-authorized islands awaiting adoption. */
export function ensureInteractionHydration(
	container: Element | Document,
	activate: (boundary: Element, event: Event) => boolean | Promise<boolean>,
	eventTypes: readonly ExactLazyEventPolicy['type'][],
	resolvePolicy: PolicyResolver,
	options: HydrateOptions
): void {
	const previous = controllers.get(container);
	if (previous?.refresh({ activate, eventTypes, resolvePolicy, options })) return;
	previous?.dispose();
	const pending = new WeakMap<Element, QueuedActivation>();
	const activations = new Set<QueuedActivation>();
	let failedGenerations = new WeakMap<Element, string | null>();
	let replaying = false;
	let disposed = false;
	const listener = (event: Event) => {
		if (replaying) return;
		const target = eventTargetElement(event.target);
		const boundary = target?.closest(islandBoundarySelector);
		if (
			!target ||
			!boundary ||
			!container.contains(boundary) ||
			!['interaction', 'eager'].includes(
				boundary.getAttribute('data-exact-client-hydration') ?? ''
			) ||
			boundary.getAttribute('data-exact-client-hydrated') === 'true'
		)
			return;
		const policy = resolvePolicy(boundary, target, event.type);
		if (!policy) return;
		const generation = boundary.getAttribute('data-exact-client-generation');
		const isCurrent = () => !disposed && sameGeneration(container, boundary, generation);
		if (failedGenerations.get(boundary) === generation) return;
		const queued = captureQueuedInteraction(target, event, policy);
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
					if (activation.released || !isCurrent()) return;
					if (!result) failedGenerations.set(boundary, generation);
					replaying = true;
					try {
						if (result) replayQueued(boundary, activation.events, false, isCurrent);
						else replayQueued(boundary, activation.events, true, isCurrent);
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
					if (activation.released || !isCurrent()) return;
					failedGenerations.set(boundary, generation);
					replaying = true;
					try {
						replayQueued(boundary, activation.events, true, isCurrent);
					} finally {
						replaying = false;
					}
					activation.events.length = 0;
				}
			);
			return;
		}
		if (!activated) return;
		if (!isCurrent()) {
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
			replayQueued(boundary, [queued], false, isCurrent);
		} finally {
			replaying = false;
		}
		if (!hasDormantIsland(container)) dispose();
	};
	const listenedEvents = new Set(eventTypes);
	const dispose = () => {
		if (disposed) return;
		disposed = true;
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
	controllers.set(container, {
		dispose,
		refresh(next) {
			// Registry refreshes keep queued events under the same root lifetime. A new owner
			// must release the previous queue instead of inheriting its interactions.
			if (disposed || next.options.signal !== options.signal) return false;
			const types = new Set(next.eventTypes);
			for (const type of listenedEvents)
				if (!types.has(type)) {
					container.removeEventListener(type, listener, true);
					listenedEvents.delete(type);
				}
			for (const type of types)
				if (!listenedEvents.has(type)) {
					container.addEventListener(type, listener, true);
					listenedEvents.add(type);
				}
			// A registration refresh can retry a previously failed loader.
			failedGenerations = new WeakMap();
			activate = next.activate;
			resolvePolicy = next.resolvePolicy;
			options = next.options;
			return true;
		},
		releaseIfSettled: () => {
			if (!activations.size && !hasDormantIsland(container)) dispose();
		}
	});
}

type QueuedInteraction = Readonly<{
	type: ExactLazyEventPolicy['type'];
	replay: ExactLazyEventPolicy['replay'];
	identity: TargetIdentity;
	submitterIdentity?: TargetIdentity;
	control?: InteractionControlState;
}>;

type QueuedActivation = {
	boundary: Element;
	events: QueuedInteraction[];
	released: boolean;
};

function captureQueuedInteraction(
	target: Element,
	event: Event,
	policy: ExactLazyEventPolicy
): QueuedInteraction {
	const identity = captureTargetIdentity(target);
	return {
		type: policy.type,
		replay: policy.replay,
		identity,
		...(policy.replay === 'latest-value'
			? { control: captureInteractionControlState(target) }
			: {}),
		...(event instanceof SubmitEvent && event.submitter instanceof Element
			? { submitterIdentity: captureTargetIdentity(event.submitter) }
			: {})
	};
}

function queueInteraction(
	queue: QueuedInteraction[],
	interaction: QueuedInteraction,
	options: HydrateOptions
): void {
	if (interaction.replay === 'latest-value') {
		const previous = queue.findIndex((candidate) => sameQueuedTarget(candidate, interaction));
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
	failed: boolean,
	isCurrent: () => boolean
): void {
	for (const interaction of queue) {
		// A replayed handler can synchronously release or replace its owning island.
		if (!isCurrent()) return;
		const target = resolveTargetIdentity(boundary, interaction.identity);
		if (target) replayInteraction(interaction, target, failed, boundary);
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
	const selector =
		'[data-exact-client-hydration="interaction"]:not([data-exact-client-hydrated="true"]), [data-exact-client-hydration="eager"]:not([data-exact-client-hydrated="true"])';
	return (
		(container instanceof Element && container.matches(selector)) ||
		!!container.querySelector(selector)
	);
}

type TargetIdentity = Readonly<{
	exactId?: string;
	id?: string;
	signature: string;
	element: Element;
}>;

/** Captures physical identity. Only a stable ID can authorize a replacement element. */
function captureTargetIdentity(target: Element): TargetIdentity {
	return {
		element: target,
		exactId: target.getAttribute('data-exact-id') || undefined,
		id: target.id || undefined,
		signature: targetSignature(target)
	};
}

/** Coalesces one event policy on one target without confusing names or ID namespaces. */
function sameQueuedTarget(left: QueuedInteraction, right: QueuedInteraction): boolean {
	if (left.type !== right.type || left.identity.signature !== right.identity.signature)
		return false;
	const a = left.identity;
	const b = right.identity;
	if (a.exactId || b.exactId) return a.exactId !== undefined && a.exactId === b.exactId;
	if (a.id || b.id) return a.id !== undefined && a.id === b.id;
	return a.element === b.element;
}

function resolveTargetIdentity(boundary: Element, identity: TargetIdentity): Element | undefined {
	for (const [attribute, value] of [
		['data-exact-id', identity.exactId],
		['id', identity.id]
	] as const) {
		if (!value) continue;
		const candidates = [boundary, ...boundary.querySelectorAll(`[${attribute}]`)].filter(
			(candidate) =>
				candidate.getAttribute(attribute) === value && belongsToBoundary(boundary, candidate)
		);
		if (candidates.length === 1 && targetSignature(candidates[0]!) === identity.signature)
			return candidates[0];
		return undefined;
	}
	const target = identity.element;
	return boundary.contains(target) &&
		belongsToBoundary(boundary, target) &&
		targetSignature(target) === identity.signature
		? target
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

function replayInteraction(
	interaction: QueuedInteraction,
	target: Element,
	failed: boolean,
	boundary: Element
): void {
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
			? resolveTargetIdentity(boundary, interaction.submitterIdentity)
			: undefined;
		const submitter =
			resolved instanceof HTMLButtonElement || resolved instanceof HTMLInputElement
				? resolved
				: undefined;
		// A delayed submit must still refer to the same valid form action.
		if (
			interaction.submitterIdentity &&
			(!submitter ||
				submitter.form !== form ||
				(submitter.type !== 'submit' && submitter.type !== 'image') ||
				submitter.matches(':disabled'))
		)
			return;
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

/** Adoption can consume the owning marker, but must not redirect into a nested island. */
function belongsToBoundary(boundary: Element, target: Element): boolean {
	const nearest = target.closest(islandBoundarySelector);
	return !nearest || nearest === boundary || !boundary.contains(nearest);
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

/** Releases capture after eager adoption once every captured replay has also settled. */
export function releaseInteractionHydrationIfSettled(container: Element | Document): void {
	controllers.get(container)?.releaseIfSettled();
}
