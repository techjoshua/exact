/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createExactClient } from './index.js';
import {
	readRemoteIslandRenders,
	RemoteIsland,
	resetIslandFixtureObservations
} from './test-support/islands.fixtures.js';

describe('@exactjs/hydrate remote islands', () => {
	it('hydrates client islands registered by a remote component contract', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:remote-panel--><p>Loading</p><!--/exact:remote-panel-->';
		const fetch = async () => ({
			ok: true,
			status: 200,
			async json() {
				return {
					ok: true,
					type: 'refresh',
					id: 'remote-panel',
					patches: [
						{
							type: 'replace',
							id: 'remote-panel',
							html: '<div data-exact-client-boundary="remote-island" data-exact-client-name="RemoteIsland" data-exact-client-props=\'{"props":{"label":"Loaded"}}\'></div>'
						}
					]
				};
			}
		});

		const client = createExactClient(container, { endpoint: '/__exact', fetch });
		client.registerComponents({
			endpoints: { boundaries: { 'remote-panel': 'https://remote.test/__exact' } },
			islands: { RemoteIsland }
		});

		await client.refreshBoundary('remote-panel');

		expect(
			container
				.querySelector('[data-exact-client-boundary="remote-island"]')
				?.getAttribute('data-exact-client-hydrated')
		).toBe('true');
		expect(container.querySelector('button')?.textContent).toBe('Loaded');
	});

	it('hydrates existing placeholders when registering remote components', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<div data-exact-client-boundary="remote-island" data-exact-client-name="RemoteIsland" data-exact-client-props=\'{"props":{"label":"Loaded"}}\'></div>';
		resetIslandFixtureObservations();

		const client = createExactClient(container, { endpoint: '/__exact' });
		client.registerComponents({ islands: { RemoteIsland } });
		client.registerComponents({ islands: { RemoteIsland } });

		expect(
			container
				.querySelector('[data-exact-client-boundary="remote-island"]')
				?.getAttribute('data-exact-client-hydrated')
		).toBe('true');
		expect(container.querySelector('button')?.textContent).toBe('Loaded');
		expect(readRemoteIslandRenders()).toBe(1);
	});
});
