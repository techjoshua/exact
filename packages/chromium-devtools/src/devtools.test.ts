import { expect, it, vi } from 'vitest';

it('registers the generated panel document from the extension root', async () => {
	vi.resetModules();
	const create = vi.fn();
	Object.defineProperty(globalThis, 'chrome', {
		configurable: true,
		value: { devtools: { panels: { create } } }
	});

	await import('./devtools.js');

	expect(create).toHaveBeenCalledWith('eXact', '', 'dist/panel.html');
});
