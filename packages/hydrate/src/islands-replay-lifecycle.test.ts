/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { unmount } from '@exactjs/dom/root';
import { hydrateClientIslands, lazyClientIsland } from './index.js';
import { observeReplay, ReplayCounter } from './test-support/island-replay.fixtures.js';

const markup =
	'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="action">Count</button></div>';
const release = () => new Promise((resolve) => setTimeout(resolve, 0));
const click = (root: Element) =>
	root
		.querySelector('button')!
		.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

it.each(['abort', 'generation', 'remove'] as const)(
	'stops queued replay when its first handler causes %s and keeps the shared module usable',
	async (mode) => {
		const root = document.createElement('main');
		root.innerHTML = markup;
		const boundary = root.firstElementChild!;
		const controller = new AbortController();
		let resolve!: (value: typeof ReplayCounter) => void;
		const loaded = new Promise<typeof ReplayCounter>((done) => {
			resolve = done;
		});
		let calls = 0;
		let loads = 0;
		const registry = {
			Counter: lazyClientIsland(
				() => {
					loads++;
					return loaded;
				},
				{
					mode: 'interaction',
					reasons: [],
					targets: [{ id: 'action', events: [{ type: 'click', replay: 'native-click' }] }]
				}
			)
		};
		observeReplay(() => {
			calls++;
			if (mode === 'abort') controller.abort();
			else if (mode === 'generation') boundary.setAttribute('data-exact-client-generation', '2');
			else boundary.remove();
		});
		try {
			hydrateClientIslands(root, registry, { signal: controller.signal });
			click(root);
			click(root);
			resolve(ReplayCounter);
			await release();
			expect(calls).toBe(1);
		} finally {
			controller.abort();
			unmount(boundary);
			observeReplay(() => {});
		}
		root.innerHTML = markup;
		const nextBoundary = root.firstElementChild!;
		const next = new AbortController();
		observeReplay(() => {
			calls++;
		});
		try {
			hydrateClientIslands(root, registry, { signal: next.signal });
			const button = root.querySelector('button');
			click(root);
			await release();
			expect(calls).toBe(2);
			expect(root.querySelector('button')).toBe(button);
			click(root);
			expect(calls).toBe(3);
			expect(loads).toBe(1);
		} finally {
			next.abort();
			unmount(nextBoundary);
			observeReplay(() => {});
		}
	}
);
