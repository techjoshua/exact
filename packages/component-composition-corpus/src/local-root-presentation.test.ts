import '@exactjs/dom/runtime/target';
import '@exactjs/core/runtime/refs';
import { describe, expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { renderCompiledComponentRoot } from '../../dom/src/framework/component-root.js';
import { unmount } from '@exactjs/dom';
import {
	localRoots,
	localParentRoot,
	localTextRoot,
	localTextOwner,
	localRangeRoot
} from './scenarios/local-root-presentation.fixtures.js';

describe('local component root presentation', () => {
	it('keeps nested target placement local to its component', () => {
		localRoots.length = 0;
		const container = document.createElement('div');
		try {
			renderCompiledComponentRoot(localParentRoot, container);
			expect(localRoots[0]!.current).toBe(container.querySelector('main'));
			expect(localRoots[1]!.current).toBe(container.querySelector('button'));
		} finally {
			unmount(container);
		}
	});
	it('publishes Text identity and preserves it across scalar changes', () => {
		localRoots.length = 0;
		const container = document.createElement('div');
		try {
			renderCompiledComponentRoot(localTextRoot, container);
			const root = localRoots[0]!;
			const text = root.current;
			expect(text).toBeInstanceOf(Text);
			const generation = root.generation;
			localTextOwner.state.value = 'after';
			flushSync();
			expect(root.current).toBe(text);
			expect(root.generation).toBe(generation);
			expect(container.textContent).toBe('after');
		} finally {
			unmount(container);
		}
	});
	it('exposes a logical range for several text nodes', () => {
		localRoots.length = 0;
		const container = document.createElement('div');
		try {
			renderCompiledComponentRoot(localRangeRoot, container);
			const root = localRoots[0]!.current as { kind: string; nodes: readonly Node[] };
			expect(root.kind).toBe('range');
			expect(root.nodes.every((node) => node instanceof Text)).toBe(true);
			expect(root.nodes.map((node) => node.textContent).join('')).toBe('firstsecond');
		} finally {
			unmount(container);
		}
	});
});
