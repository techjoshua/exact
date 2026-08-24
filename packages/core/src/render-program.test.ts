import { describe, expect, it } from 'vitest';
import {
	createPreparedRenderProgram,
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram,
	readRenderProgram,
	readRenderProgramSlot
} from './render-program.js';
import { RenderProgram } from './symbols.js';

const program = (id: string) => ({
	version: 4 as const,
	id,
	namespace: 'html' as const,
	template: '<p></p>',
	slots: [['text', 'value', [0]]] as const,
	bindings: [['text', 0]] as const,
	nodes: []
});

describe('compiled render programs', () => {
	it('shares the render-program discriminator across separately loaded artifacts', () => {
		expect(RenderProgram).toBe(Symbol.for('exact.render-program'));
	});

	it('reads compiler-combined slots through one dispatcher', () => {
		const descriptor = prepareCompiledRenderProgram({
			...program('combined'),
			slots: [
				['text', 'first', [0]],
				['text', 'second', [1]]
			] as const,
			bindings: [
				['text', 0],
				['text', 1]
			] as const
		});
		const vnode = createPreparedRenderProgram(
			descriptor,
			(index) => (index === 0 ? 'first' : 'second'),
			{}
		);
		const invocation = readRenderProgram(vnode)!;
		expect(readRenderProgramSlot(invocation, 0)).toBe('first');
		expect(readRenderProgramSlot(invocation, 1)).toBe('second');
	});

	it('joins readers to the exact compiler-registered descriptor without cloning it', () => {
		const descriptor = program('prepared');
		const prepared = prepareCompiledRenderProgram(descriptor);
		const vnode = createPreparedRenderProgram(prepared, [() => 'value'], {});
		const invocation = readRenderProgram(vnode)!;
		expect(prepared).toBe(descriptor);
		expect(invocation.program).toBe(prepared);
		expect(readRenderProgramSlot(invocation, 0)).toBe('value');
	});

	it('captures server slots eagerly in authored order', () => {
		const descriptor = prepareCompiledRenderProgram({
			...program('server-eager'),
			slots: [
				['text', 'first', [0]],
				['text', 'second', [1]]
			] as const,
			bindings: [
				['text', 0],
				['text', 1]
			] as const
		});
		const reads: number[] = [];
		const vnode = createPreparedServerRenderProgram(
			descriptor,
			(index) => {
				reads.push(index);
				return index === 0 ? 'first' : 'second';
			},
			2
		);
		const invocation = readRenderProgram(vnode)!;
		expect(reads).toEqual([0, 1]);
		expect(readRenderProgramSlot(invocation, 0)).toBe('first');
		expect(readRenderProgramSlot(invocation, 1)).toBe('second');
		expect(reads).toEqual([0, 1]);
	});

	it('rejects precompiled render programs from an incompatible ABI', () => {
		expect(() =>
			prepareCompiledRenderProgram({ ...program('obsolete'), version: 3 } as never)
		).toThrow('expected version 4');
	});

	it('carries a compiler-emitted property-group writer without evaluating slot readers', () => {
		const descriptor = prepareCompiledRenderProgram({
			...program('writer'),
			slots: [
				['property', 0, 'title'],
				['property', 0, 'tabIndex']
			] as const,
			bindings: [['properties', [0, 1]]] as const,
			nodes: [['node', 'button']] as const
		});
		const writer = (group: number, apply: (name: string, value: unknown) => void) => {
			expect(group).toBe(0);
			apply('title', 'compiled');
			apply('tabIndex', 2);
		};
		const vnode = createPreparedRenderProgram(
			descriptor,
			[
				() => {
					throw new Error('slot reader should not run');
				}
			],
			{},
			undefined,
			writer
		);
		const invocation = readRenderProgram(vnode)!;
		const target: Record<string, unknown> = {};
		invocation.propertyWriter!(0, (name, value) => (target[name] = value));
		expect(target).toEqual({ title: 'compiled', tabIndex: 2 });
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
