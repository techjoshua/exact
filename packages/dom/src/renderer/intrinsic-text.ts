import { computed, isReactiveValue, unwrap } from '@exactjs/reactive/framework/runtime';
import type { Root } from '../types.js';
import type { Child } from '@exactjs/core';

/** Coalesces a text-only host into one DOM text binding, matching HTML parser text-node merging. */
export function intrinsicTextChildren(
	_root: Root,
	tag: string,
	children: readonly Child[]
): readonly Child[] {
	if (!['title', 'textarea', 'script', 'style'].includes(tag) || children.length < 2)
		return children;
	const read = () =>
		children
			.map((child) => {
				const value = unwrap(child);
				if (value === null || value === undefined || typeof value === 'boolean') return '';
				if (typeof value !== 'string' && typeof value !== 'number')
					throw new TypeError('Text-only elements require scalar children');
				return String(value);
			})
			.join('');
	return [children.some(isReactiveValue) ? computed(read) : read()];
}
