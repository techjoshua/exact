import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child } from '../component/contracts.js';
import { readSuppliedTargetValue } from '../framework/prepared-target-output.js';
import { composeTargetProps } from '../framework/target-contributions.js';
import { readCompiledFragmentReceipt } from './fragment-receipt.js';
import { readCompiledIntrinsicReceipt } from './intrinsic-receipt.js';
import { readCompiledTargetReceipt } from './target-receipt.js';
import { readCompiledKeyedChildReceipt } from './keyed-child-receipt.js';
import { readChildRangeReceipt } from './child-range-receipt.js';
import { readPreparedServerChildRange } from './server-child-range.js';
import {
	projectedAttributes,
	escapeProjectedText,
	projectedVoidTags,
	type TextProjectionPolicy
} from './text-projection-markup.js';

/** Renderer-owned resolver for prepared component and program output within the same text projection. */
export type PreparedTextResolver = (
	value: unknown,
	project: (children: readonly Child[]) => string
) => string | undefined;

type Layer = { props: Readonly<Record<string, unknown>>; consumed: boolean };

/**
 * Projects prepared intrinsic, fragment, and contribution operations into host text.
 * Reads reactive values without mounting elements, fulfilling refs, or installing listeners.
 * Unprepared component/enhancement operations must be resolved by their owning renderer first.
 * The caller escapes the returned text once when embedding it in an HTML text-only host.
 */
export function projectPreparedText(
	children: readonly Child[],
	policy: TextProjectionPolicy = {},
	resolve?: PreparedTextResolver
): string {
	return projectChildren(children, [], false, policy, resolve);
}

function projectChildren(
	children: readonly Child[],
	layers: Layer[],
	markup: boolean,
	policy: TextProjectionPolicy,
	resolve?: PreparedTextResolver
): string {
	let result = '';
	for (const child of children)
		result += projectChild(unwrap(child), layers, markup, policy, resolve);
	return result;
}

function projectChild(
	value: unknown,
	layers: Layer[],
	markup: boolean,
	policy: TextProjectionPolicy,
	resolve?: PreparedTextResolver
): string {
	if (value == null || typeof value === 'boolean') return '';
	if (typeof value === 'string' || typeof value === 'number')
		return markup ? escapeProjectedText(String(value)) : String(value);
	if (Array.isArray(value)) return projectChildren(value, layers, markup, policy, resolve);
	const prepared = resolve?.(value, (output) =>
		projectChildren(output, layers, markup, policy, resolve)
	);
	if (prepared !== undefined) return prepared;
	const range = readChildRangeReceipt(value);
	if (range && !range.dynamicComponent)
		return projectChild(unwrap(range.value), layers, markup, policy, resolve);
	const serverRange = readPreparedServerChildRange(value);
	if (serverRange) return projectChild(unwrap(serverRange.value), layers, markup, policy, resolve);
	const keyed = readCompiledKeyedChildReceipt(value);
	if (keyed) return projectChild(unwrap(keyed.value), layers, markup, policy, resolve);
	const target = readCompiledTargetReceipt(value);
	if (target) {
		const directFragment = readCompiledFragmentReceipt(readSuppliedTargetValue(target.children));
		const own = (directFragment ? [] : (target.contributions ?? [{ props: target.props }])).map(
			({ props }) => ({
				props,
				consumed: false
			})
		);
		return projectChildren(target.children, [...layers, ...own], markup, policy, resolve);
	}
	const fragment = readCompiledFragmentReceipt(value);
	if (fragment && !fragment.enhancement)
		return projectChildren(fragment.children, layers, markup, policy, resolve);
	const intrinsic = readCompiledIntrinsicReceipt(value);
	if (intrinsic && !intrinsic.enhancement) {
		let props = intrinsic.props;
		for (let index = layers.length - 1; index >= 0; index--) {
			const layer = layers[index]!;
			if (layer.consumed) continue;
			layer.consumed = true;
			props = composeTargetProps(props, layer.props);
		}
		const tag = intrinsic.tag;
		const opening = `<${tag}${projectedAttributes(props, tag, policy)}>`;
		if (projectedVoidTags.has(tag)) return opening;
		const textHost = tag === 'title' || tag === 'textarea';
		const rawHost = tag === 'script' || tag === 'style';
		const content = projectChildren(
			intrinsic.children,
			layers,
			!textHost && !rawHost,
			policy,
			resolve
		);
		const prefix = tag === 'textarea' && content.startsWith('\n') ? '\n' : '';
		return `${opening}${prefix}${textHost ? escapeProjectedText(content) : content}</${tag}>`;
	}
	throw new TypeError('Text projection requires prepared intrinsic, fragment, or target output');
}
