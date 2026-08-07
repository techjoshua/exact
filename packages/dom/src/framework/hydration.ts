import {
	UnsafeHtml,
	isVNode,
	normalizeClassValue,
	sanitizeUrlAttribute,
	unwrap
} from '@exactjs/core';
import { namespaceForTag } from '../namespace.js';

/** DOM representation of the partition discriminator encoded in SSR marker attributes. */
export type ExactDomPartitionDiscriminator =
	| Readonly<{ kind: 'single' }>
	| Readonly<{ kind: 'branch'; branch: string }>
	| Readonly<{ kind: 'keyed'; list: string; keyToken: string }>;

/** Reads and validates the partition discriminator encoded on an SSR marker element. */
export function readExactPartitionDiscriminator(
	marker: Element
): ExactDomPartitionDiscriminator | undefined {
	const kind = marker.getAttribute('data-exact-partition-discriminator');
	if (kind === 'single') return Object.freeze({ kind });
	if (kind === 'branch') {
		const branch = marker.getAttribute('data-exact-partition-branch');
		return branch ? Object.freeze({ kind, branch }) : undefined;
	}
	if (kind === 'keyed') {
		const list = marker.getAttribute('data-exact-partition-list');
		const keyToken = marker.getAttribute('data-exact-partition-key');
		return list && keyToken ? Object.freeze({ kind, list, keyToken }) : undefined;
	}
	return undefined;
}

type StaticAttribute = Readonly<{ name: string; value: string | true | undefined }>;

function staticAttributes(
	props: Readonly<Record<string, unknown>>,
	allowUnsafeHtml: boolean
): StaticAttribute[] | undefined {
	const output: StaticAttribute[] = [];
	for (const [name, value] of Object.entries(props)) {
		if (name === 'key' || name === 'children' || name === 'ref' || /^on[A-Z]/.test(name)) continue;
		const normalized = staticHydrationAttributeValue(name, value, allowUnsafeHtml);
		if ((normalized !== null && typeof normalized === 'object') || typeof normalized === 'function')
			return undefined;
		output.push({
			name: name === 'className' ? 'class' : name,
			value:
				normalized === false || normalized === null || normalized === undefined
					? undefined
					: normalized === true
						? true
						: String(sanitizeUrlAttribute(name, normalized))
		});
	}
	return output;
}

/** Reports whether an intrinsic element has exactly the static attributes described by a VNode. */
export function matchesStaticHydrationAttributes(
	element: Element,
	props: Readonly<Record<string, unknown>>,
	allowUnsafeHtml: boolean
): boolean {
	const expected = staticAttributes(props, allowUnsafeHtml);
	if (!expected) return false;
	const present = new Set<string>();
	for (const attribute of expected) {
		if (attribute.value === undefined) {
			if (element.hasAttribute(attribute.name)) return false;
			continue;
		}
		present.add(attribute.name);
		if (attribute.value === true) {
			if (!element.hasAttribute(attribute.name)) return false;
		} else if (element.getAttribute(attribute.name) !== attribute.value) return false;
	}
	return Array.from(element.attributes).every((attribute) => present.has(attribute.name));
}

/** Applies an exact static VNode attribute set without installing reactive ownership. */
export function applyStaticHydrationAttributes(
	element: Element,
	props: Readonly<Record<string, unknown>>,
	allowUnsafeHtml: boolean
): boolean {
	const expected = staticAttributes(props, allowUnsafeHtml);
	if (!expected) return false;
	const present = new Set<string>();
	for (const attribute of expected) {
		if (attribute.value === undefined) element.removeAttribute(attribute.name);
		else {
			present.add(attribute.name);
			element.setAttribute(attribute.name, attribute.value === true ? '' : attribute.value);
		}
	}
	for (const attribute of Array.from(element.attributes))
		if (!present.has(attribute.name)) element.removeAttribute(attribute.name);
	return true;
}

/** Creates an intrinsic element and applies the static hydration attribute contract. */
export function createStaticHydrationElement(
	tag: string,
	parent: Element | undefined,
	props: Readonly<Record<string, unknown>>,
	allowUnsafeHtml: boolean
): Element | undefined {
	const namespace = namespaceForTag(tag, parent);
	const element =
		namespace && namespace !== 'http://www.w3.org/1999/xhtml'
			? document.createElementNS(namespace, tag)
			: document.createElement(tag);
	return applyStaticHydrationAttributes(element, props, allowUnsafeHtml) ? element : undefined;
}

function staticHydrationAttributeValue(
	name: string,
	value: unknown,
	allowUnsafeHtml: boolean
): unknown {
	if (name === 'className' || name === 'class') return normalizeClassValue(value);
	if (name !== 'srcdoc' && name !== 'srcDoc') return value;
	const candidate = unwrap(value);
	if (!isVNode(candidate) || candidate.type !== UnsafeHtml)
		throw new Error(
			'Native eXact iframe srcdoc requires unsafeHtml() and explicit allowUnsafeHtml hydration opt-in.'
		);
	if (!allowUnsafeHtml)
		throw new Error(
			'unsafeHtml() used for iframe srcdoc requires allowUnsafeHtml: true on the native eXact hydration root.'
		);
	return String(unwrap(candidate.props.value) ?? '');
}
