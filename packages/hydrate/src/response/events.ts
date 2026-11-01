import type { ResponseLimits } from './json.js';
import { responseResourceBudget, responseGraphLimits } from '../response-resources.js';
import type { ExactStreamEvent } from '@exactjs/core/framework/operation-protocol';
import { isStateOutputPathList } from '@exactjs/core/framework/protocol-records';
import { hasOnlyKeys, isDecodedProtocolSafe } from '../validation.js';
import { isCollectionMutationLike, isPatchLike } from './patch-validation.js';

/** Reports whether exact stream start event. */
export function isExactStreamStartEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'start' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
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
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'result' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
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
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'patch' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'type', 'id', 'opId', 'patch']) &&
		record.event === 'patch' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'invoke' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		isPatchLike(record.patch)
	);
}

/** Reports whether exact stream state event. */
export function isExactStreamStateEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'state' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, [
			'event',
			'version',
			'index',
			'type',
			'id',
			'opId',
			'value',
			'statePaths'
		]) &&
		record.event === 'state' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'invoke' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		'value' in record &&
		record.value !== undefined &&
		(!('statePaths' in record) || isStateOutputPathList(record.statePaths))
	);
}

/** Reports whether an exact stream event contains ordered collection deltas. */
export function isExactStreamMutationsEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'mutations' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'type', 'id', 'opId', 'mutations']) &&
		record.event === 'mutations' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'invoke' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		Array.isArray(record.mutations) &&
		record.mutations.every((value) => isCollectionMutationLike(value, limits))
	);
}

/** Reports whether exact stream html event. */
export function isExactStreamHtmlEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'html' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'index', 'type', 'id', 'opId', 'html']) &&
		record.event === 'html' &&
		record.version === 1 &&
		typeof record.index === 'number' &&
		(record.type === 'invoke' || record.type === 'refresh') &&
		typeof record.id === 'string' &&
		!!record.id &&
		(record.opId === undefined || typeof record.opId === 'string') &&
		typeof record.html === 'string'
	);
}

/** Reports whether exact stream complete event. */
export function isExactStreamCompleteEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'complete' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version']) && record.event === 'complete' && record.version === 1
	);
}

/** Reports whether an exact stream event carries observations owned by this response. */
export function isExactStreamObservationsEvent(
	value: unknown,
	limits: ResponseLimits = {}
): value is Extract<ExactStreamEvent, { event: 'observations' }> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'stream event'
			)
		)
	)
		return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['event', 'version', 'observations']) &&
		record.event === 'observations' &&
		record.version === 1 &&
		Array.isArray(record.observations)
	);
}
