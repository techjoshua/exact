// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { mountClientServerTest } from './index.js';

const unavailableServer = {
	get html(): string {
		throw new Error('server output unavailable');
	}
};
const handle = () => {
	throw new Error('unexpected server dispatch');
};

it('removes its owned container when reading server output throws', async () => {
	const before = [...document.body.children];
	await expect(
		mountClientServerTest({ server: unavailableServer, islands: {}, handle })
	).rejects.toThrow();
	expect([...document.body.children]).toEqual(before);
});

it('preserves a caller-owned container when reading server output throws', async () => {
	const container = document.createElement('section');
	document.body.append(container);
	try {
		await expect(
			mountClientServerTest({ server: unavailableServer, container, islands: {}, handle })
		).rejects.toThrow();
		expect(container.isConnected).toBe(true);
	} finally {
		container.remove();
	}
});

it('removes a successfully mounted owned container on unmount', async () => {
	const view = await mountClientServerTest({
		server: { html: '<p>Ready</p>' },
		islands: {},
		handle
	});
	expect(view.container.isConnected).toBe(true);
	view.unmount();
	expect(view.container.isConnected).toBe(false);
});

it('ignores malformed hydration JSON while retaining ordinary server output', async () => {
	const view = await mountClientServerTest({
		server: {
			html: '<p>Ready</p><script id="__exact_hydration" type="application/json">{invalid</script>'
		},
		islands: {},
		handle
	});
	try {
		expect(view.container.querySelector('p')?.textContent).toBe('Ready');
	} finally {
		view.unmount();
	}
});
