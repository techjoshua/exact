import type { Child } from '@exactjs/core';
import { isOpaqueOperation, opaqueOperationKey } from '@exactjs/core/runtime/component-operations';
import { foreignChildCapability } from './foreign-child-capability.js';

/** Rejects ambiguous authored sibling identity before mounting any child resources. */
export function assertUniqueChildKeys(children: readonly Child[]): void {
	const keys = new Set<string>();
	for (const child of children) {
		const key = isOpaqueOperation(child)
			? opaqueOperationKey(child)
			: foreignChildCapability()?.key(child);
		if (key === undefined) continue;
		if (keys.has(key)) throw new Error(`Duplicate key "${key}" in rendered children`);
		keys.add(key);
	}
}
