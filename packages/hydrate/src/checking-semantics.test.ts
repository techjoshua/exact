/** @vitest-environment jsdom */
import { expect, it, onTestFinished, vi } from 'vitest';
import { render } from '@exactjs/dom';
import { unmount } from '@exactjs/dom/root';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { checkingRoot, completePreview } from './test-support/checking-semantics.fixtures.js';
import { checkingRoot as serverRoot } from './test-support/checking-semantics.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'])(
	'preserves keyed helper nodes and fences awaited object writes after %s',
	async (mode) => {
		const container = document.createElement('div');
		onTestFinished(() => {
			unmount(container);
		});
		if (mode === 'hydrate') {
			const ssr = await renderToHydratableString(serverRoot);
			container.innerHTML = ssr.html;
			const client = hydrate(checkingRoot, container, { resumptions: ssr.resumptions });
			onTestFinished(() => client.dispose());
		} else render(checkingRoot, container);
		const [a, b] = [...container.querySelectorAll('li')];
		const click = (id: string) => {
			container.querySelector<HTMLButtonElement>(id)!.click();
			flushSync();
		};
		click('#reorder');
		let items = [...container.querySelectorAll('li')];
		expect(items.map((item) => item.textContent)).toEqual(['b', 'c', 'a']);
		expect(items[0]).toBe(b);
		expect(items[2]).toBe(a);
		const c = items[1];
		click('#remove');
		items = [...container.querySelectorAll('li')];
		expect(items).toEqual([b, c]);
		click('#first');
		click('#second');
		completePreview('second', 'latest');
		await vi.waitFor(() => expect(container.querySelector('output')!.textContent).toBe('latest'));
		completePreview('first', 'stale');
		await new Promise((resolve) => setTimeout(resolve, 0));
		flushSync();
		expect(container.querySelector('output')!.textContent).toBe('latest');
	}
);
