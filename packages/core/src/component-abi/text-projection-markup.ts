import type { UnsafeHtmlAuditEvent } from '../component/contracts.js';
import { readUnsafeHtmlReceipt } from './unsafe-html-receipt.js';
import { unwrap } from '@exactjs/reactive/framework/values';
import { normalizeClassValue } from '../class-values.js';
import {
	assertNativeEventHandler,
	assertNativePropAllowed,
	isNativeEventProp,
	isNativeSrcdocProp
} from '../native-props.js';
import { sanitizeUrlAttribute } from '../url.js';

/** Root-owned unsafe HTML policy retained when markup is projected into text. */
export type TextProjectionPolicy = Readonly<{
	allowUnsafeHtml?: boolean;
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
}>;

/** Void hosts have no closing tag in the literal markup projection. */
export const projectedVoidTags = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

/** Escapes one layer of literal markup content without allocating a DOM node. */
export function escapeProjectedText(value: string): string {
	return value.replace(/[&<>]/g, (character) =>
		character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'
	);
}

/**
 * Serializes native props into inert markup. Refs and renderer bookkeeping are not attributes;
 * no element identity is reserved because this projection has no live element presentation.
 */
export function projectedAttributes(
	props: Readonly<Record<string, unknown>>,
	tag: string,
	policy: TextProjectionPolicy
): string {
	let result = '';
	for (const [key, raw] of Object.entries(props)) {
		assertNativePropAllowed(key);
		if (
			key === 'ref' ||
			key === 'children' ||
			key === 'key' ||
			key === 'data-exact-id' ||
			key.startsWith('__exact')
		)
			continue;
		if (isNativeEventProp(key)) {
			assertNativeEventHandler(unwrap(raw));
			continue;
		}
		let value = unwrap(raw);
		if (isNativeSrcdocProp(key)) {
			const receipt = readUnsafeHtmlReceipt(value);
			if (!receipt || !policy.allowUnsafeHtml)
				throw new TypeError(
					'Projected srcdoc requires unsafeHtml() and allowUnsafeHtml root opt-in'
				);
			value = String(unwrap(receipt.value) ?? '');
			policy.onUnsafeHtml?.({ characters: (value as string).length });
		}
		if (key === 'class' || key === 'className') value = normalizeClassValue(value);
		if (key === 'style') value = projectedStyle(value);
		if (
			key === 'value' &&
			tag === 'input' &&
			unwrap(props.type) === 'date' &&
			value instanceof Date
		)
			value = Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
		value = sanitizeUrlAttribute(key, value);
		if (value == null || value === false || (key === 'style' && value === '')) continue;
		const name = projectedAttributeName(key, tag);
		const safeName = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(name) ? name : 'data-exact-invalid-attr';
		result +=
			value === true
				? ` ${safeName}`
				: ` ${safeName}="${escapeProjectedText(String(value)).replaceAll('"', '&quot;')}"`;
	}
	return result;
}

function projectedStyle(value: unknown): string {
	if (typeof value === 'string') return value;
	if (!value || typeof value !== 'object') return '';
	const declarations: string[] = [];
	for (const [name, raw] of Object.entries(value)) {
		const property = unwrap(raw);
		if (property == null || property === false) continue;
		const css = name.startsWith('--')
			? name
			: (name.startsWith('ms') ? '-' : '') +
				name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
		declarations.push(`${css}: ${String(property)};`);
	}
	return declarations.join(' ');
}

function projectedAttributeName(name: string, tag: string): string {
	if (isNativeSrcdocProp(name)) return 'srcdoc';
	if (name === 'className') return 'class';
	if (name === 'commandFor') return 'commandfor';
	if (tag === 'script') {
		switch (name) {
			case 'crossOrigin':
			case 'fetchPriority':
			case 'noModule':
			case 'referrerPolicy':
				return name.toLowerCase();
		}
	}
	return name;
}
