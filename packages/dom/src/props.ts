import {
	batch,
	createErrorReport,
	handleComponentError,
	isVNode,
	normalizeClassValue,
	observeComponentAsync,
	sanitizeUrlAttribute,
	UnsafeHtml,
	attachElementIdentity,
	type RefBinding,
	type StopHandle,
	unwrap
} from '@exactjs/core';
import { isReactiveValue, type EffectScope } from '@exactjs/reactive';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import { describeNode, domDebug } from './debug.js';
import {
	ensureDelegated,
	directInteractionKey,
	eventTypeForProp,
	requiresDirectListener,
	runEventInteraction
} from './events.js';
import { preserveFocus } from './focus.js';
import { getModalBindingCapability } from './modal/capability.js';
import { findOwnerInstance } from './ownership.js';
import { directEventHandlers, eventHandlers, propBindings } from './state.js';
import { bindStyle } from './style.js';
import type { Root } from './types.js';

/** Applies prop changes to a DOM element, including reactive bindings and delegated events. */
export function updateProps(
	root: Root,
	element: Element,
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
	scope: EffectScope,
	preserveUserFocus = true
): void {
	const apply = () => {
		for (const key of Object.keys(previous)) {
			if (!(key in next)) setElementProp(root, element, key, undefined, previous[key], scope);
		}

		for (const [key, value] of Object.entries(next)) {
			if (!Object.is(previous[key], value))
				setElementProp(root, element, key, value, previous[key], scope);
		}
	};
	if (preserveUserFocus) preserveFocus(root, apply);
	else apply();
}

/** Stops reactive prop bindings and removes delegated event handlers for an element. */
export function clearElementProps(element: Element): void {
	for (const stop of propBindings.get(element)?.values() ?? []) {
		stop();
	}
	propBindings.delete(element);
	eventHandlers.delete(element);
	for (const entry of directEventHandlers.get(element)?.values() ?? [])
		element.removeEventListener(entry.type, entry.listener, entry.capture);
	directEventHandlers.delete(element);
}

/**
 * Publishes one adopted dirty control through its compiler-owned binding without synthesizing an
 * authored DOM event.
 */
export function synchronizeFormBinding(element: Element): boolean {
	const entries = directEventHandlers.get(element);
	const entry =
		entries?.get('__exactBindInput') ??
		entries?.get('__exactBindChange') ??
		entries?.get('__exactBindToggle') ??
		entries?.get('__exactBindModalToggle') ??
		entries?.get('__exactBindModalClose');
	if (!entry) return false;
	const event = new Event(entry.type, { bubbles: false, cancelable: false });
	Object.defineProperties(event, {
		target: { configurable: true, value: element },
		currentTarget: { configurable: true, value: element }
	});
	entry.listener(event);
	return true;
}

/** Applies one already-diffed property for compiler-owned and generic DOM lanes. */
export function setElementProp(
	root: Root,
	element: Element,
	key: string,
	value: unknown,
	previous: unknown,
	scope: EffectScope
): void {
	if (key === 'children') return;
	if (key === 'dangerouslySetInnerHTML') {
		throw new Error(
			'Native eXact does not support dangerouslySetInnerHTML; use unsafeHtml() with explicit root opt-in.'
		);
	}

	clearPropBinding(element, key);

	if (key === 'ref') {
		if (previous && previous !== value) {
			(previous as { fulfill(value: unknown): void }).fulfill(undefined);
		}
		if (value) attachElementIdentity(value as RefBinding<unknown>, element);
		(value as { fulfill(value: unknown): void } | undefined)?.fulfill(element);
		return;
	}

	if (isCompilerFormBindingProp(key)) {
		setDirectEventHandler(
			root,
			element,
			key,
			key === '__exactBindInput'
				? 'input'
				: key === '__exactBindToggle' || key === '__exactBindModalToggle'
					? 'toggle'
					: key === '__exactBindModalClose'
						? 'close'
						: 'change',
			value,
			false
		);
		return;
	}

	if (key === '__exactModalOpen') {
		if (value === undefined) return;
		const capability = getModalBindingCapability();
		if (!capability)
			throw new Error(
				'Modal binding is unavailable because this artifact did not include the modal capability'
			);
		const stop = capability.bind(element, value, scope, () => releasePropBinding(element, key));
		if (stop) setPropBinding(element, key, stop);
		return;
	}

	const directInteraction = key.startsWith('__exactDirectInteraction:');
	const eventKey = directInteraction ? key.slice('__exactDirectInteraction:'.length) : key;
	if (/^on[A-Z]/.test(eventKey)) {
		const { type, capture } = eventTypeForProp(eventKey);
		if (capture || requiresDirectListener(type)) {
			setDirectEventHandler(root, element, key, type, value, capture, directInteraction);
			return;
		}
		let handlers = eventHandlers.get(element);
		if (!handlers) {
			handlers = new Map();
			eventHandlers.set(element, handlers);
		}

		if (typeof value === 'function') {
			const handler = value as EventListener;
			handlers.set(type, handler);
			if (directInteraction) handlers.set(directInteractionKey(type), handler);
			else handlers.delete(directInteractionKey(type));
			ensureDelegated(root, type, eventContainerFor(root, element));
		} else {
			handlers.delete(type);
			handlers.delete(directInteractionKey(type));
		}
		return;
	}

	if (key === 'style') {
		if (previous !== value) {
			(element as HTMLElement).removeAttribute('style');
		}
		const stop = bindStyle(element as HTMLElement, value, scope, () =>
			releasePropBinding(element, key)
		);
		if (stop) setPropBinding(element, key, stop);
		return;
	}

	clearPropBinding(element, key);
	if (!propMayObserveReactiveValue(key, value)) {
		applyPropValue(root, element, key, value);
		return;
	}
	const stop = watchRetained(
		() => preserveFocus(root, () => applyPropValue(root, element, key, value)),
		undefined,
		{ scope, onRelease: () => releasePropBinding(element, key) }
	);
	if (stop) setPropBinding(element, key, stop);
}

