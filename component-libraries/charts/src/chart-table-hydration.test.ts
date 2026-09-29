/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { tableChartRoot } from './test-support/chart-table.fixtures.js';
import { tableChartRoot as serverRoot } from './test-support/chart-table.fixtures.js?exact-target=server';

it('adopts the server table and keeps its cells reactive without a duplicate data view', async () => {
	const rendered = await renderToHydratableString(serverRoot());
	const container = document.createElement('div');
	container.innerHTML = rendered.html;
	const table = container.querySelector('table')!;
	const firstCell = table.querySelector('td');
	const client = hydrate(tableChartRoot(), container, {
		resumptions: rendered.resumptions,
		onMismatch: 'throw'
	});
	try {
		expect(container.querySelectorAll('table')).toHaveLength(1);
		expect(container.querySelector('table')).toBe(table);
		expect(table.querySelector('td')).toBe(firstCell);
		expect(firstCell?.textContent).toBe('1.25');
		container.querySelector<HTMLButtonElement>('#table-update')!.click();
		flushSync();
		expect(firstCell?.textContent).toBe('2.25');
		expect(table.querySelector('tr:last-child td:last-child')?.textContent).toBe('4.25');
	} finally {
		client.dispose();
	}
});
