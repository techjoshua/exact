import { unwrap } from '@exactjs/core';
import { isReactiveValue } from '@exactjs/reactive/framework/values';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import { reconcileSelectText } from '../../controlled-select.js';
import type { Mounted } from '../../types.js';

/** Binds one compiler-selected text node, fencing initial acquisition writes when supplied. */
export function bindText(mounted: Mounted, value: unknown, initialCurrent?: () => boolean): void {
	mounted.stop?.();
	mounted.scalarSource = value;
	const node = mounted.dom as CharacterData;
	if (!isReactiveValue(value)) {
		mounted.stop = undefined;
		const text = String(value ?? '');
		if ((!initialCurrent || initialCurrent()) && node.data !== text) {
			node.data = text;
			if (node.parentNode) reconcileSelectText(undefined, node.parentNode);
		}
		return;
	}
	let acquiring = true;
	mounted.stop = watchRetained(
		() => {
			const text = String(unwrap(value) ?? '');
			if ((!acquiring || !initialCurrent || initialCurrent()) && node.data !== text) {
				node.data = text;
				if (node.parentNode) reconcileSelectText(undefined, node.parentNode);
			}
		},
		undefined,
		{ scope: mounted.scope, onRelease: () => (mounted.stop = undefined) }
	);
	acquiring = false;
}