/** Identifies compiler-owned native-control bindings that enhancements must preserve verbatim. */
export function isCompilerFormBindingProp(key: string): boolean {
	return (
		key === '__exactBindInput' ||
		key === '__exactBindChange' ||
		key === '__exactBindToggle' ||
		key === '__exactBindModalToggle' ||
		key === '__exactBindModalClose'
	);
}

/** Applies one ordinary prop after the caller has selected static or observed execution. */
function applyPropValue(root: Root, element: Element, key: string, value: unknown): void {
	const actual = unwrap(value);
	if (actual === false || actual === null || actual === undefined) {
		clearDomProp(element, key);
		return;
	}
	const normalized =
		key === 'srcdoc' || key === 'srcDoc'
			? unsafeHtmlAttribute(root, actual)
			: key === 'class' || key === 'className'
				? normalizeClassValue(actual)
				: actual;
	setDomProp(root, element, key, sanitizeUrlAttribute(key, normalized));
}

/** Reports props whose supported value shape can contain compiler reactive expressions. */
function propMayObserveReactiveValue(key: string, value: unknown): boolean {
	if (isReactiveValue(value)) return true;
	if (key === 'class' || key === 'className') return typeof value === 'object' && value !== null;
	return (
		(key === 'srcdoc' || key === 'srcDoc') &&
		isVNode(value) &&
		value.type === UnsafeHtml &&
		isReactiveValue(value.props.value)
	);
}

function setDirectEventHandler(
	root: Root,
	element: Element,
	key: string,
	type: string,
	value: unknown,
	capture: boolean,
	directInteraction = false
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
	const listener: EventListener = (event) =>
		preserveFocus(root, () => {
			try {
				const owner = findOwnerInstance(element);
				const invoke = () =>
					(handler as (this: Element, event: Event) => unknown).call(element, event);
				const result = batch(() =>
					runEventInteraction(owner, invoke, undefined, directInteraction)
				);
				observeComponentAsync(owner, result, 'event', type);
			} catch (error) {
				const owner = findOwnerInstance(element);
				handleComponentError(owner, createErrorReport(error, 'event', owner, type));
			}
		});
	const entry = { type, listener, capture };
	let direct = directEventHandlers.get(element);
	if (!direct) {
		direct = new Map();
		directEventHandlers.set(element, direct);
	}
	direct.set(key, entry);
	element.addEventListener(type, listener, capture);
}

function eventContainerFor(root: Root, element: Element): Node {
	if (root.eventContainer) return root.eventContainer;
	if (root.container.contains(element)) return root.container;
	for (const target of root.portalTargets) if (target.contains(element)) return target;
	return root.container;
}

