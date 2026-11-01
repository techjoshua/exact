import type { ResponseLimits } from './json.js';
import { responseResourceBudget, responseGraphLimits } from '../response-resources.js';
import { encodeReactiveProtocolValue } from '@exactjs/core';
import type { ExactStreamEvent } from '@exactjs/core/framework/operation-protocol';
import { hasOnlyKeys, isDecodedProtocolSafe } from '../validation.js';

/** Trusted operation-local observer; wire identities never select an arbitrary component. */
export interface ExactProgressObserver {
	readonly receivers: readonly string[];
	report(receiver: string, snapshot: unknown): void;
	close(): void;
}

/** Validates a bounded snapshot envelope before any receiver is activated. */
export function isExactProgressEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'progress' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const event = value as Record<string, unknown>;
	const resources = limits.resources ?? responseResourceBudget(limits.logger);
	return (
		hasOnlyKeys(event, [
			'event',
			'version',
			'index',
			'type',
			'id',
			'opId',
			'receiver',
			'snapshot'
		]) &&
		event.event === 'progress' &&
		event.version === 1 &&
		Number.isInteger(event.index) &&
		(event.type === 'invoke' || event.type === 'refresh') &&
		typeof event.id === 'string' &&
		!!event.id &&
		(event.opId === undefined || typeof event.opId === 'string') &&
		typeof event.receiver === 'string' &&
		!!event.receiver &&
		Object.hasOwn(event, 'snapshot') &&
		isDecodedProtocolSafe(
			event.snapshot,
			responseGraphLimits(limits, resources, 'progress snapshot', {
				depth: 32,
				nodes: 10_000,
				bytes: 64 * 1024
			})
		) &&
		checkSnapshotBytes(event.snapshot)
	);
	function checkSnapshotBytes(snapshot: unknown): boolean {
		resources(
			'maxBytes',
			limits.maxBytes,
			64 * 1024,
			new TextEncoder().encode(
				JSON.stringify(encodeReactiveProtocolValue(snapshot, { maxDepth: Number.MAX_SAFE_INTEGER }))
			).byteLength,
			'progress snapshot',
			'encoded UTF-8 bytes'
		);
		return true;
	}
}
