import { encodeReactiveProtocolValue } from '@exactjs/core';
import type { ExactStreamEvent } from '@exactjs/core/framework/operation-protocol';
import { hasOnlyKeys, isJsonSafe } from '../validation.js';

/** Trusted operation-local observer; wire identities never select an arbitrary component. */
export interface ExactProgressObserver {
	readonly receivers: readonly string[];
	report(receiver: string, snapshot: unknown): void;
	close(): void;
}

/** Validates a bounded snapshot envelope before any receiver is activated. */
export function isExactProgressEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'progress' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const event = value as Record<string, unknown>;
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
		isJsonSafe(event.snapshot, { maxDepth: 32, maxNodes: 10_000, maxBytes: 64 * 1024 }) &&
		new TextEncoder().encode(JSON.stringify(encodeReactiveProtocolValue(event.snapshot)))
			.byteLength <=
			64 * 1024
	);
}
