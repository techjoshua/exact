import { createCompiledVNode, createDynamicChild } from '@exactjs/core/runtime/render';
import { describe, expect, it } from 'vitest';
import type { SsrContext } from '../types.js';
import { createVNode } from '../test-support/native-vnode.js';
import { canRenderSsrSubtreeSynchronously } from './sync-fast-path.js';

const context = { enhancementCatalog: undefined } as SsrContext;

describe('async SSR synchronous subtree selection', () => {
	it('accepts finite intrinsic and compiled-cell trees without evaluating their children', () => {
		const tree = createCompiledVNode(
			'svg',
			null,
			createCompiledVNode('path', { d: 'M0 0' }),
			createVNode('title', null, 'Static')
		);

		expect(canRenderSsrSubtreeSynchronously(context, tree)).toBe(true);
	});

	it('rejects structural and component boundaries that may introduce asynchronous work', () => {
		let reads = 0;
		const dynamic = createDynamicChild(() => {
			reads++;
			return 'value';
		});
		function Child() {
			return () => null;
		}

		expect(canRenderSsrSubtreeSynchronously(context, dynamic)).toBe(false);
		expect(canRenderSsrSubtreeSynchronously(context, createVNode(Child, {}))).toBe(false);
		expect(reads).toBe(0);
	});
});
