import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearCompiledRenderPrograms,
	compiledRenderProgramCacheSize,
	createCompiledRenderProgram,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram,
	readRenderProgram,
	readRenderProgramSlot
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

	it('reads compiler-combined slots through one dispatcher', () => {
		const vnode = createCompiledRenderProgram(
			'revision:combined',
			() => ({
				...program('combined'),
				parts: ['<p>', ':', '</p>'],
				slots: [
					{ id: 'first', kind: 'text' as const, path: [0] },
					{ id: 'second', kind: 'text' as const, path: [1] }
				]
			}),
			(index) => (index === 0 ? 'first' : 'second')
		);
		const invocation = readRenderProgram(vnode)!;
		expect(readRenderProgramSlot(invocation, 0)).toBe('first');
		expect(readRenderProgramSlot(invocation, 1)).toBe('second');
	});

	it('joins instance readers to a module-hoisted immutable descriptor', () => {
		const prepared = prepareCompiledRenderProgram('revision:prepared', program('prepared'));
		const reused = prepareCompiledRenderProgram('revision:prepared', program('ignored'));
		const vnode = createPreparedRenderProgram(prepared, [() => 'value']);
		const invocation = readRenderProgram(vnode)!;
		expect(reused).toBe(prepared);
		expect(invocation.program).toBe(prepared);
		expect(Object.isFrozen(invocation.program)).toBe(true);
		expect(readRenderProgramSlot(invocation, 0)).toBe('value');
	});
});
