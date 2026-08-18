/**
 * @vitest-environment jsdom
 */
import {
	createEnhancementMarker,
	createDynamicChild,
	Fragment,
	markExactComponent,
	Target,
	type Child,
	type Component
} from '@exactjs/core';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { renderToString } from '@exactjs/ssr';
import { TimeUpdate } from '@exactjs/time';
import { createTimeActivation } from '@exactjs/time/internal';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './enhanced.js';
import { createVNode } from './test-support/native-vnode.js';
import { noopLogger } from './test-support/responses.js';

describe('enhanced hydration facade', () => {
	it('adopts a direct target intrinsic ahead of a later nested target in a fragment', () => {
		const vnode = createVNode(
			Target,
			{ className: 'outer' },
			createVNode(
				Fragment,
				null,
				createVNode('section', { id: 'host' }, 'Host'),
				createVNode(Target, { className: 'inner' }, createVNode('h2', null, 'Heading'))
			)
		);
		const root = document.createElement('div');
		root.innerHTML = renderToString(vnode).html;
		const host = root.querySelector('#host'),
			heading = root.querySelector('h2');

		hydrate(vnode, root, { logger: noopLogger, onMismatch: 'throw' });

		expect(root.querySelector('#host')).toBe(host);
		expect(root.querySelector('h2')).toBe(heading);
		expect(host?.getAttribute('class')).toBe('outer');
		expect(heading?.getAttribute('class')).toBe('inner');
	});

	it('adopts the server clock text before one settled live refresh', async () => {
		const identity = '@exactjs/time:TimeUpdate';
		let now = 100;
		vi.spyOn(Date, 'now').mockImplementation(() => now);
		const plan = { protocol: 1, kind: 'continuous' } as const;
		const timeVNode = (activation: ReturnType<typeof createTimeActivation>) =>
			createVNode(
				'time',
				{
					__exactEnhancements: createEnhancementMarker([
						{ identity, props: { update: activation } }
					])
				},
				createDynamicChild(() => String(activation.readEpochMilliseconds()), 'time-sample', false)
			);
		const ClockView = markExactComponent(function ClockView() {
			const activation = createTimeActivation('second', plan);
			return () => timeVNode(activation);
		}, '@test/time-hydration');
		const root = document.createElement('div');
		const rendered = renderToString(createVNode(ClockView, {}), {
			enhancementCatalog: new Map([[identity, TimeUpdate]])
		});
		root.innerHTML = rendered.html;
		const adopted = root.querySelector('time');
		expect(adopted?.textContent).toBe('100');

		await Promise.resolve();
		now = 1_000;
		registerExactEnhancement(identity, TimeUpdate);
		const client = hydrate(createVNode(ClockView, {}), root, {
			allowMarkerless: true,
			logger: noopLogger,
			onMismatch: 'throw',
			wallClockSnapshot: rendered.wallClockSnapshot
		});
		expect(root.querySelector('time')).toBe(adopted);
		expect(adopted?.textContent).toBe('100');

		await Promise.resolve();
		await Promise.resolve();
		expect(root.querySelector('time')).toBe(adopted);
		expect(adopted?.textContent).toBe('1000');
		client.dispose();
	});

	it('supplies the application-bundle catalog after adoption', () => {
		const identity = '@exactjs/hydrate:enhanced-facade';
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', { 'data-enhanced': true }, props.children);
		}, identity);
		const vnode = createVNode(
			'button',
			{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
			'Save'
		);
		const root = document.createElement('div');
		root.innerHTML = renderToString(vnode, {
			enhancementCatalog: new Map([[identity, Enhancement]])
		}).html;
		registerExactEnhancement(identity, Enhancement);

		hydrate(vnode, root, { logger: noopLogger });

		expect(root.innerHTML).toContain('<aside data-enhanced="true"><button>Save</button></aside>');
	});
});
