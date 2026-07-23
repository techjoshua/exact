import type { ExactStreamEvent } from '@exactjs/server';
import { hasOnlyKeys, isJsonSafe } from '../validation.js';
import { isPatchLike } from './result.js';

/** Reports whether exact stream start event. */
export function isExactStreamStartEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'start' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonSafe(value))
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'operations']) &&
		record.event === 'start' &&
		record.version === 1 &&
		typeof record.operations === 'number' &&
		Number.isInteger(record.operations) &&
		record.operations >= 0
	);
}

/** Reports whether exact stream result event. */
export function isExactStreamResultEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'result' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonSafe(value))
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'result']) &&
		record.event === 'result' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		Number.isInteger(record.index)
	);
}

/** Reports whether exact stream patch event. */
export function isExactStreamPatchEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'patch' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonSafe(value))
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'type', 'id', 'opId', 'patch']) &&
		record.event === 'patch' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'action' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		isPatchLike(record.patch)
	);
}

/** Reports whether exact stream state event. */
export function isExactStreamStateEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'state' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonSafe(value))
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'type', 'id', 'opId', 'value']) &&
		record.event === 'state' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'action' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		'value' in record &&
		record.value !== undefined
	);
}

/** Reports whether exact stream html event. */
export function isExactStreamHtmlEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'html' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonSafe(value))
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'type', 'id', 'opId', 'html']) &&
		record.event === 'html' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'action' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		typeof record.html === 'string'
	);
}

/** Reports whether exact stream complete event. */
export function isExactStreamCompleteEvent(
	value: unknown
): value is Extract<ExactStreamEvent, { event: 'complete' }> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonSafe(value))
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version']) && record.event === 'complete' && record.version === 1
	);
}
