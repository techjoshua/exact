/** @vitest-environment jsdom */
import { describe, expect, it, onTestFinished } from 'vitest';
import { render } from '@exactjs/dom';
import { unmount } from '@exactjs/dom/root';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { destructuredRoot } from './test-support/destructured-props.fixtures.js';
import {
	destructuredRoot as serverRoot,
	asyncDestructuredRoot
} from './test-support/destructured-props.fixtures.js?exact-target=server';

describe('compiled destructured props', () => {
	it.each(['mount', 'hydrate'])(
		'keeps aliases and defaults live after %s without replacing the child',
		async (mode) => {
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			if (mode === 'hydrate') {
				const ssr = await renderToHydratableString(serverRoot);
				container.innerHTML = ssr.html;
				const client = hydrate(destructuredRoot, container, { resumptions: ssr.resumptions });
				onTestFinished(() => client.dispose());
			} else render(destructuredRoot, container);
			const child = container.querySelector('#child')!;
			const click = (id: string) => {
				(container.querySelector(id) as HTMLButtonElement).click();
				flushSync();
			};
			expect(child.textContent).toBe('A:false:0');
			click('#child');
			click('#flag');
			expect(child.textContent).toBe('A:true:1');
			click('#value');
			expect(child.textContent).toBe('B:true:1');
			click('#flag');
			expect(child.textContent).toBe('B:false:1');
			click('#value');
			expect(child.textContent).toBe('fallback:false:1');
			expect(container.querySelector('#child')).toBe(child);
		}
	);
});

it('initializes inferred async work from destructured props and defaults', async () => {
	const server = await renderToHydratableString(asyncDestructuredRoot);
	const container = document.createElement('div');
	container.innerHTML = server.html;
	expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
		'A',
		'fallback',
		'member'
	]);
});
