import { boundedString, record } from './protocol-value-shapes.js';
import type { ExactRuntimeSourceEntity } from './identity.js';
import {
	boundedJson,
	everyCatalogEntry,
	hasValueField,
	catalogArray
} from './catalog-validation-primitives.js';

/**
 * Validates source entities with a shared root-wide identity and count budget.
 * Explicit array frames avoid native call-stack limits and reject sparse arrays.
 * Traversal takes work proportional to visited entities and their validated metadata,
 * with O(tree depth) frame storage.
 */
export function validSourceEntities(
	values: readonly unknown[],
	path: string,
	hash: string,
	ids: Set<string>,
	count: () => boolean
): boolean {
	if (!catalogArray(values)) return false;
	const frames = [{ values, index: 0 }];
	while (frames.length) {
		const frame = frames[frames.length - 1]!;
		if (frame.index >= frame.values.length) {
			frames.pop();
			continue;
		}
		const index = frame.index++;
		const descriptor = Object.getOwnPropertyDescriptor(frame.values, index);
		if (!descriptor || !('value' in descriptor)) return false;
		const entity = descriptor.value;
		if (!validEntity(entity, path, hash, ids, count)) return false;
		if (entity.children.length) frames.push({ values: entity.children, index: 0 });
	}
	return true;
}

/** Validates one source record before entering its descendants. */
function validEntity(
	value: unknown,
	path: string,
	hash: string,
	ids: Set<string>,
	count: () => boolean
): value is ExactRuntimeSourceEntity {
	if (
		!count() ||
		!record(value) ||
		hasValueField(value) ||
		!boundedString(value.id, 1024) ||
		ids.has(value.id) ||
		!boundedString(value.kind, 128) ||
		(value.name !== undefined && !boundedString(value.name, 512)) ||
		!validLocation(value.location, path, hash) ||
		(value.classification !== undefined &&
			(!record(value.classification) || !boundedJson(value.classification, 0))) ||
		!Array.isArray(value.reasons) ||
		value.reasons.length > 1_000 ||
		!catalogArray(value.children) ||
		value.children.length > 10_000
	)
		return false;
	ids.add(value.id);
	if (
		!everyCatalogEntry(
			value.reasons,
			(reason) =>
				record(reason) &&
				!hasValueField(reason) &&
				boundedString(reason.code, 256) &&
				boundedString(reason.summary, 4_096) &&
				validLocation(reason.location, path, hash)
		)
	)
		return false;
	return true;
}

function validLocation(value: unknown, path: string, hash: string): boolean {
	if (
		!record(value) ||
		value.path !== path ||
		value.sourceHash !== hash ||
		!validPoint(value.start) ||
		!validPoint(value.end)
	)
		return false;
	return value.start.offset <= value.end.offset;
}

function validPoint(value: unknown): value is { offset: number; line: number; column: number } {
	return (
		record(value) &&
		Number.isSafeInteger(value.offset) &&
		(value.offset as number) >= 0 &&
		Number.isSafeInteger(value.line) &&
		(value.line as number) > 0 &&
		Number.isSafeInteger(value.column) &&
		(value.column as number) > 0
	);
}
