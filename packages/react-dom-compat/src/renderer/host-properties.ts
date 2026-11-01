import {
	createErrorReport,
	ErrorContext,
	handleComponentError,
	trackComponentAsync,
	isTaskCancellation,
	runDirectCompiledComponentInteraction,
	type AnyComponentInstance,
	type ErrorContextValue
} from '@exactjs/core';
import { isPromiseLike } from '@exactjs/core/framework/async-values';
import type { ReactRenderContext } from './types.js';
import { assignReactRef, reactEventHandler } from '@exactjs/react-compat/exact';
import { reactAttributeName } from './server-markup.js';

const eventGenerations = new WeakMap<AnyComponentInstance, number>();

const refReleases = new WeakMap<Element, () => void>();

const listeners = new WeakMap<Element, Map<string, EventListener>>();
const propertyNames = new Set([
	'checked',
	'defaultChecked',
	'defaultValue',
	'indeterminate',
	'multiple',
	'muted',
	'selected',
	'value'
]);

/** Applies the complete next React host-prop snapshot and releases superseded refs/listeners. */
export function applyReactHostProps(
	element: Element,
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
	context: ReactRenderContext
): void {
	for (const name of Object.keys(previous)) {
		if (name in next || ignoredProp(name)) continue;
		applyHostProp(element, name, previous[name], undefined, next, context);
	}
	for (const name of Object.keys(next)) {
		if (ignoredProp(name) || Object.is(previous[name], next[name])) continue;
		applyHostProp(element, name, previous[name], next[name], next, context);
	}
	if (!Object.is(previous.ref, next.ref)) {
		releaseHostRef(element);
		// Own the failed-attachment release before entering the authored callback.
		const ref = next.ref;
		if (ref)
			refReleases.set(element, () => {
				assignReactRef(ref as never, null);
			});
		const release = assignReactRef(next.ref as never, element);
		if (release) refReleases.set(element, release);
	}
}

/** Releases host resources that are not represented by DOM node removal alone. */
export function releaseReactHostProps(element: Element): void {
	const current = listeners.get(element);
	listeners.delete(element);
	if (current)
		for (const [identity, listener] of current) {
			const { type, capture } = parseListenerIdentity(identity);
			element.removeEventListener(type, listener, capture);
		}
	releaseHostRef(element);
}

/** Drops ownership before invoking user cleanup so reentry cannot release the same assignment twice. */
function releaseHostRef(element: Element): void {
	const release = refReleases.get(element);
	refReleases.delete(element);
	release?.();
}

/** Applies controlled values again after child option placement has completed. */
export function finalizeReactHostProps(element: Element, props: Record<string, unknown>): void {
	for (const name of ['value', 'checked', 'selected']) {
		if (name in props) applyProperty(element, name, props[name]);
	}
}

function applyHostProp(
	element: Element,
	name: string,
	previous: unknown,
	value: unknown,
	nextProps: Record<string, unknown>,
	context: ReactRenderContext
): void {
	const event = reactEvent(element, name);
	if (event) {
		applyEvent(element, event.type, event.capture, value, nextProps, context);
		return;
	}
	if (name === 'style') {
		applyStyle(element as HTMLElement | SVGElement, previous, value);
		return;
	}
	if (name === 'dangerouslySetInnerHTML') return;
	if (propertyNames.has(name) && name in element) {
		applyProperty(element, name, value);
		return;
	}
	const attribute = reactAttributeName(name);
	if (value === undefined || value === null || value === false) element.removeAttribute(attribute);
	else if (value === true) element.setAttribute(attribute, '');
	else element.setAttribute(attribute, String(value));
}

function applyProperty(element: Element, name: string, value: unknown): void {
	const target = element as unknown as Record<string, unknown>;
	if (name === 'defaultValue') target.defaultValue = value ?? '';
	else if (name === 'defaultChecked') target.defaultChecked = Boolean(value);
	else if (name === 'checked' || name === 'selected' || name === 'multiple' || name === 'muted')
		target[name] = Boolean(value);
	else target[name] = value ?? '';
}

