/** @vitest-environment jsdom */
import { describe, expect, it, onTestFinished } from 'vitest';
import { render } from '@exactjs/dom';
import { unmount } from '@exactjs/dom/root';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { helperInputs, derivedInputs } from './test-support/helper-inputs.fixtures.js';
import {
	helperInputs as serverRoot,
	derivedInputs as derivedServerRoot
} from './test-support/helper-inputs.fixtures.js?exact-target=server';

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

it.each(['mount', 'hydrate'] as const)(
	'updates a derived captured component input after %s',
	async (mode) => {
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		let original: Element | null = null;
		if (mode === 'hydrate') {
			const ssr = await renderToHydratableString(derivedServerRoot);
			host.innerHTML = ssr.html;
			original = host.querySelector('path');
			const client = hydrate(derivedInputs, host, {
				resumptions: ssr.resumptions,
				onMismatch: 'throw'
			});
			onTestFinished(() => client.dispose());
		} else render(derivedInputs, host);
		const path = host.querySelector('path');
		if (original) expect(path).toBe(original);
		expect(path?.getAttribute('d')).toBe('M 0 0 L 1 1');
		host.querySelector<HTMLButtonElement>('#replace-derived')!.click();
		flushSync();
		expect(host.querySelector('path')).toBe(path);
		expect(path?.getAttribute('d')).toBe('M 0 0 L 2 1');
	}
);
