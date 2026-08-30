/** @vitest-environment jsdom */
import { createCompatibilityContribution } from '@exactjs/core/framework/compatibility-contributions';
import { describe, expect, it } from 'vitest';
import {
	createStandaloneCompatibilityRangeHost,
	mountCompatibilityRange
} from './renderer/compatibility-range.js';
import {
	createCompiledComponentOperation,
	createCompiledOperation
} from './test-support/native-operations.js';
import {
	CompatibilityNative,
	compatibilityNativeDisposals,
	resetCompatibilityNativeDisposals
} from './compatibility-contribution.fixtures.js';

function contribution(value: unknown, key?: string) {
	return createCompatibilityContribution((target) => target.place(value), key);
}

describe('opaque compatibility contribution DOM ownership', () => {
	it('places native receipts without classifying their contents at the React boundary', () => {
		resetCompatibilityNativeDisposals();
		const container = document.createElement('div');
		const host = createStandaloneCompatibilityRangeHost(container);
		const range = mountCompatibilityRange(
			host,
			contribution(
				[
					'text',
					createCompiledOperation('i', {}, 'intrinsic'),
					createCompiledComponentOperation(CompatibilityNative, {}),
					[createCompiledOperation('b', {}, 'one'), 'two'],
					null
				],
				'content'
			),
			container,
			null
		);

		expect(container.textContent).toBe('textintrinsiccomponentonetwo');
		expect(container.querySelectorAll('i, strong, b')).toHaveLength(3);
		range.dispose();
		expect(compatibilityNativeDisposals()).toBe(1);
		expect(container.childNodes).toHaveLength(0);
	});

	it('updates a retained native range only through its opaque supplier operation', () => {
		const container = document.createElement('div');
		const range = mountCompatibilityRange(
			createStandaloneCompatibilityRangeHost(container),
			contribution(createCompiledOperation('span', {}, 'before'), 'range'),
			container,
			null
		);
		expect(container.textContent).toBe('before');

		range.update(contribution(createCompiledOperation('span', {}, 'after'), 'range'));
		expect(container.textContent).toBe('after');
		range.dispose();
	});

	it('disposes only the native range between React-owned siblings', () => {
		const container = document.createElement('div');
		const before = document.createElement('header');
		const after = document.createElement('footer');
		container.append(before, after);
		const range = mountCompatibilityRange(
			createStandaloneCompatibilityRangeHost(container),
			contribution(createCompiledOperation('em', {}, 'native')),
			container,
			after
		);

		range.dispose();
		expect(Array.from(container.children)).toEqual([before, after]);
	});
});