/** Applies one non-reactive property using the same semantics as JSX bindings. */
export function applyDomProp(element: Element, key: string, value: unknown): void {
	if (key === 'dangerouslySetInnerHTML') {
		throw new Error(
			'Native eXact does not support dangerouslySetInnerHTML; use unsafeHtml() with explicit root opt-in.'
		);
	}
	if ((key === 'srcdoc' || key === 'srcDoc') && value !== null && value !== undefined) {
		throw new Error(
			'Native eXact srcdoc patches require an unsafeHtml() capability owned by a render root.'
		);
	}
	if (value === false || value === null || value === undefined) clearDomProp(element, key);
	else setDomProp(undefined, element, key, sanitizeUrlAttribute(key, value));
}

function unsafeHtmlAttribute(root: Root, value: unknown): string {
	if (!isVNode(value) || value.type !== UnsafeHtml) {
		throw new Error(
			'Native eXact iframe srcdoc requires unsafeHtml() and explicit allowUnsafeHtml root opt-in.'
		);
	}
	if (!root.allowUnsafeHtml) {
		throw new Error(
			'unsafeHtml() used for iframe srcdoc requires allowUnsafeHtml: true on the native eXact render or hydration root.'
		);
	}
	const html = String(unwrap(value.props.value) ?? '');
	root.onUnsafeHtml?.({ characters: html.length });
	return html;
}

function setDomProp(root: Root | undefined, element: Element, key: string, value: unknown): void {
	const property = normalizePropName(key);

	if (property === 'defaultValue' && isFocusedTextControl(element)) {
		if (root)
			domDebug(root, 'skip focused defaultValue', () => ({
				element: describeNode(element),
				value
			}));
		return;
	}

	if (property in element) {
		try {
			const record = element as unknown as Record<string, unknown>;
			if (property === 'value' && element instanceof HTMLSelectElement && element.multiple) {
				const selected = new Set(
					Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)]
				);
				for (const option of Array.from(element.options))
					if (option.selected !== selected.has(option.value))
						option.selected = selected.has(option.value);
				return;
			}
			if (property === 'value' && element instanceof HTMLInputElement && value instanceof Date) {
				const next = Number.isNaN(value.getTime()) ? null : value;
				const current = element.valueAsDate;
				if ((current?.getTime() ?? null) !== (next?.getTime() ?? null)) element.valueAsDate = next;
				return;
			}
			if (Object.is(record[property], value)) {
				syncBooleanAttribute(element, property, value);
				return;
			}

			if (property === 'value' || property === 'defaultValue') {
				if (root)
					domDebug(root, 'set form value prop', () => ({
						element: describeNode(element),
						property,
						active: describeNode(document.activeElement),
						value
					}));
			}
			record[property] = value;
			syncBooleanAttribute(element, property, value);
			return;
		} catch {
			// Fall through to attribute setting for readonly DOM properties.
		}
	}

	const attributeValue = String(value);
	if (element.getAttribute(property) !== attributeValue) {
		element.setAttribute(property, attributeValue);
	}
}

function syncBooleanAttribute(element: Element, property: string, value: unknown): void {
	if (typeof value !== 'boolean') return;
	if (value) {
		if (!element.hasAttribute(property)) element.setAttribute(property, '');
	} else {
		if (element.hasAttribute(property)) element.removeAttribute(property);
	}
}

function clearDomProp(element: Element, key: string): void {
	const property = normalizePropName(key);
	if (property in element) {
		const current = (element as unknown as Record<string, unknown>)[property];
		try {
			if (typeof current === 'boolean') {
				if (current) (element as unknown as Record<string, unknown>)[property] = false;
			} else if (typeof current === 'string') {
				if (current !== '') (element as unknown as Record<string, unknown>)[property] = '';
			}
		} catch {
			// Attribute removal below is still the portable fallback.
		}
	}

	element.removeAttribute(property);
}

function normalizePropName(key: string): string {
	if (key === 'className') return 'class';
	if (key === 'commandFor') return 'commandfor';
	return key;
}

function isFocusedTextControl(element: Element): boolean {
	return (
		document.activeElement === element &&
		(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
	);
}

function clearPropBinding(element: Element, key: string): void {
	const bindings = propBindings.get(element);
	const stop = bindings?.get(key);
	if (!stop) return;
	stop();
	bindings?.delete(key);
}

function releasePropBinding(element: Element, key: string): void {
	const bindings = propBindings.get(element);
	bindings?.delete(key);
	if (bindings && bindings.size === 0) propBindings.delete(element);
}

function setPropBinding(element: Element, key: string, stop: StopHandle): void {
	let bindings = propBindings.get(element);
	if (!bindings) {
		bindings = new Map();
		propBindings.set(element, bindings);
	}
	bindings.set(key, stop);
}
