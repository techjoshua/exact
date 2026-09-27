import type { ExactContinuationStatePathContract } from '@exactjs/core/framework/component-contracts';

/**
 * Creates request-local containers for write-only paths omitted from the read snapshot.
 * Existing values are retained. Only compiler-declared parents are created, so unrelated
 * client values never need to cross the transport merely to support a nested assignment.
 */
export function prepareContinuationWriteContainers(
	state: Record<string, unknown>,
	writes: readonly ExactContinuationStatePathContract[]
): void {
	for (const write of writes) {
		if (write.kind !== 'write' || write.confidence !== 'exact' || write.path === '*') continue;
		const segments = write.path.split('.');
		if (
			segments.some(
				(segment) => !segment || ['__proto__', 'constructor', 'prototype'].includes(segment)
			)
		)
			throw new TypeError('Unsafe continuation write path');
		let cursor = state;
		for (let index = 0; index < segments.length - 1; index++) {
			const segment = segments[index]!;
			if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
			const value = cursor[segment];
			if (!value || typeof value !== 'object') break;
			cursor = value as Record<string, unknown>;
		}
	}
}
