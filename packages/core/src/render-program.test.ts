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
	version: 3 as const,
	id,
	namespace: 'html' as const,
	template: '<p></p>',
	parts: ['<p>', '</p>'],
	slots: [['text', 'value', [0]]] as const,
	bindings: [['text', 0]] as const,
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
					['text', 'first', [0]],
					['text', 'second', [1]]
				] as const,
				bindings: [
					['text', 0],
					['text', 1]
				] as const
			}),
			(index) => (index === 0 ? 'first' : 'second')
		);
		const invocation = readRenderProgram(vnode)!;
		expect(readRenderProgramSlot(invocation, 0)).toBe('first');
		expect(readRenderProgramSlot(invocation, 1)).toBe('second');
	});

	it('joins readers to the exact compiler-registered descriptor without cloning it', () => {
		const descriptor = program('prepared');
		const prepared = prepareCompiledRenderProgram(descriptor);
		const vnode = createPreparedRenderProgram(prepared, [() => 'value']);
		const invocation = readRenderProgram(vnode)!;
		expect(prepared).toBe(descriptor);
		expect(invocation.program).toBe(prepared);
		expect(compiledRenderProgramCacheSize()).toBe(0);
		expect(readRenderProgramSlot(invocation, 0)).toBe('value');
	});

	it('rejects ordinary VNodes without interpreting their props as a render program', () => {
		const prepared = prepareCompiledRenderProgram(program('prepared'));
		const vnode = {
			type: 'span',
			props: { program: prepared, readers: [() => 'value'] },
			children: []
		};
		expect(readRenderProgram(vnode)).toBeUndefined();
	});
});
