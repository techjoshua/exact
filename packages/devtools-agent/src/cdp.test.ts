import { expect, it } from 'vitest';
import { connectExactCdp } from './index.js';
import { startCdpServer } from './test-support/cdp-server.js';
import {
	verifyCdpBoundaries,
	verifyCdpDiscoveryBounds,
	verifyCdpDiscoveryCancellation,
	verifyCdpTransport
} from './test-support/cdp-journey.js';

it('retains cancellation, request capacity and target ownership on real WebSockets', async () => {
	const server = await startCdpServer();
	try {
		await verifyCdpTransport(connectExactCdp, server.origin, server.socketUrl);
		expect(server.paths).toEqual(['/', '/first', '/second']);
		expect(server.methods).toEqual(['pending', 'ready', 'ready', 'ready']);
	} finally {
		await server.close();
	}
});

it('preserves null cancellation during discovery body consumption', async () => {
	const server = await startCdpServer({ pendingDiscovery: true });
	try {
		await verifyCdpDiscoveryCancellation(connectExactCdp, server.origin);
	} finally {
		await server.close();
	}
});

it.each([null, false, 0, 'cancelled', new TypeError('cancelled')])(
	'preserves discovery header cancellation reason %s',
	async (reason) => {
		const server = await startCdpServer({ holdDiscoveryHeaders: true });
		const controller = new AbortController();
		try {
			const pending = connectExactCdp({ debugUrl: server.origin, signal: controller.signal }).then(
				() => Symbol('not rejected'),
				(error) => error
			);
			await server.discoveryStarted;
			controller.abort(reason);
			expect(await pending).toBe(reason);
		} finally {
			await server.close();
		}
	}
);

it('cleans up rejected, malformed, timed out and oversized message paths', async () => {
	const server = await startCdpServer();
	try {
		await verifyCdpBoundaries(connectExactCdp, server.socketUrl);
	} finally {
		await server.close();
	}
});

it('validates discovery byte ceilings and all operational limit options', async () => {
	const server = await startCdpServer();
	try {
		await verifyCdpDiscoveryBounds(connectExactCdp, server.origin, server.socketUrl);
	} finally {
		await server.close();
	}
});
