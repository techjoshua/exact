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
	'short-circuit',
	'spread-key',
	'overwritten-key',
	'hidden-key'
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
			click('Change ignored key');
			expect(container.querySelector('li')).toBe(rows[0]);
			expect(input.value).toBe('unsaved');
			click('Start');
			expect(rows[0].dataset.status).toBe(path === 'ordered' ? 'running!' : 'running');
			expect(rows[0].getAttribute('title')).toBe(path === 'ordered' ? 'Override' : null);
			expect(container.querySelector('li')).toBe(rows[0]);
			click('Finish');
			expect(rows.map((row) => row.dataset.status)).toEqual(
				path === 'ordered' ? ['done!', 'done!'] : ['done', 'done']
			);
			expect(container.querySelector('li')).toBe(rows[0]);
			click('Retry');
			expect(rows[0].dataset.status).toBe(path === 'ordered' ? 'retried!' : 'retried');
			click('Reverse');
			const reordered = [...container.querySelectorAll('li')];
			expect(reordered[0]).toBe(rows[1]);
			expect(reordered[1]).toBe(rows[0]);
			expect(input.isConnected).toBe(true);
			expect(input.value).toBe('unsaved');
			expect(removedSpreadRows()).toEqual([]);
			click('Clear');
			expect(container.querySelectorAll('li')).toHaveLength(0);
			expect(removedSpreadRows().sort()).toEqual(['a', 'b']);
		});
	}
}

for (const path of ['spread-key', 'overwritten-key', 'hidden-key'] as const) {
	for (const entry of ['mount', 'hydrate'] as const) {
		it(`${path}/${entry}: replaces a changed key once and retains its next update`, async () => {
			resetSpreadRows();
			const container = document.createElement('div');
			onTestFinished(() => {
				dispose(container, true);
			});
			if (entry === 'hydrate') {
				const output = await renderToHydratableString(serverRoot(path));
				container.innerHTML = output.html;
				hydrate(keyedSpreadRoot(path), container, {
					resumptions: output.resumptions,
					onMismatch: 'throw'
				});
			} else render(keyedSpreadRoot(path), container);
			const click = (name: string) => {
				[...container.querySelectorAll('button')]
					.find((button) => button.textContent === name)!
					.click();
				flushSync();
			};
			const initial = [...container.querySelectorAll('li')];
			click('Change key');
			const replacement = container.querySelector('li')!;
			expect(replacement).not.toBe(initial[0]);
			expect(replacement.dataset.row).toBe('a-new');
			expect(removedSpreadRows()).toHaveLength(1);
			const input = replacement.querySelector('input')!;
			input.value = 'new edit';
			click('Finish');
			expect(container.querySelector('li')).toBe(replacement);
			click('Reverse');
			expect(container.querySelectorAll('li')[1]).toBe(replacement);
			expect(container.querySelectorAll('li')[0]).toBe(initial[1]);
			expect(input.value).toBe('new edit');
			expect(removedSpreadRows()).toHaveLength(1);
			click('Clear');
			expect(container.querySelectorAll('li')).toHaveLength(0);
			expect(removedSpreadRows()).toHaveLength(3);
		});
	}
}
