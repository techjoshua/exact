import {
	adoptElementId,
	normalizeClassValue,
	reserveElementId,
	sanitizeUrlAttribute
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import { readUnsafeHtmlReceipt } from '@exactjs/core/runtime/component-abi';
import { escapeAttr, escapeAttrName } from './html.js';
import type { SsrContext } from './types.js';
import type { RefBinding } from '@exactjs/core';
import {
	hasOwn,
	isEventProperty,
	isReactInputDeferred,
	isReactInputPriority,
	reactInputDeferred,
	reactInputPriority,
	reactOptionDeferred
} from './attribute-traversal.js';
import { reactAttributeName, reactBooleanAttributes } from './react-attributes.js';
import { renderStyle } from './style.js';

export * from './markers.js';

/** Renders intrinsic-operation props as escaped HTML attributes. */
export function renderAttrs(
	props: Record<string, unknown>,
	reactMarkup: boolean | 18 | 19 = false,
	tag?: string,
	context?: Pick<SsrContext, 'allowUnsafeHtml' | 'onUnsafeHtml'>,
	excludedNativeProps?: readonly string[]
): string {
	const boundDetails = !reactMarkup && tag === 'details' && '__exactBindToggle' in props;
	let attrs = boundDetails
		? ` data-exact-ssr-open="${unwrap(props.open) === true ? 'true' : 'false'}"`
		: '';
	if (!reactMarkup && props.ref) {
		const binding = unwrap(props.ref) as RefBinding<{ id: string }>;
		const authoredId = unwrap(props.id);
		if (authoredId !== undefined) adoptElementId(binding, authoredId);
		else attrs += ` id="${escapeAttr(reserveElementId(binding))}"`;
	}
	const customElement = !!reactMarkup && !!tag?.includes('-');
	if (reactMarkup) {
		if (tag === 'input') {
			if (reactMarkup === 19) {
				for (let index = 0; index < reactInputPriority.length; index++) {
					const name = reactInputPriority[index]!;
					if (hasOwn(props, name))
						attrs += renderAttribute(
							props[name],
							name,
							reactMarkup,
							tag,
							context,
							boundDetails,
							customElement,
							props.type
						);
				}
			}
			for (const name in props)
				if (
					hasOwn(props, name) &&
					!isReactInputDeferred(name) &&
					(reactMarkup !== 19 || !isReactInputPriority(name))
				)
					attrs += renderAttribute(
						props[name],
						name,
						reactMarkup,
						tag,
						context,
						boundDetails,
						customElement,
						props.type
					);
			for (let index = 0; index < reactInputDeferred.length; index++) {
				const name = reactInputDeferred[index]!;
				if (hasOwn(props, name))
					attrs += renderAttribute(
						props[name],
						name,
						reactMarkup,
						tag,
						context,
						boundDetails,
						customElement,
						props.type
					);
			}
		} else if (tag === 'option') {
			for (const name in props)
				if (hasOwn(props, name) && name !== 'value' && name !== 'selected')
					attrs += renderAttribute(
						props[name],
						name,
						reactMarkup,
						tag,
						context,
						boundDetails,
						customElement,
						props.type
					);
			for (let index = 0; index < reactOptionDeferred.length; index++) {
				const name = reactOptionDeferred[index]!;
				if (hasOwn(props, name))
					attrs += renderAttribute(
						props[name],
						name,
						reactMarkup,
						tag,
						context,
						boundDetails,
						customElement,
						props.type
					);
			}
		} else {
			for (const name in props)
				if (hasOwn(props, name))
					attrs += renderAttribute(
						props[name],
						name,
						reactMarkup,
						tag,
						context,
						boundDetails,
						customElement,
						props.type
					);
		}
	} else {
		for (const name in props)
			if (hasOwn(props, name) && !excludedNativeProps?.includes(name))
				attrs += renderAttribute(
					props[name],
					name,
					reactMarkup,
					tag,
					context,
					boundDetails,
					customElement,
					props.type
				);
	}
	return attrs;
}

function renderAttribute(
	rawValue: unknown,
	name: string,
	reactMarkup: boolean | 18 | 19,
	tag: string | undefined,
	context: Pick<SsrContext, 'allowUnsafeHtml' | 'onUnsafeHtml'> | undefined,
	boundDetails: boolean,
	customElement: boolean,
	inputType?: unknown
): string {
	if (!reactMarkup && name === 'dangerouslySetInnerHTML') {
		throw new Error(
			'Native eXact does not support dangerouslySetInnerHTML; use unsafeHtml() with explicit root opt-in.'
		);
	}
	if (
		(boundDetails && name === 'data-exact-ssr-open') ||
		name === 'children' ||
		name === 'key' ||
		name === 'ref' ||
		name === '__exactBindInput' ||
		name === '__exactBindChange' ||
		name === '__exactBindToggle' ||
		name === '__exactModalOpen' ||
		name === '__exactBindModalToggle' ||
		name === '__exactBindModalClose' ||
		name === 'dangerouslySetInnerHTML' ||
		isEventProperty(name)
	)
		return '';
	if (
		reactMarkup &&
		(tag === 'textarea' || tag === 'select') &&
		(name === 'value' || name === 'defaultValue')
	)
		return '';
	if (reactMarkup && tag === 'option' && name === 'children') return '';
	const unwrapped =
		!reactMarkup && (name === 'srcdoc' || name === 'srcDoc')
			? unsafeHtmlAttribute(rawValue, context)
			: unwrap(rawValue);
	const normalized =
		!reactMarkup && (name === 'className' || name === 'class')
			? normalizeClassValue(unwrapped)
			: name === 'value' && tag === 'input' && inputType === 'date' && unwrapped instanceof Date
				? Number.isNaN(unwrapped.getTime())
					? ''
					: unwrapped.toISOString().slice(0, 10)
				: unwrapped;
	const value = sanitizeUrlAttribute(name, normalized);
	const attrName = reactMarkup
		? reactAttributeName(name, reactMarkup, customElement)
		: nativeAttributeName(name, tag);
	if (value === null || value === undefined) return '';
	if (value === false && (!reactMarkup || reactBooleanAttributes.has(attrName.toLowerCase())))
		return '';
	if (attrName === 'style') {
		const style = renderStyle(value, !!reactMarkup);
		return style ? ` style="${escapeAttr(style)}"` : '';
	}
	if (value === true)
		return reactMarkup
			? reactBooleanAttributes.has(attrName.toLowerCase()) || (reactMarkup === 19 && customElement)
				? ` ${escapeAttrName(attrName)}=""`
				: ` ${escapeAttrName(attrName)}="true"`
			: ` ${escapeAttrName(attrName)}`;
	return ` ${escapeAttrName(attrName)}="${escapeAttr(String(value))}"`;
}

/** Serializes one compiler-known native host value without allocating or scanning a prop bag. */
export function renderNativeAttribute(
	value: unknown,
	name: string,
	tag: string,
	context?: Pick<SsrContext, 'allowUnsafeHtml' | 'onUnsafeHtml'>
): string {
	return renderAttribute(value, name, false, tag, context, false, false);
}

function unsafeHtmlAttribute(
	value: unknown,
	context: Pick<SsrContext, 'allowUnsafeHtml' | 'onUnsafeHtml'> | undefined
): string {
	const candidate = unwrap(value);
	const receipt = readUnsafeHtmlReceipt(candidate);
	if (!receipt) {
		throw new Error(
			'Native eXact iframe srcdoc requires unsafeHtml() and explicit allowUnsafeHtml root opt-in.'
		);
	}
	if (!context?.allowUnsafeHtml) {
		throw new Error(
			'unsafeHtml() used for iframe srcdoc requires allowUnsafeHtml: true on the native eXact SSR root.'
		);
	}
	const html = String(unwrap(receipt.value) ?? '');
	context.onUnsafeHtml?.({ characters: html.length });
	return html;
}

function nativeAttributeName(name: string, tag: string | undefined): string {
	if (name === 'className') return 'class';
	if (name === 'commandFor') return 'commandfor';
	if (tag !== 'script') return name;
	switch (name) {
		case 'crossOrigin':
			return 'crossorigin';
		case 'fetchPriority':
			return 'fetchpriority';
		case 'noModule':
			return 'nomodule';
		case 'referrerPolicy':
			return 'referrerpolicy';
		default:
			return name;
	}
}
