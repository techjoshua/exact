import { TargetOverrides } from '@exactjs/core';
import {
	mergeTargetClassContributions,
	mergeTargetTokenContributions
} from '@exactjs/core/framework/target-contributions';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';

const tokenListProps = new Set([
	'aria-describedby',
	'aria-labelledby',
	'aria-controls',
	'aria-owns',
	'aria-flowto',
	'rel'
]);

/** Composes one semantic-target layer with authored and nearest-owner precedence. */
export function composeTargetProps(
	base: Readonly<Record<string, unknown>>,
	layer: Readonly<Record<string, unknown>>
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...base };
	delete (result as Record<PropertyKey, unknown>)[TargetOverrides];
	const overrideValue = unwrap((layer as Readonly<Record<PropertyKey, unknown>>)[TargetOverrides]);
	const overrides = new Set(
		Array.isArray(overrideValue)
			? overrideValue.filter((key): key is string => typeof key === 'string')
			: []
	);
	for (const key of new Set([...Object.keys(base), ...Object.keys(layer)])) {
		if (key === 'children' || key === 'key' || key === 'ref' || /^on[A-Z]/.test(key)) continue;
		const authored = unwrap(base[key]);
		const contributed = unwrap(layer[key]);
		if (overrides.has(key)) result[key] = contributed;
		else if (key === 'class' || key === 'className')
			result[key] = mergeTargetClassContributions([authored, contributed]);
		else if (tokenListProps.has(key))
			result[key] = mergeTargetTokenContributions([authored, contributed]);
		else if (key === 'style' && isRecord(contributed) && isRecord(authored))
			result[key] = { ...contributed, ...authored };
		else result[key] = authored !== undefined ? authored : contributed;
	}
	return result;
}

/** Applies each active operation-owned target layer to the first intrinsic it reaches. */
export function consumeTargetReceiptLayers(
	context: SsrContext,
	props: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
	const layers = context.targetReceiptLayers;
	if (!layers?.length) return props;
	let effective = props;
	for (let index = layers.length - 1; index >= 0; index--) {
		const layer = layers[index]!;
		if (layer.consumed) continue;
		layer.consumed = true;
		effective = composeTargetProps(effective, layer.props);
	}
	return effective;
}

/** Captures active target-layer consumption before a scheduled render attempt. */
export function checkpointTargetReceiptLayers(context: SsrContext): readonly boolean[] {
	return (context.targetReceiptLayers ?? []).map((layer) => layer.consumed);
}

/** Restores target-layer consumption when a scheduled render attempt is retried or rejected. */
export function restoreTargetReceiptLayers(
	context: SsrContext,
	checkpoint: readonly boolean[]
): void {
	const layers = context.targetReceiptLayers ?? [];
	for (let index = 0; index < checkpoint.length && index < layers.length; index++) {
		layers[index]!.consumed = checkpoint[index]!;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
