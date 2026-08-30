/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import './runtime/target.js';
import '@exactjs/core/runtime/contexts';
import { Fragment, Target } from '@exactjs/core';
import { createDynamicChild } from '@exactjs/core/runtime/render';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { createOperation } from './test-support/native-operations.js';

describe('enhancement target lifecycle', () => {
	it('keeps dormant target contributions and attaches them after structural output appears', () => {
		const state = reactive({ visible: false, tone: 'quiet' });
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ className: computed(() => state.tone) },
				createDynamicChild(() =>
					state.visible ? createOperation('button', { id: 'target' }, 'Ready') : 'Waiting'
				)
			),
			container
		);

		expect(container.textContent).toBe('Waiting');
		state.visible = true;
		flushSync();
		expect(container.querySelector('button')?.className).toBe('quiet');
		state.tone = 'active';
		flushSync();
		expect(container.querySelector('button')?.className).toBe('active');
	});

	it('releases and reattaches one target owner across conditional target generations', () => {
		const state = reactive({ mode: 'button' as 'button' | 'text' | 'link' });
		const refs: unknown[] = [];
		const target = {
			fulfill(value: unknown) {
				refs.push(value);
			}
		};
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ ref: target, title: 'owned' },
				createDynamicChild(() =>
					state.mode === 'button'
						? createOperation('button', null, 'Button')
						: state.mode === 'link'
							? createOperation('a', { href: '#' }, 'Link')
							: 'No target'
				)
			),
			container
		);

		expect(refs.at(-1)).toBe(container.querySelector('button'));
		state.mode = 'text';
		flushSync();
		expect(refs.at(-1)).toBeUndefined();
		expect(container.textContent).toBe('No target');
		state.mode = 'link';
		flushSync();
		expect(refs.at(-1)).toBe(container.querySelector('a'));
		expect(container.querySelector('a')?.title).toBe('owned');
	});

	it('propagates a nested target generation change to outer target owners', () => {
		const state = reactive({ link: false });
		const outerRefs: unknown[] = [];
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{
					className: 'outer',
					ref: { fulfill: (value: unknown) => outerRefs.push(value) }
				},
				createOperation(
					Target,
					{ className: 'inner' },
					createDynamicChild(() =>
						state.link
							? createOperation('a', { href: '#' }, 'Link')
							: createOperation('button', null, 'Button')
					)
				)
			),
			container
		);

		expect(container.querySelector('button')?.className).toBe('inner outer');
		state.link = true;
		flushSync();
		expect(container.querySelector('a')?.className).toBe('inner outer');
		expect(outerRefs.at(-1)).toBe(container.querySelector('a'));
	});

	it('keeps the first direct intrinsic authoritative through transparent conditional output', () => {
		const state = reactive({ direct: true });
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ className: 'outer' },
				createDynamicChild(() =>
					createOperation(
						Fragment,
						null,
						state.direct ? createOperation('section', { id: 'host' }, 'Host') : 'No host',
						createOperation(Target, { className: 'inner' }, createOperation('h2', null, 'Heading'))
					)
				)
			),
			container
		);

		expect(container.querySelector('#host')?.className).toBe('outer');
		expect(container.querySelector('h2')?.className).toBe('inner');

		state.direct = false;
		flushSync();

		expect(container.querySelector('#host')).toBeNull();
		expect(container.querySelector('h2')?.className).toBe('inner outer');
	});
});
