import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate/enhanced';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr/enhanced';
import { expect, it, onTestFinished } from 'vitest';
import {
	resetWorkbenchObservations,
	workbenchObservations,
	workbenchRoot,
	type ControlPath,
	type WorkbenchProps
} from './test-support/repeated-interactions.fixtures.js';
import { workbenchRoot as serverRoot } from './test-support/repeated-interactions.fixtures.js?exact-target=server';
import { corpus } from './scenarios/enhancement-implementation.fixtures.js';
import { corpus as serverCorpus } from './scenarios/enhancement-implementation.fixtures.js?exact-target=server';

const identity = '../scenarios/enhancement-routing.fixtures.js#corpus';
const paths: ControlPath[] = ['planned', 'spread', 'enhanced'];

// Every matrix cell executes this whole contract. A declared mode is not counted as evidence.
for (const path of paths) {
	for (const entry of ['mount', 'hydrate'] as const) {
		it(`${path}/${entry}: adopts or mounts, updates twice, removes handlers and disposes owners`, async () => {
			const container = document.createElement('div');
			document.body.append(container);
			onTestFinished(() => {
				dispose(container, true);
				container.remove();
			});
			let props: WorkbenchProps = {
				path,
				version: 1,
				visible: true,
				active: true,
				items: [
					{ id: 'a', label: 'Alpha' },
					{ id: 'b', label: 'Beta' }
				]
			};
			const options = { enhancementCatalog: new Map([[identity, corpus]]) };
			if (entry === 'hydrate') {
				const rendered = await renderToHydratableString(serverRoot(props), {
					enhancementCatalog: new Map([[identity, serverCorpus]])
				});
				expect(rendered.html).not.toContain('corpus:tone=');
				container.innerHTML = rendered.html;
				if (path === 'enhanced')
					expect(container.querySelector('button')?.getAttribute('data-corpus-tone')).toBe(
						'action'
					);
				expect(container.querySelector('h1')?.textContent).toBe('Report 1');
				expect(container.querySelectorAll('[data-row]')).toHaveLength(2);
				const serverButton = container.querySelector('button');
				const serverRows = [...container.querySelectorAll('[data-row]')];
				hydrate(workbenchRoot(props), container, {
					...options,
					resumptions: rendered.resumptions,
					onMismatch: 'throw'
				});
				expect(container.querySelector('button')).toBe(serverButton);
				expect([...container.querySelectorAll('[data-row]')]).toEqual(serverRows);
			} else render(workbenchRoot(props), container, options);
			resetWorkbenchObservations();
			const button = container.querySelector<HTMLButtonElement>('button')!;
			const retained = container.querySelector('[data-row="b"]');
			if (path === 'enhanced') expect(button.dataset.corpusTone).toBe('action');
			button.click();
			expect(workbenchObservations().selections).toEqual([1]);
			props = { ...props, version: 2, visible: false, items: [{ id: 'b', label: 'Changed' }] };
			render(workbenchRoot(props), container, options);
			flushSync();
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('Report 2');
			expect(container.querySelector('[data-summary]')).toBeNull();
			expect(container.querySelectorAll('[data-row]')).toHaveLength(1);
			expect(container.querySelector('[data-row="b"]')).toBe(retained);
			expect(retained?.textContent).toBe('Report 2: Changed');
			expect(workbenchObservations().removed).toEqual(['a']);
			button.click();
			expect(workbenchObservations().selections).toEqual([1, 2]);
			props = { ...props, version: 3, visible: true, active: false, items: [] };
			render(workbenchRoot(props), container, options);
			flushSync();
			expect(container.querySelector('[data-summary]')?.textContent).toBe('Report 3');
			expect(container.querySelector('[data-count]')?.textContent).toBe('0');
			expect(container.querySelectorAll('[data-row]')).toHaveLength(0);
			button.click();
			expect(workbenchObservations().selections).toEqual([1, 2]);
			expect(workbenchObservations().removed).toEqual(['a', 'b']);
			dispose(container, true);
			button.click();
			expect(workbenchObservations()).toEqual({ selections: [1, 2], removed: ['a', 'b'] });
		});
	}
}
