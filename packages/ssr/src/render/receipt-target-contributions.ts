import { composeTargetProps } from '@exactjs/core/framework/target-contributions';
import type { SsrContext } from '../types.js';
export { composeTargetProps } from '@exactjs/core/framework/target-contributions';

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
