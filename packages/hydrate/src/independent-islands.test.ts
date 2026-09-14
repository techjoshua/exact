/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import { createComponentResumptionResolver } from './runtime/resumption.js';
import { flushSync } from '@exactjs/reactive';
import { render, unmount } from '@exactjs/dom/root';
import { renderToHydratableString, renderToHydratableProgressiveHtmlStream } from '@exactjs/ssr';
import {
	hydrate,
	hydrateClientIslands,
	lazyClientIsland,
	readExactHydrationConfig
} from './index.js';
import {
	islandPage,
	propPage as serverPropPage
} from './test-support/independent-islands.fixtures.js?exact-target=server';
import { IndependentCounter, propPage } from './test-support/independent-islands.fixtures.js';

it.each(['string', 'stream'])(
	'resumes independent islands in reverse loading order (%s)',
	async (mode) => {
		const container = document.createElement('div');
		const html =
			mode === 'string'
				? (await renderToHydratableString(islandPage)).htmlWithHydration
				: await new Response(renderToHydratableProgressiveHtmlStream(islandPage)).text();
		container.innerHTML = html;
		const boundaries = [...container.querySelectorAll('[data-exact-client-boundary]')];
		const buttons = [...container.querySelectorAll('button')];
		expect(boundaries).toHaveLength(2);
		expect(buttons.map((button) => button.textContent)).toEqual(['12', '17']);
		expect(readExactHydrationConfig(container).resumptions ?? []).toHaveLength(0);
		let releaseFirst!: (component: typeof IndependentCounter) => void;
		const pendingFirst = new Promise<typeof IndependentCounter>((resolve) => {
			releaseFirst = resolve;
		});
		boundaries[0]!.setAttribute('data-exact-client-name', 'First');
		boundaries[1]!.setAttribute('data-exact-client-name', 'Second');
		try {
			hydrateClientIslands(container, {
				First: lazyClientIsland(() => pendingFirst),
				Second: lazyClientIsland(async () => IndependentCounter)
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(boundaries[1]!.getAttribute('data-exact-client-hydrated')).toBe('true');
			expect(boundaries[0]!.hasAttribute('data-exact-client-hydrated')).toBe(false);
			releaseFirst(IndependentCounter);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect([...container.querySelectorAll('button')]).toEqual(buttons);
			buttons[0]!.click();
			flushSync();
			expect(buttons.map((button) => button.textContent)).toEqual(['13', '17']);
		} finally {
			for (const boundary of boundaries) unmount(boundary);
		}
	}
);

it('rejects malformed island resumptions before replacing server DOM', async () => {
	const container = document.createElement('div');
	container.innerHTML = (await renderToHydratableString(islandPage)).htmlWithHydration;
	const boundary = container.querySelector('[data-exact-client-boundary]')!;
	const button = boundary.querySelector('button');
	boundary.setAttribute(
		'data-exact-client-props',
		JSON.stringify({ props: { initial: 2 }, resumptions: [['component', 'invalid fields']] })
	);
	expect(() => hydrateClientIslands(container, { IndependentCounter })).toThrow(
		'Malformed eXact component resumption'
	);
	expect(boundary.querySelector('button')).toBe(button);
	expect(boundary.hasAttribute('data-exact-client-hydrated')).toBe(false);
});

it.each(['hydrate', 'mount'])(
	'reconstructs prop computations and keeps later updates active (%s)',
	async (mode) => {
		const container = document.createElement('div');
		const rendered = await renderToHydratableString(serverPropPage);
		container.innerHTML = mode === 'hydrate' ? rendered.html : '';
		const original = container.querySelector('output');
		if (mode === 'hydrate')
			hydrate(propPage, container, { resumptions: rendered.resumptions, onMismatch: 'throw' });
		else render(propPage, container);
		try {
			flushSync();
			expect(container.querySelector('output')?.textContent).toBe('2:5');
			if (mode === 'hydrate') expect(container.querySelector('output')).toBe(original);
			container.querySelector('button')!.click();
			flushSync();
			await new Promise((resolve) => setTimeout(resolve, 0));
			flushSync();
			expect(container.querySelector('output')?.textContent).toBe('5:8');
		} finally {
			unmount(container);
		}
	}
);

it('rejects completion identities outside the receiving compiler contract', () => {
	const componentId = exactComponentIdentity(IndependentCounter);
	const resolve = createComponentResumptionResolver(() => [
		{
			componentId,
			values: {},
			contexts: {},
			settledContinuations: ['unrecognized-completion']
		}
	]);
	expect(() => resolve(IndependentCounter)).toThrow('undeclared continuation');
});
