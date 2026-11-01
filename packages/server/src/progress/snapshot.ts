import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import type { ResponseResourceBudget } from '@exactjs/core/framework/protocol-records';
import type { ExactServerContext } from '../types.js';
import { isJsonSafe } from '../protocol.js';
import { responseResourceBudget, responseGraphLimits } from '../response-resources.js';

/** Captures valid transport data, applying response caps and warning-only snapshot thresholds. */
export function captureProgressSnapshot(
	snapshot: unknown,
	context: Pick<ExactServerContext, 'limits' | 'logger'> = {},
	resources: ResponseResourceBudget = responseResourceBudget(context.logger)
): unknown {
	const limits = responseGraphLimits(context.limits ?? {}, resources, 'progress snapshot', {
		depth: 32,
		nodes: 10_000,
		bytes: 64 * 1024
	});
	if (!isJsonSafe(snapshot, limits)) throw new TypeError('Invalid task progress snapshot');
	const encoded = encodeReactiveProtocolValue(snapshot, { maxDepth: Number.MAX_SAFE_INTEGER });
	if (!isJsonSafe(encoded, limits)) throw new TypeError('Invalid encoded task progress snapshot');
	const json = JSON.stringify(encoded);
	resources(
		'maxResponseBytes',
		context.limits?.maxResponseBytes,
		64 * 1024,
		new TextEncoder().encode(json).byteLength,
		'progress snapshot',
		'encoded UTF-8 bytes'
	);
	return decodeReactiveProtocolValue(JSON.parse(json), { maxDepth: Number.MAX_SAFE_INTEGER });
}
