// @vitest-environment jsdom
import { expect, it, onTestFinished, vi } from 'vitest';
import type { ExactClient } from '@exactjs/hydrate';
import type { ExactRemoteModule } from './artifacts.js';
import { RemoteComponent } from './client.js';
import { registerExactRemoteRecovery } from './recovery.js';

it('cancels preparation only after the last recovery member leaves', async () => {
	const symbol = Symbol.for('@exactjs/microfrontends/remote-loader');
	const host = globalThis as Record<PropertyKey, unknown>;
	const previous = host[symbol];
	let signal: AbortSignal | undefined;
	host[symbol] = {
		load(_url: string, _integrity: string, owner: AbortSignal) {
			signal = owner;
			return new Promise((_resolve, reject) =>
				owner.addEventListener('abort', () => reject(owner.reason), { once: true })
			);
		},
		publish() {}
	};
	const module: ExactRemoteModule = {
		buildKey: 'a'.repeat(40),
		root: 'recovery#./Area',
		component: RemoteComponent,
		registration: {}
	};
	const resolveClientEntry = vi.fn(async () => ({
		clientEntry: 'https://remote.test/recovery-ownership.js',
		integrity: 'sha256-AAAA'
	}));
	const binding = { clientEntry: 'https://remote.test/current.js', resolveClientEntry };
	const member = () => ({
		client: {
			retire: vi.fn(),
			whenSettled: async () => {},
			pendingRequests: 0
		} as unknown as ExactClient,
		replace: vi.fn(),
		fail: vi.fn()
	});
	const first = registerExactRemoteRecovery('ownership', binding, module, member());
	const second = registerExactRemoteRecovery('ownership', binding, module, member());
	onTestFinished(() => {
		first.unregister();
		second.unregister();
		if (previous === undefined) delete host[symbol];
		else host[symbol] = previous;
	});
	first.response({ status: 200, preferredBuildKey: 'b'.repeat(40) });
	await vi.waitFor(() => expect(signal).toBeDefined());
	first.unregister();
	expect(signal!.aborted).toBe(false);
	second.unregister();
	await vi.waitFor(() => expect(signal!.aborted).toBe(true));
	const replacement = registerExactRemoteRecovery('ownership', binding, module, member());
	onTestFinished(() => replacement.unregister());
	// A retained old registration must not remove the new coordinator.
	first.unregister();
	const joined = registerExactRemoteRecovery('ownership', binding, module, member());
	onTestFinished(() => joined.unregister());
	replacement.response({ status: 200, preferredBuildKey: 'b'.repeat(40) });
	joined.response({ status: 200, preferredBuildKey: 'b'.repeat(40) });
	await vi.waitFor(() => expect(resolveClientEntry).toHaveBeenCalledTimes(2));
});

it('starts no module load when discovery finishes after its last member leaves', async () => {
	let resolve!: (value: { clientEntry: string; integrity: string }) => void;
	const discovery = new Promise<{ clientEntry: string; integrity: string }>((done) => {
		resolve = done;
	});
	const symbol = Symbol.for('@exactjs/microfrontends/remote-loader');
	const host = globalThis as Record<PropertyKey, unknown>;
	const previous = host[symbol];
	const load = vi.fn();
	host[symbol] = { load, publish() {} };
	const registration = registerExactRemoteRecovery(
		'late-discovery',
		{
			clientEntry: 'https://remote.test/current.js',
			resolveClientEntry: () => discovery
		},
		{
			buildKey: 'a'.repeat(40),
			root: 'recovery#./Area',
			component: RemoteComponent,
			registration: {}
		},
		{
			client: { retire() {} } as unknown as ExactClient,
			replace: vi.fn(),
			fail: vi.fn()
		}
	);
	onTestFinished(() => {
		registration.unregister();
		if (previous === undefined) delete host[symbol];
		else host[symbol] = previous;
	});
	registration.response({ status: 200, preferredBuildKey: 'b'.repeat(40) });
	registration.unregister();
	resolve({ clientEntry: 'https://remote.test/late.js', integrity: 'sha256-AAAA' });
	await discovery;
	await Promise.resolve();
	await Promise.resolve();
	expect(load).not.toHaveBeenCalled();
});
