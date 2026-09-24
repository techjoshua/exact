/** @vitest-environment jsdom */
import { describe, expect, it, onTestFinished } from 'vitest';
import { render } from '@exactjs/dom';
import { unmount } from '@exactjs/dom/root';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { helperInputs } from './test-support/helper-inputs.fixtures.js';
import { helperInputs as serverRoot } from './test-support/helper-inputs.fixtures.js?exact-target=server';

describe('component view helper inputs', () => {
	it.each(['mount', 'hydrate'])(
		'updates independent arguments after %s and retains child state',
		async (mode) => {
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			if (mode === 'hydrate') {
				const ssr = await renderToHydratableString(serverRoot);
				container.innerHTML = ssr.html;
				const client = hydrate(helperInputs, container, { resumptions: ssr.resumptions });
				onTestFinished(() => client.dispose());
			} else render(helperInputs, container);
			const children = [...container.querySelectorAll<HTMLButtonElement>('.helper-child')];
			const click = (selector: string) => {
				container.querySelector<HTMLButtonElement>(selector)!.click();
				flushSync();
			};
			const assert = (value: string, flag: boolean, count: number) => {
				expect(children.map((child) => child.textContent)).toEqual([
					`${value}:${flag}:${count}`,
					`${value}:${flag}:${count}`
				]);
				expect(container.querySelector('output')!.textContent).toBe(`${value}:${flag}`);
				expect([...container.querySelectorAll('.helper-child')]).toEqual(children);
			};
			assert('A', false, 0);
			children.forEach((child) => {
				child.click();
				flushSync();
			});
			assert('A', false, 1);
			click('#flag');
			assert('A', true, 1);
			click('#value');
			assert('B', true, 1);
			click('#flag');
			assert('B', false, 1);
			click('#unrelated');
			assert('B', false, 1);
		}
	);
});
