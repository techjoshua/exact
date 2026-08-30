/** @vitest-environment jsdom */
import './framework/enhancements.js';
import './runtime/target.js';
import { createEnhancementNode } from '@exactjs/core';
import {
	createCompiledFragmentReceipt,
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-abi';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
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
