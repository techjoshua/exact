import { describe, expect, it, vi } from 'vitest';
import {
	createCompiledIntrinsicReceipt,
	exactIntrinsicOperation,
	type ExactIntrinsicOperationTarget
} from './intrinsic-receipt.js';
import {
	createOpaqueOperation,
	executeOpaqueOperation,
	opaqueOperationDomain,
	opaqueOperationKey
} from './opaque-operation.js';
import { isOpaqueOperation } from './opaque-operation.js';
import {
	createPreparedServerComponentReference,
	createPreparedServerComponentReferenceFromPlainProps,
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
import { createFrameworkComponentDomain, withComponentDomain } from '../component/domain.js';

describe('opaque target operations', () => {
	it('retains independent domains and snapshots authored keys without sharing mutable metadata', () => {
		const firstDomain = createFrameworkComponentDomain({ target: 'server', executionRoot: 'page' });
		const secondDomain = createFrameworkComponentDomain({
			target: 'server',
			executionRoot: 'page'
		});
		const first = createOpaqueOperation(undefined, { domain: firstDomain });
		const second = createOpaqueOperation(undefined, { domain: secondDomain });
		const metadata = { key: 'first', domain: firstDomain };
		const keyed = createOpaqueOperation(undefined, metadata);
		metadata.key = 'second';
		metadata.domain = secondDomain;
		expect(opaqueOperationDomain(first)).toBe(firstDomain);
		expect(opaqueOperationDomain(second)).toBe(secondDomain);
		expect(opaqueOperationDomain(keyed)).toBe(firstDomain);
		expect(opaqueOperationKey(first)).toBeUndefined();
		expect(opaqueOperationKey(second)).toBeUndefined();
		expect(opaqueOperationKey(keyed)).toBe('first');
	});

	it('keeps dispatch and payload identity immutable and absent from ordinary copies', () => {
		const first = createCompiledIntrinsicReceipt('p', { title: 'first' });
		const second = createCompiledIntrinsicReceipt('p', { title: 'second' });
		const target: ExactIntrinsicOperationTarget<string> = {
			[exactIntrinsicOperation](_operation, data) {
				return String(data.props.title);
			}
		};
		expect(first).not.toBe(second);
		expect(Object.isFrozen(first)).toBe(true);
		expect(executeOpaqueOperation(first, target)).toEqual({ value: 'first' });
		expect(executeOpaqueOperation(second, target)).toEqual({ value: 'second' });
		expect(isOpaqueOperation({ ...first })).toBe(false);
		expect(executeOpaqueOperation({ ...first }, target)).toBeUndefined();
		expect(() => Object.setPrototypeOf(first, {})).toThrow(TypeError);
	});

	it('retains the active domain and private props in a proven plain reference', () => {
		const Component = createExactCompiledDynamicBoundaryArtifact(
			function ServerComponent() {},
			'@exactjs/core:test-plain-server-reference',
			'server'
		);
		const domain = createFrameworkComponentDomain({ target: 'server', executionRoot: 'page' });
		const props = { message: 'ready' };
		const reference = withComponentDomain(domain, () =>
			createPreparedServerComponentReferenceFromPlainProps(Component, props)
		);
		expect(readPreparedServerComponentReference(reference)).toBe(reference);
		expect(reference.domain).toBe(domain);
		expect(reference.props).toBe(props);
		expect(reference.children).toEqual([]);
	});

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

		const unmarked = createPreparedServerChildRange(value, undefined, false);
		expect(isOpaqueOperation(unmarked)).toBe(false);
		expect(readPreparedServerChildRange(unmarked)).toMatchObject({
			value,
			mayReplaceSubtree: false
		});
		expect(readPreparedServerChildRange(unmarked)?.markerId).toBeUndefined();
		expect(readPreparedServerChildRange(unmarked)?.value).toBe(value);
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
