import { describe, expect, it, vi } from 'vitest';
import {
	createCompiledIntrinsicReceipt,
	exactIntrinsicOperation,
	type ExactIntrinsicOperationTarget
} from './intrinsic-receipt.js';
import { executeOpaqueOperation } from './opaque-operation.js';
import { isOpaqueOperation } from './opaque-operation.js';
import {
	createPreparedServerComponentReference,
	readPreparedServerComponentReference
} from './receipt.js';
import {
	createPreparedServerChildRange,
	readPreparedServerChildRange
} from './server-child-range.js';
import {
	createPreparedServerKeyedChild,
	readPreparedServerKeyedChild
} from './server-keyed-child.js';
import { createExactCompiledDynamicBoundaryArtifact } from '../testing/runtime-artifacts.js';

describe('opaque target operations', () => {
	it('selects its target method without exposing a kind or topology to the caller', () => {
		const invoke = vi.fn((..._arguments: unknown[]) => 'mounted');
		const target: ExactIntrinsicOperationTarget<string> = {
			[exactIntrinsicOperation](operation, data) {
				return invoke(operation, data);
			}
		};
		const operation = createCompiledIntrinsicReceipt('p', { title: 'status' }, 'Ready');

		expect(executeOpaqueOperation<string>(operation, target)).toEqual({ value: 'mounted' });
		expect(invoke).toHaveBeenCalledWith(
			operation,
			expect.objectContaining({ tag: 'p', props: { title: 'status' }, children: ['Ready'] })
		);
		expect(executeOpaqueOperation({}, target)).toBeUndefined();
	});

	it('keeps compiler-closed server references off the opaque client operation path', () => {
		const Component = createExactCompiledDynamicBoundaryArtifact(
			function ServerComponent() {},
			'@exactjs/core:test-direct-server-reference',
			'server'
		);
		const props = { message: 'ready' };
		const reference = createPreparedServerComponentReference(Component, props);

		expect(isOpaqueOperation(reference)).toBe(false);
		expect(readPreparedServerComponentReference(reference)).toMatchObject({
			props,
			children: []
		});
		expect(readPreparedServerComponentReference(reference)?.props).toBe(props);
	});

	it('preserves direct server reference metadata while removing reserved props', () => {
		const Component = createExactCompiledDynamicBoundaryArtifact(
			function ServerComponent() {},
			'@exactjs/core:test-direct-server-reference-metadata',
			'server'
		);
		const enhancement = { type: 'fixture' };
		const source = { key: 42, __exactEnhancements: enhancement, message: 'ready' };
		const reference = createPreparedServerComponentReference(Component, source, 'child');
		const data = readPreparedServerComponentReference(reference);

		expect(data).toMatchObject({
			key: '42',
			enhancement,
			props: { message: 'ready' },
			children: ['child']
		});
		expect(data?.props).not.toBe(source);
		expect(data?.props).not.toHaveProperty('key');
		expect(data?.props).not.toHaveProperty('__exactEnhancements');
	});

	it('keeps compiler-closed server child ranges off the opaque client operation path', () => {
		const value = ['ready'];
		const range = createPreparedServerChildRange(value, 'fixture:range');

		expect(isOpaqueOperation(range)).toBe(false);
		expect(readPreparedServerChildRange(range)).toMatchObject({
			value,
			markerId: 'fixture:range',
			mayReplaceSubtree: true
		});
		expect(readPreparedServerChildRange(range)?.value).toBe(value);
	});

	it('keeps compiler-closed keyed children off the opaque client operation path', () => {
		const value = { label: 'ready' };
		const child = createPreparedServerKeyedChild(value, 42);

		expect(isOpaqueOperation(child)).toBe(false);
		expect(readPreparedServerKeyedChild(child)).toEqual({
			[Symbol.for('@exactjs/server/prepared-keyed-child')]: true,
			value,
			key: '42'
		});
		expect(readPreparedServerKeyedChild(child)?.value).toBe(value);
	});
});
