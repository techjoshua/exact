import { describe, expect, it } from 'vitest';
import { computed, flushSync, reactive, unwrap } from '@exactjs/reactive';
import { createForwardedExpression } from './component/reactive-vnodes.js';
import { createExactFrameworkFixtureArtifact } from './component-contract/runtime-artifacts.js';
import {
	createCompiledComponentVNode,
	createCompiledVNode,
	createVNode,
	isCellVNode,
	keyCompiledVNode
} from './vnode.js';

describe('compiled reactive expression allocation', () => {
	it('forwards an existing reactive primitive without allocating another identity', () => {
		const source = computed(() => 'value');
		expect(createForwardedExpression(() => source)).toBe(source);
	});

	it('allocates a computed value when the forwarded input is not already reactive', () => {
		const state = reactive({ value: 'first' });
		const forwarded = createForwardedExpression(() => state.value);
		expect(unwrap(forwarded)).toBe('first');

		state.value = 'second';
		flushSync();
		expect(unwrap(forwarded)).toBe('second');
	});
});

describe('compiled vnode marker ownership', () => {
	it('leaves native component identity to the component boundary', () => {
		function Child() {
			return () => null;
		}
		createExactFrameworkFixtureArtifact(Child, 'fixture:vnode-expression:Child');

		expect(isCellVNode(createCompiledVNode(Child, null))).toBe(true);
		expect(isCellVNode(createCompiledComponentVNode(Child, null))).toBe(false);
		const vnode = createCompiledComponentVNode(Child, { label: 'ready' });
		expect(vnode.type).toBe(Child);
		expect(vnode.artifact).toBeDefined();
	});

	it('assigns inferred list identity to the unpublished compiler allocation', () => {
		const vnode = createVNode('li', null, 'row');

		expect(keyCompiledVNode(vnode, 42)).toBe(vnode);
		expect(vnode.key).toBe('42');
		expect(() => keyCompiledVNode(createVNode('li', null), undefined)).toThrow(
			'Compiled keyed lists require a key'
		);
	});

	it('rejects an uncompiled function at the compiler-only invocation boundary', () => {
		expect(() => createCompiledComponentVNode(() => () => null, null)).toThrow(
			'compiled component artifact'
		);
	});
});
