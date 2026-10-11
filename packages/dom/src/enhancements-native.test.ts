/** @vitest-environment jsdom */
import './framework/enhancements.js';
import './runtime/target.js';
import { createEnhancementNode } from '@exactjs/core';
import {
	createCompiledFragmentReceipt,
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-abi';
import { createCompiledChildRangeReceipt } from '@exactjs/core/runtime/render-operations';
import { flushSync, reactive } from '@exactjs/reactive';
import { unmount } from './index.js';
import { describe, expect, it, onTestFinished } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	NativeDirectProvider,
	NativeFragmentProvider,
	NativeTargetEnhancement
} from './native-enhancement.fixtures.js';

const identity = '@test/motion#motion';

describe('native renderer enhancement operations', () => {
	it('retains an opaque intrinsic operation through a direct enhancement provider', () => {
		const operation = createCompiledIntrinsicReceipt(
			'section',
			{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
			'content'
		);
		const container = document.createElement('div');

		render(operation, container, {
			enhancementCatalog: new Map([[identity, NativeDirectProvider]])
		});

		expect(container.innerHTML).toBe('<div><section>content</section></div>');
		expect(readCompiledIntrinsicReceipt(operation)?.tag).toBe('section');
	});

	it('retains an opaque intrinsic operation through post-mount target enhancement', () => {
		const operation = createCompiledIntrinsicReceipt(
			'button',
			{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
			'Save'
		);
		const container = document.createElement('div');

		render(operation, container, {
			enhancementCatalog: new Map([[identity, NativeTargetEnhancement]])
		});

		expect(container.innerHTML).toBe('<button class="enhanced">Save</button>');
		expect(readCompiledIntrinsicReceipt(operation)?.tag).toBe('button');
	});

	it('keeps a directly enhanced native fragment as the stable routing target', () => {
		const operation = createCompiledFragmentReceipt(
			{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
			createCompiledIntrinsicReceipt('h2', null, 'Heading')
		);
		const container = document.createElement('div');

		render(operation, container, {
			enhancementCatalog: new Map([[identity, NativeFragmentProvider]])
		});
		flushSync();

		expect(container.innerHTML).toBe('<section><h2>Heading</h2></section>');
	});
});

// Authored sibling identity remains visible when an enhancement adds an ownership wrapper.
it.each(['intrinsic', 'fragment'] as const)(
	'retains keyed %s enhancement targets and replaces changed keys',
	(kind) => {
		const state = reactive({ key: 'first', label: 'initial', visible: true });
		const catalog = new Map([
			[identity, kind === 'intrinsic' ? NativeDirectProvider : NativeFragmentProvider]
		]);
		const operation = createCompiledChildRangeReceipt(() => {
			const props = {
				key: state.key,
				__exactEnhancements: createEnhancementNode([{ identity, props: {} }])
			};
			const leaf = createCompiledIntrinsicReceipt('output', { 'data-keyed': '' }, state.label);
			const enhanced =
				kind === 'intrinsic'
					? createCompiledIntrinsicReceipt('output', { ...props, 'data-keyed': '' }, state.label)
					: createCompiledFragmentReceipt(props, leaf);
			return [
				state.visible ? enhanced : null,
				createCompiledIntrinsicReceipt('aside', { key: 'sibling' }, 'sibling')
			];
		});
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			unmount(host);
		});
		render(operation, host, {
			enhancementCatalog: catalog,
			onErrorReport: (report) => reports.push(report.error)
		});
		const first = host.querySelector('output')!;
		const sibling = host.querySelector('aside');
		state.label = 'updated';
		flushSync();
		expect(host.querySelector('output')).toBe(first);
		expect(first.textContent).toBe('updated');
		state.key = 'second';
		flushSync();
		const second = host.querySelector('output');
		expect(second).not.toBe(first);
		expect(second?.textContent).toBe('updated');
		expect(host.querySelector('aside')).toBe(sibling);
		state.visible = false;
		flushSync();
		expect(host.querySelector('output')).toBeNull();
		expect(host.querySelector('aside')).toBe(sibling);
		state.visible = true;
		state.label = 'returned';
		flushSync();
		expect(host.querySelector('output')?.textContent).toBe('returned');
		expect(reports).toEqual([]);
		unmount(host);
		state.label = 'disposed';
		flushSync();
		expect(host.childNodes).toHaveLength(0);
	}
);
