import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import {
	keyedSpreadRoot,
	removedSpreadRows,
	resetSpreadRows,
	type SpreadPath
} from './test-support/keyed-spread-updates.fixtures.js';
import { keyedSpreadRoot as serverRoot } from './test-support/keyed-spread-updates.fixtures.js?exact-target=server';

for (const path of [
	'spread',
	'copy',
	'ordered',
	'explicit',
	'snapshot',
	'conditional-empty',
	'short-circuit'
] satisfies SpreadPath[]) {
	for (const entry of ['mount', 'hydrate']) {
		it(`${path}/${entry}: updates spread props on retained state-owned rows`, async () => {
			resetSpreadRows();
			const container = document.createElement('div');
			document.body.append(container);
			onTestFinished(() => {
				dispose(container, true);
				container.remove();
			});
			if (entry === 'hydrate') {
				const rendered = await renderToHydratableString(serverRoot(path));
				container.innerHTML = rendered.html;
				const rows = [...container.querySelectorAll('li')];
				hydrate(keyedSpreadRoot(path), container, {
					resumptions: rendered.resumptions,
					onMismatch: 'throw'
				});
				expect([...container.querySelectorAll('li')]).toEqual(rows);
			} else render(keyedSpreadRoot(path), container);
			const rows = [...container.querySelectorAll('li')];
			const input = rows[0].querySelector('input')!;
			input.value = 'unsaved';
			const click = (name: string) => {
				[...container.querySelectorAll('button')]
					.find((button) => button.textContent === name)!
					.click();
				flushSync();
			};
			if (path === 'snapshot') {
				for (const action of ['Start', 'Finish', 'Retry', 'Reverse', 'Clear']) click(action);
				expect([...container.querySelectorAll('li')]).toEqual(rows);
				expect(rows.map((row) => row.dataset.status)).toEqual(['pending', 'pending']);
				expect(removedSpreadRows()).toEqual([]);
				return;
			}
			click('Start');
			expect(rows[0].dataset.status).toBe(path === 'ordered' ? 'running!' : 'running');
			expect(rows[0].getAttribute('title')).toBe(path === 'ordered' ? 'Override' : null);
			click('Finish');
			expect(rows.map((row) => row.dataset.status)).toEqual(
				path === 'ordered' ? ['done!', 'done!'] : ['done', 'done']
			);
			click('Retry');
			expect(rows[0].dataset.status).toBe(path === 'ordered' ? 'retried!' : 'retried');
			click('Reverse');
			expect([...container.querySelectorAll('li')]).toEqual([...rows].reverse());
			expect(input.isConnected).toBe(true);
			expect(input.value).toBe('unsaved');
			expect(removedSpreadRows()).toEqual([]);
			click('Clear');
			expect(container.querySelectorAll('li')).toHaveLength(0);
			expect(removedSpreadRows().sort()).toEqual(['a', 'b']);
		});
	}
}
