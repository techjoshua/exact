import { authoredEventKey } from './events.js';
import {
	assertNativePropAllowed,
	isNativeEventProp,
	isNativeSrcdocProp
} from '@exactjs/core/framework/render-structure';
import {
	normalizeClassValue,
	sanitizeUrlAttribute,
	attachElementIdentity,
	type RefBinding,
	unwrap
} from '@exactjs/core';
import { readUnsafeHtmlReceipt } from '@exactjs/core/runtime/component-operations';
import { isReactiveValue, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import { describeNode, domDebug } from './debug.js';
import { applyEventProp, setDirectEventHandler } from './event-props.js';
import { preserveFocus } from './focus.js';
import { getModalBindingCapability } from './modal/capability.js';
import { directEventHandlers, eventHandlers, propBindings } from './state.js';
import { clearPropBinding, releasePropBinding, setPropBinding } from './prop-binding-ownership.js';
import { bindStyle } from './style.js';
import type { Root } from './types.js';
import { foreignChildCapability } from './renderer/foreign-child-capability.js';

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
	assertNativePropAllowed(key);
	if (isNativeSrcdocProp(key)) key = 'srcdoc';

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

	if (isEventHandlerProp(key)) {
		if (!isReactiveValue(value)) {
			applyEventProp(root, element, key, value);
			return;
		}
		const stop = watchRetained(() => applyEventProp(root, element, key, unwrap(value)), undefined, {
			scope,
			onRelease: () => releasePropBinding(element, key)
		});
		if (stop) setPropBinding(element, key, stop);
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

/** Identifies authored and compiler-specialized DOM event properties. */
export function isEventHandlerProp(key: string): boolean {
	return isNativeEventProp(authoredEventKey(key));
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
	return (key === 'srcdoc' || key === 'srcDoc') && isReactiveValue(unsafeHtmlValue(value)?.value);
}

/** Applies one non-reactive property using the same semantics as JSX bindings. */
export function applyDomProp(element: Element, key: string, value: unknown): void {
	assertNativePropAllowed(key);
	if (isNativeEventProp(key)) {
		throw new TypeError(
			'Native eXact event patches require an event binding owned by a render root.'
		);
	}
	if (isNativeSrcdocProp(key)) key = 'srcdoc';
	if ((key === 'srcdoc' || key === 'srcDoc') && value !== null && value !== undefined) {
		throw new Error(
			'Native eXact srcdoc patches require an unsafeHtml() capability owned by a render root.'
		);
	}
	if (value === false || value === null || value === undefined) clearDomProp(element, key);
	else setDomProp(undefined, element, key, sanitizeUrlAttribute(key, value));
}

function unsafeHtmlAttribute(root: Root, value: unknown): string {
	const receipt = readUnsafeHtmlReceipt(value);
	const foreign = receipt ? undefined : unsafeHtmlValue(value);
	if (!receipt && !foreign) {
		throw new Error(
			'Native eXact iframe srcdoc requires unsafeHtml() and explicit allowUnsafeHtml root opt-in.'
		);
	}
	if (!root.allowUnsafeHtml) {
		throw new Error(
			'unsafeHtml() used for iframe srcdoc requires allowUnsafeHtml: true on the native eXact render or hydration root.'
		);
	}
	const html = String(unwrap(receipt?.value ?? foreign?.value) ?? '');
	root.onUnsafeHtml?.({ characters: html.length });
	return html;
}

/** Reads unsafe HTML only through the explicitly installed compatibility interpreter. */
function unsafeHtmlValue(value: unknown): Readonly<{ value: unknown }> | undefined {
	return foreignChildCapability()?.unsafeHtmlValue?.(value as import('@exactjs/core').Child);
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
