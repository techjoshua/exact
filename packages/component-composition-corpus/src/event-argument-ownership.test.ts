import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, vi } from 'vitest';

it.each(['mount', 'hydrate'] as const)(
	'delivers the event to reassigned handlers during %s',
	async (mode) => {
		const fixture = await import('./test-support/event-argument-ownership.fixtures.js');
		const server = await import(
			'./test-support/event-argument-ownership.fixtures.js?exact-target=server'
		);
		const container = document.createElement('div');
		const reports: unknown[] = [];
		const options = { onErrorReport: (report: unknown) => reports.push(report) };
		try {
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(server.mutableHandlerRoot());
				container.innerHTML = output.html;
				hydrate(fixture.mutableHandlerRoot(), container, {
					resumptions: output.resumptions,
					...options,
					onMismatch: 'throw'
				});
			} else render(fixture.mutableHandlerRoot(), container, options);
			const nodes = [...container.querySelectorAll('[data-handler]')];
			const output = container.querySelector('[data-handler-result]');
			let count = 0;
			for (let round = 0; round < 2; round++) {
				for (const node of nodes) {
					node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
					count++;
					await vi.waitFor(() => expect(output?.textContent).toBe(`${count}:click`));
				}
			}
			expect(reports).toEqual([]);
			unmount(container);
			const settled = output?.textContent;
			for (const node of nodes) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(output?.textContent).toBe(settled);
			expect(reports).toEqual([]);
		} finally {
			unmount(container);
		}
	}
);
