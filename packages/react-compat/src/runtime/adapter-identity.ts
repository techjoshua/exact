import type { AnyComponentFunction } from '@exactjs/core';
import { createExactCompatibilityArtifact } from '@exactjs/core/framework/component-contracts';

let nextCompatibilityAdapterId = 0;

/** Brands one generated React adapter with a unique compiler-compatible client identity. */
export function markCompatibilityAdapter<T extends AnyComponentFunction>(adapter: T): T {
	return createExactCompatibilityArtifact(
		adapter,
		`@exactjs/react-compat:adapter:${++nextCompatibilityAdapterId}`,
		'client'
	);
}
