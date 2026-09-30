/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { createExactClient, lazyClientIsland } from './index.js';
import {
	LazyAppearance,
	readInteractionInputValues,
	resetInteractionFixture
} from './test-support/island-interaction.fixtures.js';

it.each([
	'eager',
	'interaction',
	'override',
	'root',
	'rescan',
	'abort',
	'generation',
	'remove'
] as const)('replays a selection once while %s adoption loads', async (mode) => {
	resetInteractionFixture();
	const root = document.createElement('main');
	root.innerHTML = `<div data-exact-client-boundary="appearance" data-exact-client-name="Appearance" data-exact-client-hydration="${mode === 'interaction' || mode === 'override' ? 'interaction' : 'eager'}"><select data-exact-id="appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>`;
	let resolve!: (value: typeof LazyAppearance) => void;
	const loaded = new Promise<typeof LazyAppearance>((done) => {
		resolve = done;
	});
	const client = createExactClient(mode === 'root' ? root.firstElementChild! : root, {
		hydration: mode === 'override' ? { strategy: 'eager' } : undefined,
		islands: {
			Appearance: lazyClientIsland(() => loaded, {
				mode: mode === 'interaction' || mode === 'override' ? 'interaction' : 'eager',
				reasons: mode === 'eager' ? [{ code: 'ref', start: 0, length: 1 }] : [],
				targets: [{ id: 'appearance', events: [{ type: 'change', replay: 'latest-value' }] }]
			})
		}
	});
	onTestFinished(() => client.dispose());
	const select = root.querySelector('select')!;
	select.value = 'dark';
	select.dispatchEvent(new Event('change', { bubbles: true }));
	select.value = 'light';
	select.dispatchEvent(new Event('change', { bubbles: true }));
	expect(readInteractionInputValues()).toEqual([]);
	if (mode === 'rescan') client.registerComponents({ islands: {} });
	if (mode === 'abort') client.dispose();
	if (mode === 'generation')
		root.firstElementChild!.setAttribute('data-exact-client-generation', '2');
	if (mode === 'remove') root.firstElementChild!.remove();
	resolve(LazyAppearance);
	if (mode === 'abort')
		await expect(client.whenSettled()).rejects.toMatchObject({ name: 'AbortError' });
	else await client.whenSettled();
	if (['abort', 'generation', 'remove'].includes(mode)) {
		expect(readInteractionInputValues()).toEqual([]);
		return;
	}
	expect(root.querySelector('select')).toBe(select);
	expect(select.value).toBe('light');
	expect(readInteractionInputValues()).toEqual(['light']);
	select.value = 'dark';
	select.dispatchEvent(new Event('change', { bubbles: true }));
	expect(readInteractionInputValues()).toEqual(['light', 'dark']);
});
