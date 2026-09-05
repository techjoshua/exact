import { unwrap } from '@exactjs/core';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import type { Mounted } from '../../types.js';

/** Binds one compiler-selected text node to its reactive source. */
export function bindText(mounted: Mounted, value: unknown): void {
	mounted.stop?.();
	const node = mounted.dom as CharacterData;
	mounted.stop = watchRetained(
		() => {
			const text = String(unwrap(value) ?? '');
			if (node.data !== text) node.data = text;
		},
		undefined,
		{ scope: mounted.scope, onRelease: () => (mounted.stop = undefined) }
	);
}
