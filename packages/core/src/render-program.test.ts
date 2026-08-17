import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearCompiledRenderPrograms,
	compiledRenderProgramCacheSize,
	createCompiledRenderProgram
} from './render-program.js';
import { createVNode } from './vnode.js';

const fallback = () => createVNode('span', null);

const program = (id: string) => ({
	version: 1 as const,
	id,
	namespace: 'html' as const,
	template: '<p></p>',
	parts: ['<p>', '</p>'],
	slots: [{ id: 'value', kind: 'text' as const, path: [0] }],
	nodes: []
});

describe('compiled render-program cache', () => {
	beforeEach(clearCompiledRenderPrograms);

	it('shares immutable programs within a generation and supports explicit invalidation', () => {
		createCompiledRenderProgram('revision:1', () => program('first'), [() => 'a'], fallback);
		createCompiledRenderProgram('revision:1', () => program('ignored'), [() => 'b'], fallback);
		expect(compiledRenderProgramCacheSize()).toBe(1);
		clearCompiledRenderPrograms();
		expect(compiledRenderProgramCacheSize()).toBe(0);
	});

	it('bounds obsolete HMR revisions', () => {
		for (let revision = 0; revision < 2_100; revision++)
			createCompiledRenderProgram(
				`revision:${revision}`,
				() => program(String(revision)),
				[() => revision],
				fallback
			);
		expect(compiledRenderProgramCacheSize()).toBe(2_048);
	});
});
