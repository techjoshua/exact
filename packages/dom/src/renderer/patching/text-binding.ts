import { unwrap } from '@exactjs/core';
import { isReactiveValue } from '@exactjs/reactive/framework/values';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import type { Mounted } from '../../types.js';

/** Binds one compiler-selected text node to its reactive source. */
export function bindText(mounted: Mounted, value: unknown): void {
	mounted.stop?.();
	mounted.scalarSource = value;
	const node = mounted.dom as CharacterData;
	if (!isReactiveValue(value)) {
		mounted.stop = undefined;
		const text = String(value ?? '');
		if (node.data !== text) node.data = text;
		return;
	}
	mounted.stop = watchRetained(
		() => {
			const text = String(unwrap(value) ?? '');
			if (node.data !== text) node.data = text;
		},
		undefined,
		{ scope: mounted.scope, onRelease: () => (mounted.stop = undefined) }
	);
}
