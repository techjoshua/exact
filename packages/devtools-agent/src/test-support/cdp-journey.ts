import type { connectExactCdp } from '../cdp.js';

/** Exercises the public CDP transport against an owned discovery and WebSocket service. */
export async function verifyCdpTransport(
	connect: typeof connectExactCdp,
	origin: string,
	socketUrl: string
): Promise<void> {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('CDP transport: ' + message);
	};
	const controller = new AbortController();
	controller.abort(null);
	let caught: unknown = Symbol('not rejected');
	try {
		await connect({ webSocketUrl: socketUrl, signal: controller.signal });
	} catch (error) {
		caught = error;
	}
	check(caught === null, 'connection reason');
	const transport = await connect({
		webSocketUrl: socketUrl,
		maxPendingRequests: 1,
		requestTimeoutMs: 1000
	});
	try {
		const owner = new AbortController();
		const pending = transport.request('pending', {}, owner.signal).then(
			() => Symbol('not rejected'),
			(error) => error
		);
		await fetch(origin + '/pending');
		let full = false;
		try {
			await transport.request('overflow');
		} catch {
			full = true;
		}
		check(full, 'pending request capacity');
		owner.abort(null);
		check((await pending) === null, 'request reason');
		check(
			(await transport.request<{ value: string }>('ready')).value === 'ready',
			'capacity recovers'
		);
	} finally {
		await transport.close();
	}
	let closed: unknown;
	try {
		await transport.request('after-close');
	} catch (error) {
		closed = error;
	}
	check(
		closed instanceof Error && closed.message === 'CDP socket closed',
		'closed transport rejects without sending'
	);
	let missing = false;
	try {
		const unexpected = await connect({ debugUrl: origin, targetId: 'missing' });
		await unexpected.close();
	} catch {
		missing = true;
	}
	check(missing, 'explicit target never falls back');
	for (const targetId of [undefined, 'second']) {
		const transport = await connect({ debugUrl: origin, targetId });
		try {
			check(
				(await transport.request<{ value: string }>('ready')).value === 'ready',
				'target success'
			);
		} finally {
			await transport.close();
		}
	}
}

/** Observes real response-reader creation so cancellation occurs during native discovery reads. */
export async function verifyCdpDiscoveryCancellation(
	connect: typeof connectExactCdp,
	origin: string
): Promise<void> {
	const controller = new AbortController();
	const nativeFetch = globalThis.fetch;
	let started!: () => void;
	const reading = new Promise<void>((resolve) => {
		started = resolve;
	});
	globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
		const response = await nativeFetch(...args);
		const body = response.body!;
		const getReader = body.getReader.bind(body);
		body.getReader = (() => {
			started();
			return getReader();
		}) as typeof body.getReader;
		return response;
	};
	try {
		const connecting = connect({ debugUrl: origin, signal: controller.signal }).then(
			() => Symbol('not rejected'),
			(error) => error
		);
		await reading;
		controller.abort(null);
		if ((await connecting) !== null)
			throw new Error('Discovery body cancellation lost exact reason');
	} finally {
		globalThis.fetch = nativeFetch;
	}
}

/** Cancels the native discovery fetch before headers arrive, using the server's entered gate. */
export async function verifyCdpHeaderCancellation(
	connect: typeof connectExactCdp,
	origin: string
): Promise<void> {
	const controller = new AbortController();
	const connecting = connect({ debugUrl: origin, signal: controller.signal }).then(
		() => Symbol('not rejected'),
		(error) => error
	);
	await fetch(origin + '/entered');
	controller.abort(null);
	if ((await connecting) !== null)
		throw new Error('Discovery header cancellation lost exact reason');
}

/** Covers malformed frames, event ownership, failure cleanup, timeouts and byte-limited shutdown. */
export async function verifyCdpBoundaries(
	connect: typeof connectExactCdp,
	socketUrl: string
): Promise<void> {
	const rejects = async (promise: Promise<unknown>, message: string) => {
		let caught: unknown;
		try {
			await promise;
		} catch (error) {
			caught = error;
		}
		if (!(caught instanceof Error) || !caught.message.includes(message))
			throw new Error('CDP boundary did not reject: ' + message);
	};
	const transport = await connect({
		webSocketUrl: socketUrl,
		maxPendingRequests: 1,
		requestTimeoutMs: 100
	});
	try {
		const result = await transport.request<{ value: string }>('protocol');
		if (result.value !== 'ready') throw new Error('Malformed frames displaced matching response');
		let events = 0;
		const unsubscribe = transport.onEvent((method, params) => {
			if (method !== 'changed' || (params as { value: number }).value !== 1)
				throw new Error('Event payload changed');
			events++;
		});
		await transport.request('event');
		unsubscribe();
		await transport.request('event');
		if (events !== 1) throw new Error('Event subscription ownership changed');
		await rejects(transport.request('failure'), 'rejected by target');
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		await rejects(transport.request('serialize', cyclic), '');
		await rejects(transport.request('pending'), 'timed out');
		if ((await transport.request<{ value: string }>('ready')).value !== 'ready')
			throw new Error('Failed request retained capacity');
	} finally {
		await transport.close();
	}
	for (const method of ['oversized', 'close']) {
		const transport = await connect({ webSocketUrl: socketUrl, maxMessageBytes: 80 });
		try {
			await rejects(transport.request(method), 'socket closed');
		} finally {
			await transport.close();
		}
	}
}

/** Accepts an exact UTF-8 discovery ceiling and rejects undersized or invalid operational ceilings. */
export async function verifyCdpDiscoveryBounds(
	connect: typeof connectExactCdp,
	origin: string,
	socketUrl: string
): Promise<void> {
	const text = await (await fetch(origin + '/json/list')).text();
	const bytes = new TextEncoder().encode(text).byteLength;
	const transport = await connect({ debugUrl: origin, maxDiscoveryBytes: bytes });
	await transport.close();
	let oversized: unknown;
	try {
		await connect({ debugUrl: origin, maxDiscoveryBytes: bytes - 1 });
	} catch (error) {
		oversized = error;
	}
	if (!(oversized instanceof Error) || !oversized.message.includes('byte limit'))
		throw new Error('Discovery byte bound failed');
	for (const option of [
		'connectTimeoutMs',
		'requestTimeoutMs',
		'maxDiscoveryBytes',
		'maxPendingRequests',
		'maxMessageBytes'
	] as const) {
		for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			let invalid: unknown;
			try {
				await connect({ webSocketUrl: socketUrl, [option]: value });
			} catch (error) {
				invalid = error;
			}
			if (!(invalid instanceof Error) || !invalid.message.includes(option))
				throw new Error('Invalid CDP limit accepted: ' + option);
		}
	}
}