function applyEvent(
	element: Element,
	type: string,
	capture: boolean,
	value: unknown,
	props: Record<string, unknown>,
	context: ReactRenderContext
): void {
	let current = listeners.get(element);
	if (!current) listeners.set(element, (current = new Map()));
	const identity = `${capture ? 'capture:' : 'bubble:'}${type}`;
	const previous = current.get(identity);
	if (previous) element.removeEventListener(type, previous, capture);
	if (typeof value !== 'function') {
		current.delete(identity);
		return;
	}
	const handler = reactEventHandler(value as (event: Event) => unknown, props);
	const listener: EventListener = (event) => {
		if (!context.root.active) return;
		try {
			const owner = context.owner;
			const invoke = () => handler.call(element, event);
			const result = owner
				? runDirectCompiledComponentInteraction(
						owner,
						'event',
						nextEventGeneration,
						'interactive',
						invoke
					)
				: invoke();
			if (isPromiseLike(result)) {
				const observed = Promise.resolve(result).catch((error) => {
					if (!owner || owner.mounted) reportEventError(context, error, type);
				});
				if (owner) trackComponentAsync(owner, observed);
				else void observed;
			}
		} catch (error) {
			reportEventError(context, error, type);
		}
	};
	current.set(identity, listener);
	element.addEventListener(type, listener, capture);
}

/** Allocates interaction generations only when an owned callback materializes a task frame. */
function nextEventGeneration(owner: AnyComponentInstance): number {
	const generation = (eventGenerations.get(owner) ?? 0) + 1;
	eventGenerations.set(owner, generation);
	return generation;
}

/** Routes intrinsic-root errors locally and ignores work whose root has already been released. */
function reportEventError(context: ReactRenderContext, error: unknown, phase: string): void {
	if (!context.root.active || isTaskCancellation(error)) return;
	const report = createErrorReport(error, 'event', context.owner, phase);
	if (context.owner) handleComponentError(context.owner, report);
	else (context.root.contexts.get(ErrorContext.id) as ErrorContextValue).report(report);
}

function applyStyle(element: HTMLElement | SVGElement, previous: unknown, value: unknown): void {
	const style = element.style;
	if (typeof value === 'string') {
		style.cssText = value;
		return;
	}
	const oldRecord = isRecord(previous) ? previous : {};
	const nextRecord = isRecord(value) ? value : {};
	for (const name of Object.keys(oldRecord)) if (!(name in nextRecord)) setStyle(style, name, '');
	for (const [name, entry] of Object.entries(nextRecord)) setStyle(style, name, entry);
	if (!isRecord(value) && typeof value !== 'string') style.cssText = '';
}

function setStyle(style: CSSStyleDeclaration, name: string, value: unknown): void {
	if (name.startsWith('--')) {
		style.setProperty(name, value === null || value === undefined ? '' : String(value));
		return;
	}
	const target = style as unknown as Record<string, unknown>;
	target[name] = value === null || value === undefined ? '' : String(value);
}

function reactEvent(
	element: Element,
	name: string
): { type: string; capture: boolean } | undefined {
	if (!/^on[A-Z]/.test(name)) return undefined;
	const capture = name.endsWith('Capture');
	const authored = name.slice(2, capture ? -7 : undefined);
	let type = authored.toLowerCase();
	if (
		type === 'change' &&
		(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
	)
		type = 'input';
	return {
		type: type === 'doubleclick' ? 'dblclick' : type === 'beforeinput' ? 'beforeinput' : type,
		capture
	};
}

function ignoredProp(name: string): boolean {
	return name === 'children' || name === 'key' || name === 'ref';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseListenerIdentity(identity: string): { type: string; capture: boolean } {
	const capture = identity.startsWith('capture:');
	return { type: identity.slice(capture ? 8 : 7), capture };
}
