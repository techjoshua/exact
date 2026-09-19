import { describe, expect, it, vi } from 'vitest';
import { computed, reactive } from '@exactjs/reactive';
import { childKinds, childrenOf, partitionChildren, withChildren } from './composition.js';
import {
	createCompiledIntrinsicReceipt as element,
	readCompiledIntrinsicReceipt,
	withIntrinsicComposition
} from '../component-abi/intrinsic-receipt.js';
import { createCompiledFragmentReceipt } from '../component-abi/fragment-receipt.js';
import {
	createOpaqueOperation,
	executeOpaqueOperation
} from '../component-abi/opaque-operation.js';
import { createFrameworkComponentDomain, withComponentDomain } from '../component/domain.js';

describe('immediate child composition', () => {
	it('redeems an optimized operation only on inspection without changing rendering identity', () => {
		const describe = vi.fn(() => element('span', { title: 'retained' }, 'original'));
		const operation = withIntrinsicComposition(
			createOpaqueOperation(() => 'rendered'),
			describe
		);
		expect(executeOpaqueOperation(operation, {})).toEqual({ value: 'rendered' });
		expect(describe).not.toHaveBeenCalled();
		expect(partitionChildren([operation], { selected: 'span' }).selected).toEqual([operation]);
		expect(childrenOf(operation)).toEqual(['original']);
		const derived = withChildren(operation, 'replacement');
		expect(childrenOf(derived)).toEqual(['replacement']);
		expect(readCompiledIntrinsicReceipt(derived)?.props.title).toBe('retained');
		expect(describe).toHaveBeenCalledTimes(1);
		expect(readCompiledIntrinsicReceipt(operation)).toBeUndefined();
		expect(executeOpaqueOperation(operation, {})).toEqual({ value: 'rendered' });
	});

	it('retains the creation domain even when an unowned view is inspected in another domain', () => {
		const creation = createFrameworkComponentDomain({ target: 'server', executionRoot: 'page' });
		const inspection = createFrameworkComponentDomain({ target: 'server', executionRoot: 'page' });
		const describe = () => element('span', null, 'child');
		const owned = withComponentDomain(creation, () =>
			withIntrinsicComposition(createOpaqueOperation(), describe)
		);
		const unowned = withIntrinsicComposition(createOpaqueOperation(), describe);
		withComponentDomain(inspection, () => {
			expect(readCompiledIntrinsicReceipt(withChildren(owned, []))?.domain).toBe(creation);
			expect(readCompiledIntrinsicReceipt(withChildren(unowned, []))?.domain).toBeUndefined();
		});
	});

	it('assigns each child once, preserves source order, and leaves nested content intact', () => {
		const title = element('title', null, 'Example');
		const paragraph = element('p', null, element('title', null, 'Nested'));
		const fragment = createCompiledFragmentReceipt(null, title);
		const parts = partitionChildren([null, title, ['text', false, 3, paragraph], fragment], {
			head: ['title', 'meta'],
			duplicate: 'title',
			text: childKinds.text
		});
		expect(parts.head).toEqual([title]);
		expect(parts.duplicate).toEqual([]);
		expect(parts.text).toEqual(['text', 3]);
		expect(parts.remaining).toEqual([paragraph, fragment]);
	});

	it('retains bindings, keys, and original children when deriving an element', () => {
		const binding = computed(() => 'fr');
		const original = element('html', { lang: binding, key: 'document' }, 'old');
		const replacement = withChildren(original, ['new']);
		const before = readCompiledIntrinsicReceipt(original)!;
		const after = readCompiledIntrinsicReceipt(replacement)!;
		expect(after.props).toBe(before.props);
		expect(after.props.lang).toBe(binding);
		expect(after.key).toBe('document');
		expect(childrenOf(original)).toEqual(['old']);
		expect(childrenOf(replacement)).toEqual(['new']);
	});

	it('observes reactive child replacement in the calling computation', () => {
		const state = reactive({ value: 'one' });
		const children = computed(() => [element(state.value === 'one' ? 'p' : 'span', null)]);
		const selected = computed(() => partitionChildren(children, { paragraphs: 'p' }));
		expect(selected.get().paragraphs).toHaveLength(1);
		state.value = 'two';
		expect(selected.get().paragraphs).toHaveLength(0);
		expect(selected.get().remaining).toHaveLength(1);
	});

	it('rejects reserved partitions and non-intrinsic reconstruction', () => {
		expect(() => partitionChildren([], { remaining: 'p' })).toThrow(/reserved/);
		expect(() => childrenOf({})).toThrow(/intrinsic/);
		expect(() => withChildren('p', [])).toThrow(/intrinsic/);
	});
});
