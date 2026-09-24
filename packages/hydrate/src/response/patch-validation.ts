import type {
	ExactCollectionMutation,
	ExactPatch
} from '@exactjs/core/framework/operation-protocol';
import { isTransportableReactiveMapKey } from '@exactjs/core';
import { hasOnlyKeys, isJsonSafe } from '../validation.js';

/** Reports whether a decoded ordered collection delta has a valid protocol shape. */
export function isCollectionMutationLike(value: unknown): value is ExactCollectionMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (typeof record.path !== 'string' || !record.path) return false;
	switch (record.operation) {
		case 'map-set':
			return (
				hasOnlyKeys(record, ['path', 'operation', 'key', 'value']) &&
				isTransportableReactiveMapKey(record.key) &&
				'value' in record
			);
		case 'map-delete':
			return (
				hasOnlyKeys(record, ['path', 'operation', 'key']) &&
				isTransportableReactiveMapKey(record.key)
			);
		case 'map-clear':
		case 'set-clear':
			return hasOnlyKeys(record, ['path', 'operation']);
		case 'set-add':
		case 'set-delete':
			return hasOnlyKeys(record, ['path', 'operation', 'value']) && 'value' in record;
		default:
			return false;
	}
}

/** Reports whether patch like. */
export function isPatchLike(value: unknown): value is ExactPatch {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	if (!isJsonSafe(value)) return false;
	const record = value as Record<string, unknown>;
	if (typeof record.type !== 'string' || typeof record.id !== 'string' || !record.id) return false;
	switch (record.type) {
		case 'text':
			return hasOnlyKeys(record, ['type', 'id', 'value']) && typeof record.value === 'string';
		case 'prop':
			return (
				hasOnlyKeys(record, ['type', 'id', 'name', 'value']) &&
				typeof record.name === 'string' &&
				'value' in record &&
				record.value !== undefined
			);
		case 'style':
			return (
				hasOnlyKeys(record, ['type', 'id', 'name', 'value']) &&
				typeof record.name === 'string' &&
				(typeof record.value === 'string' || record.value === null)
			);
		case 'list':
			return (
				hasOnlyKeys(record, ['type', 'id', 'op', 'key', 'before', 'html']) &&
				(record.op === 'insert' || record.op === 'move' || record.op === 'remove') &&
				typeof record.key === 'string' &&
				(record.before === undefined || typeof record.before === 'string') &&
				(record.html === undefined || typeof record.html === 'string')
			);
		case 'state':
			return (
				hasOnlyKeys(record, ['type', 'id', 'value']) &&
				'value' in record &&
				record.value !== undefined
			);
		case 'replace':
			return hasOnlyKeys(record, ['type', 'id', 'html']) && typeof record.html === 'string';
		default:
			return false;
	}
}
