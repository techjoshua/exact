import type { SecretProviderContext } from './config.js';
import { expect, it, vi } from 'vitest';
import { createSecretResolver } from './server.js';
import { secret } from './values.js';
import type { Secret } from './values.js';

/** Holds a provider result across initialization ownership transitions. */
function providerGate() {
	let release!: (values: Record<string, Secret<string>>) => void;
	const promise = new Promise<Record<string, Secret<string>>>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

it('shares overlapping initialization without invoking the same provider twice', async () => {
	const held = providerGate();
	const load = vi.fn(() => held.promise);
	const resolver = createSecretResolver(
		{ providers: [{ name: 'held', load }], required: [], allowPackages: [] },
		{
			applicationRoot: '/app',
			environment: 'test',
			signal: new AbortController().signal
		}
	);
	const first = resolver.initialize();
	const second = resolver.initialize();
	await expect.poll(() => load.mock.calls.length > 0).toBe(true);
	const calls = load.mock.calls.length;
	held.release({ TOKEN: secret('TOKEN', 'ready') });
	await Promise.all([first, second]);
	expect(calls).toBe(1);
	expect(resolver.require('TOKEN')).toBe('ready');
	await resolver.dispose();
});

it('cannot republish a held provider result after disposal', async () => {
	const held = providerGate();
	const load = vi.fn(() => held.promise);
	const resolver = createSecretResolver(
		{ providers: [{ name: 'held', load }], required: [], allowPackages: [] },
		{
			applicationRoot: '/app',
			environment: 'test',
			signal: new AbortController().signal
		}
	);
	const pending = resolver.initialize();
	const outcome = Promise.allSettled([pending]);
	await expect.poll(() => load.mock.calls.length).toBe(1);
	await resolver.dispose();
	held.release({ TOKEN: secret('TOKEN', 'retired') });
	expect((await outcome)[0]?.status).toBe('rejected');
	expect(() => resolver.optional('TOKEN')).toThrow('has not been initialized');
});

it('does not retain partial values from a failed initialization when retried', async () => {
	let attempt = 0;
	const resolver = createSecretResolver(
		{
			providers: [
				{
					name: 'first',
					async load() {
						const values: Record<string, Secret<string>> = {};
						if (++attempt === 1) values.OLD = secret('OLD', 'retired');
						return values;
					}
				},
				{
					name: 'second',
					async load() {
						if (attempt === 1) throw new Error('provider failed');
						return { NEW: secret('NEW', 'ready') };
					}
				}
			],
			required: [],
			allowPackages: []
		},
		{ applicationRoot: '/app', environment: 'test', signal: new AbortController().signal }
	);
	await expect(resolver.initialize()).rejects.toThrow('provider failed');
	await resolver.initialize();
	expect(resolver.optional('OLD')).toBeUndefined();
	expect(resolver.require('NEW')).toBe('ready');
	await resolver.dispose();
});

it('retains an explicitly configured empty secret', async () => {
	const resolver = createSecretResolver(
		{
			providers: [
				{
					name: 'empty',
					async load() {
						return { TOKEN: secret('TOKEN', '') };
					}
				}
			],
			required: ['TOKEN'],
			allowPackages: []
		},
		{
			applicationRoot: '/app',
			environment: 'test',
			signal: new AbortController().signal
		}
	);
	await resolver.initialize();
	expect(resolver.optional('TOKEN')).toBe('');
	expect(resolver.require('TOKEN')).toBe('');
	await resolver.dispose();
});

it('isolates a new initialization from a retired provider completion', async () => {
	const old = providerGate(),
		next = providerGate();
	const load = vi
		.fn()
		.mockImplementationOnce(() => old.promise)
		.mockImplementation(() => next.promise);
	const resolver = createSecretResolver(
		{ providers: [{ name: 'held', load }], required: [], allowPackages: [] },
		{
			applicationRoot: '/app',
			environment: 'test',
			signal: new AbortController().signal
		}
	);
	const first = Promise.allSettled([resolver.initialize()]);
	await expect.poll(() => load.mock.calls.length).toBe(1);
	await resolver.dispose();
	const second = resolver.initialize();
	await expect.poll(() => load.mock.calls.length).toBe(2);
	old.release({ OLD: secret('OLD', 'retired') });
	expect((await first)[0]?.status).toBe('rejected');
	const shared = resolver.initialize();
	expect(shared).toBe(second);
	next.release({ NEW: secret('NEW', 'ready') });
	await Promise.all([second, shared]);
	expect(load).toHaveBeenCalledTimes(2);
	expect(resolver.optional('OLD')).toBeUndefined();
	expect(resolver.require('NEW')).toBe('ready');
	await resolver.dispose();
});

it.each(['before', 'during'])(
	'fences provider initialization when cancellation arrives %s loading',
	async (timing) => {
		const held = providerGate();
		const controller = new AbortController();
		let providerSignal!: AbortSignal;
		const load = vi.fn((context: SecretProviderContext) => {
			providerSignal = context.signal;
			return held.promise;
		});
		const later = vi.fn(async () => ({}));
		const resolver = createSecretResolver(
			{
				providers: [
					{ name: 'held', load },
					{ name: 'later', load: later }
				],
				required: [],
				allowPackages: []
			},
			{
				applicationRoot: '/app',
				environment: 'test',
				signal: controller.signal
			}
		);
		const reason = new Error('startup cancelled');
		if (timing === 'before') controller.abort(reason);
		const pending = resolver.initialize();
		const rejected = expect(pending).rejects.toBe(reason);
		if (timing === 'during') {
			await expect.poll(() => load.mock.calls.length).toBe(1);
			controller.abort(reason);
			expect(providerSignal.aborted).toBe(true);
			expect(providerSignal.reason).toBe(reason);
		}
		held.release({ TOKEN: secret('TOKEN', 'retired') });
		await rejected;
		if (timing === 'before') expect(load).not.toHaveBeenCalled();
		expect(later).not.toHaveBeenCalled();
		expect(() => resolver.optional('TOKEN')).toThrow('has not been initialized');
		await resolver.dispose();
	}
);
