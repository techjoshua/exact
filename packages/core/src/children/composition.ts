import { unwrap } from '@exactjs/reactive/framework/values';
import type { AnyAuthoredComponentFunction, Child } from '../component/contracts.js';
import { exactComponentIdentity, isExactComponent } from '../component-contracts.js';
import {
	readCompiledComponentReceipt,
	readPreparedServerComponentReference
} from '../component-abi/receipt.js';
import {
	readComposableIntrinsicReceipt,
	withIntrinsicReceiptChildren
} from '../component-abi/intrinsic-receipt.js';

const textKind = Symbol.for('@exactjs/children/text');

/** Selectors for renderable scalar children. Strings and numbers both render as text. */
export const childKinds = Object.freeze({ text: textKind });

/** An intrinsic tag, compiler-branded component, text selector, or ordered group of selectors. */
export type ChildSelector =
	| string
	| AnyAuthoredComponentFunction
	| typeof textKind
	| readonly ChildSelector[];

/** Source-ordered immediate children, assigned once to the first matching named partition. */
export type ChildPartitions<Selectors extends Record<string, ChildSelector>> = {
	readonly [Key in keyof Selectors]: readonly Child[];
} & { readonly remaining: readonly Child[] };

/**
 * Partitions immediate children without mounting them or traversing elements, components, or fragments.
 * Arrays are flattened and empty values omitted. Reactive inputs are read in the caller's scope.
 * The reserved name `remaining` cannot be used as a selector. Cost is O(children × selectors).
 * @exact pure
 */
export function partitionChildren<Selectors extends Record<string, ChildSelector>>(
	children: unknown,
	selectors: Selectors
): ChildPartitions<Selectors> {
	const entries = Object.entries(selectors);
	if (Object.hasOwn(selectors, 'remaining'))
		throw new TypeError('remaining is reserved for unmatched children');
	const result: Record<string, Child[]> & { remaining: Child[] } = Object.assign(
		Object.create(null),
		{ remaining: [] }
	);
	for (const [name] of entries) result[name] = [];
	result.remaining = [];
	for (const child of immediateChildren(children)) {
		const match = entries.find(([, selector]) => matchesChild(child, selector));
		result[match ? match[0] : 'remaining']!.push(child);
	}
	for (const values of Object.values(result)) Object.freeze(values);
	return Object.freeze(result) as ChildPartitions<Selectors>;
}

/** Reads an intrinsic's immediate children without evaluating a component or mounting its output.
 * @exact pure
 */
export function childrenOf(element: unknown): readonly Child[] {
	const data = readComposableIntrinsicReceipt(unwrap(element));
	if (!data) throw new TypeError('childrenOf requires a composable intrinsic element');
	return Object.freeze(immediateChildren(data.children));
}

/**
 * Derives an intrinsic operation with replacement children, retaining its attributes, bindings,
 * key, domain, refs, and enhancements. Neither the original operation nor its children are mutated.
 * This does not relocate an already-mounted instance between rendering locations.
 * @exact pure
 */
export function withChildren(element: unknown, children: unknown): Child {
	return withIntrinsicReceiptChildren(unwrap(element), immediateChildren(children));
}

/** Normalizes only array and reactive-value containers; explicit fragments remain opaque. */
function immediateChildren(input: unknown): Child[] {
	const result: Child[] = [];
	const append = (value: unknown): void => {
		value = unwrap(value);
		if (Array.isArray(value)) for (const child of value) append(child);
		else if (value !== null && value !== undefined && typeof value !== 'boolean')
			result.push(value as Child);
	};
	append(input);
	return result;
}

function matchesChild(child: Child, selector: ChildSelector): boolean {
	if (Array.isArray(selector)) return selector.some((entry) => matchesChild(child, entry));
	if (selector === textKind) return typeof child === 'string' || typeof child === 'number';
	if (typeof selector === 'string') return readComposableIntrinsicReceipt(child)?.tag === selector;
	if (typeof selector !== 'function' || !isExactComponent(selector)) return false;
	const component =
		readCompiledComponentReceipt(child) ?? readPreparedServerComponentReference(child);
	return component?.contract.artifact.id === exactComponentIdentity(selector);
}
