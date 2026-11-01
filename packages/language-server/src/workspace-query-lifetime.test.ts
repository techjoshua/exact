import type { ExactLanguageWorkspaceManager as PublicManager } from './index.js';
import type { ExactLanguageService, ExactRefactorPlan } from '@exactjs/compiler';
import type { ExactLanguageProviderStatus } from '@exactjs/language-extension-host';
import { expect, it, onTestFinished, vi } from 'vitest';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';
import {
	FakeLanguageService,
	deferred,
	lifetimeFixture
} from './test-support/workspace-manager.js';

it.each(['inspect', 'providers', 'result'] as const)(
	'refuses a retired query after %s and permits the next workspace',
	async (stage) => {
		const f = lifetimeFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'source');
		const host = f.hosts[0]!;
		const service = f.services[0]!;
		const entered = deferred();
		const release = deferred();
		onTestFinished(() => release.resolve());
		const inspection = await f.manager.inspect(f.uri);
		host.complete = vi.fn(async () => [{ provider: 'test', value: { label: 'current' } }]);
		expect(await f.manager.complete(f.uri, 0)).toHaveLength(1);
		if (stage === 'inspect') {
			service.inspect = vi.fn(async () => {
				entered.resolve();
				await release.promise;
				return inspection!;
			});
		} else if (stage === 'providers') {
			host.synchronizeProviders = vi.fn(async () => {
				entered.resolve();
				await release.promise;
			});
		} else {
			host.complete = vi.fn(async () => {
				entered.resolve();
				await release.promise;
				return [{ provider: 'test', value: { label: 'retired' } }];
			});
		}
		const calls = vi.mocked(host.complete).mock.calls.length;
		const pending = f.manager.complete(f.uri, 0);
		await entered.promise;
		await f.manager.removeRoot(f.root);
		release.resolve();
		expect(await pending).toEqual([]);
		expect(host.complete).toHaveBeenCalledTimes(calls + (stage === 'result' ? 1 : 0));
		f.manager.addRoot(f.root);
		expect(await f.manager.synchronizeDocument(f.uri, 1, 'next')).toBeDefined();
		expect(await f.manager.inspect(f.uri)).toBeDefined();
	}
);

it('refuses direct inspection and hover results after disposal', async () => {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'source');
	const inspection = await f.manager.inspect(f.uri);
	const entered = deferred();
	const release = deferred();
	onTestFinished(() => release.resolve());
	f.services[0]!.inspect = vi.fn(async () => {
		entered.resolve();
		await release.promise;
		return inspection!;
	});
	const pending = f.manager.inspect(f.uri);
	await entered.promise;
	await f.manager.dispose();
	release.resolve();
	expect(await pending).toBeUndefined();
	await expect(f.manager.inspect(f.uri)).rejects.toThrow('disposed');
	const next = lifetimeFixture();
	await next.manager.synchronizeDocument(next.uri, 1, 'next');
	const hoverEntered = deferred();
	const hoverRelease = deferred();
	onTestFinished(() => hoverRelease.resolve());
	next.hosts[0]!.hover = vi.fn(async () => {
		hoverEntered.resolve();
		await hoverRelease.promise;
		return [{ provider: 'test', value: { markdown: 'old hover' } }];
	});
	const hover = next.manager.hover(next.uri, 0);
	await hoverEntered.promise;
	await next.manager.dispose();
	hoverRelease.resolve();
	expect(await hover).toEqual([]);
});

it('refuses query and status continuation after held host acquisition', async () => {
	const f = lifetimeFixture('host');
	const synchronization = f.manager.synchronizeDocument(f.uri, 1, 'source');
	await f.entered.promise;
	await vi.mocked(f.services[0]!.inspect).mock.results[0]!.value;
	const status: ExactLanguageProviderStatus[] = [
		{
			id: 'test',
			version: '1',
			trust: 'declarative',
			capabilities: [],
			packageRoot: f.root,
			manifestPath: `${f.root}/package.json`,
			ignoredRoles: [],
			health: 'ready',
			generation: 1
		}
	];
	f.hosts[0]!.status = vi.fn(() => status);
	const pendingStatus = f.manager.providerStatus(f.uri);
	const pendingQuery = f.manager.complete(f.uri, 0);
	await vi.mocked(f.services[0]!.inspect).mock.results[1]!.value;
	const retired = f.manager.removeRoot(f.root);
	f.release.resolve();
	await retired;
	expect(await synchronization).toBeUndefined();
	expect(await pendingStatus).toEqual([]);
	expect(await pendingQuery).toEqual([]);
	expect(f.hosts[0]!.status).not.toHaveBeenCalled();
	expect(f.hosts[0]!.synchronizeProviders).not.toHaveBeenCalled();
});

it('does not allocate query/status resources after manager disposal', async () => {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'source');
	f.hosts[0]!.status = vi.fn(() => []);
	expect(await f.manager.providerStatus(f.uri)).toEqual([]);
	expect(f.hosts[0]!.status).toHaveBeenCalledOnce();
	await f.manager.dispose();
	expect(await f.manager.providerStatus(f.uri)).toEqual([]);
	expect(f.manager.providerFailure(f.uri)).toBeUndefined();
	expect(await f.manager.complete(f.uri, 0)).toEqual([]);
	expect(await f.manager.hover(f.uri, 0)).toEqual([]);
	await f.manager.dispose();
	const created = f.services.length;
	// The before-owner overlay can allocate these exact task-owned mock resources after disposal.
	for (let index = 1; index < created; index++) {
		await f.services[index]!.dispose();
		await f.hosts[index]!.dispose();
	}
	expect(created).toBe(1);
	expect(f.hosts).toHaveLength(1);
});

it.each([false, true])('fences same-record close/reopen ABA, rejected=%s', async (rejected) => {
	const f = lifetimeFixture('diagnostics');
	const old = f.manager.synchronizeDocument(f.uri, 1, 'old open');
	await f.entered.promise;
	f.hosts[0]!.diagnostics = vi.fn(async () => ({ diagnostics: [], statuses: [] }));
	await f.manager.closeDocument(f.uri);
	const next = await f.manager.synchronizeDocument(f.uri, 1, 'new open');
	if (rejected) f.release.reject('retired provider failure');
	else f.release.resolve();
	expect(await old).toBeUndefined();
	expect(next?.inspection.languageProjection.document.version).toBe(1);
	expect(f.manager.providerFailure(f.uri)).toBeUndefined();
	expect(f.services).toHaveLength(1);
});

it.each([false, true])(
	'preserves native primary and provider failure policy, retired=%s',
	async (retired) => {
		const f = lifetimeFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'source');
		const entered = deferred();
		const release = deferred();
		onTestFinished(() => release.resolve());
		f.services[0]!.inspect = vi.fn(async () => {
			entered.resolve();
			await release.promise;
			throw 0;
		});
		const outcome = f.manager.complete(f.uri, 0).then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		const direct = f.manager.inspect(f.uri).then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		await entered.promise;
		if (retired) await f.manager.removeRoot(f.root);
		release.resolve();
		expect(await outcome).toEqual(retired ? { value: [] } : { error: 0 });
		expect(await direct).toEqual(retired ? { value: undefined } : { error: 0 });
	}
);

it.each([false, true])('does not publish retired query errors, cancelled=%s', async (cancelled) => {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'source');
	const entered = deferred();
	const release = deferred();
	onTestFinished(() => release.resolve());
	const controller = new AbortController();
	f.hosts[0]!.hover = vi.fn(async () => {
		entered.resolve();
		await release.promise;
		throw undefined;
	});
	const outcome = f.manager.hover(f.uri, 0, controller.signal).then(
		(value) => ({ value }),
		(error) => ({ error })
	);
	await entered.promise;
	f.services[0]!.inspect = vi.fn(async () => {
		await release.promise;
		throw undefined;
	});
	const direct = f.manager.inspect(f.uri, controller.signal).then(
		(value) => ({ value }),
		(error) => ({ error })
	);
	await f.manager.dispose();
	if (cancelled) controller.abort();
	release.resolve();
	expect(await outcome).toEqual(cancelled ? { error: undefined } : { value: [] });
	expect(await direct).toEqual(cancelled ? { error: undefined } : { value: undefined });
	expect(f.manager.providerFailure(f.uri)).toBeUndefined();
});

it('keeps disk-backed queries available and retains live provider failure status', async () => {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'source');
	await f.manager.closeDocument(f.uri);
	expect(await f.manager.inspect(f.uri)).toBeDefined();
	f.hosts[0]!.hover = vi.fn(async () => [{ provider: 'test', value: { markdown: 'disk-backed' } }]);
	expect(await f.manager.hover(f.uri, 0)).toHaveLength(1);
	f.hosts[0]!.hover = vi.fn(async () => {
		throw 'live provider failure';
	});
	expect(await f.manager.hover(f.uri, 0)).toEqual([]);
	expect(f.manager.providerFailure(f.uri)).toBe('live provider failure');
});

it.each(['newer', 'reopen'] as const)(
	'refuses old query document identity after %s',
	async (transition) => {
		const f = lifetimeFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'old');
		const entered = deferred(),
			release = deferred();
		onTestFinished(() => release.resolve());
		f.hosts[0]!.hover = vi.fn(async () => {
			entered.resolve();
			await release.promise;
			return [{ provider: 'test', value: { markdown: 'old' } }];
		});
		const pending = f.manager.hover(f.uri, 0);
		await entered.promise;
		if (transition === 'reopen') await f.manager.closeDocument(f.uri);
		const version = transition === 'reopen' ? 1 : 2;
		expect(await f.manager.synchronizeDocument(f.uri, version, 'current')).toBeDefined();
		release.resolve();
		expect(await pending).toEqual([]);
		f.hosts[0]!.hover = vi.fn(async () => [{ provider: 'test', value: { markdown: 'current' } }]);
		expect((await f.manager.hover(f.uri, 0))[0]?.value.markdown).toBe('current');
		expect(f.services).toHaveLength(1);
	}
);

it('preserves duplicate/older admission without advancing the current synchronization', async () => {
	const f = lifetimeFixture();
	const current = await f.manager.synchronizeDocument(f.uri, 2, 'current');
	expect(await f.manager.synchronizeDocument(f.uri, 2, 'duplicate')).toBeUndefined();
	expect(await f.manager.synchronizeDocument(f.uri, 1, 'older')).toBeUndefined();
	expect((await f.manager.inspect(f.uri))?.generation).toBe(current?.inspection.generation);
});

it.each([false, true])(
	'retains only live status acquisition failures, retired=%s',
	async (retired) => {
		const f = lifetimeFixture();
		const entered = deferred(),
			release = deferred();
		let service!: FakeLanguageService;
		const manager = new ExactLanguageWorkspaceManager([f.root], true, {
			createLanguageService(options) {
				return (service = new FakeLanguageService(options));
			},
			async createLanguageExtensionHost() {
				entered.resolve();
				await release.promise;
				throw undefined;
			}
		});
		onTestFinished(async () => {
			release.resolve();
			if (!retired) await expect(manager.dispose()).rejects.toBeUndefined();
			else await manager.dispose();
			expect(service.dispose).toHaveBeenCalledOnce();
		});
		const status = manager.providerStatus(f.uri);
		await entered.promise;
		const disposal = retired
			? manager.dispose().then(
					(value) => ({ value }),
					(error) => ({ error })
				)
			: undefined;
		release.resolve();
		expect(await status).toEqual([]);
		if (retired) expect(await disposal).toEqual({ error: undefined });
		else expect(manager.providerFailure(f.uri)).toBe('undefined');
	}
);

it.each(['live', 'remove', 'dispose', 'recreate', 'newer', 'reopen'] as const)(
	'refactor publication retains only its captured owner: %s',
	async (mode) => {
		const f = lifetimeFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'old');
		const entered = deferred(),
			release = deferred();
		onTestFinished(() => release.resolve());
		const plan: ExactRefactorPlan = {
			title: 'Data-only preview',
			semanticChange: 'none',
			explanation: 'Official service-interface lifetime control',
			edits: [],
			expected: { before: 'client', after: 'client', preserved: ['placement'] }
		};
		const service: ExactLanguageService = f.services[0]!;
		service.refactor = vi.fn(async () => {
			entered.resolve();
			await release.promise;
			return plan;
		});
		const request = {
			generation: 1,
			range: { start: 0, end: 1 },
			kind: 'make-placement-explicit' as const
		};
		const pending = f.manager.refactor(f.uri, request);
		await entered.promise;
		if (mode === 'remove' || mode === 'recreate') await f.manager.removeRoot(f.root);
		if (mode === 'dispose') await f.manager.dispose();
		if (mode === 'recreate') {
			f.manager.addRoot(f.root);
			await f.manager.synchronizeDocument(f.uri, 1, 'new');
		}
		if (mode === 'newer') await f.manager.synchronizeDocument(f.uri, 2, 'new');
		if (mode === 'reopen') {
			await f.manager.closeDocument(f.uri);
			await f.manager.synchronizeDocument(f.uri, 1, 'new');
		}
		release.resolve();
		const result = await pending;
		if (mode === 'live') expect(result).toBe(plan);
		else expect(result).toBeUndefined();
		const next = lifetimeFixture();
		await next.manager.synchronizeDocument(next.uri, 1, 'following');
		const nextService: ExactLanguageService = next.services[0]!;
		nextService.refactor = vi.fn(async () => plan);
		expect(await next.manager.refactor(next.uri, request)).toBe(plan);
	}
);

it.each([0, undefined])(
	'refactor publication preserves every exact rejection: %s',
	async (primary) => {
		for (const mode of ['live', 'retired', 'cancelled'] as const) {
			const f = lifetimeFixture();
			await f.manager.synchronizeDocument(f.uri, 1, 'old');
			const entered = deferred(),
				release = deferred();
			onTestFinished(() => release.resolve());
			const controller = new AbortController();
			const service: ExactLanguageService = f.services[0]!;
			service.refactor = vi.fn(async () => {
				entered.resolve();
				await release.promise;
				throw primary;
			});
			const outcome = f.manager
				.refactor(
					f.uri,
					{ generation: 1, range: { start: 0, end: 1 }, kind: 'make-placement-explicit' },
					controller.signal
				)
				.then(
					(value) => ({ value }),
					(error) => ({ error })
				);
			await entered.promise;
			if (mode !== 'live') await f.manager.dispose();
			if (mode === 'cancelled') controller.abort();
			release.resolve();
			expect(await outcome).toEqual({ error: primary });
			expect(vi.mocked(service.refactor).mock.calls[0]?.[1]).toBe(controller.signal);
		}
	}
);

it('paired API preserves live data, signal and one-inspection affinity through the public class type', async () => {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'source');
	const service: ExactLanguageService = f.services[0]!;
	const inspection = await service.inspect(f.uri);
	service.inspect = vi.fn(async () => inspection);
	const signal = new AbortController().signal;
	f.hosts[0]!.inlayHints = vi.fn(async () => [
		{ provider: 'test', value: { position: 0, label: 'paired' } }
	]);
	const method: PublicManager['inspectWithInlayHints'] = f.manager.inspectWithInlayHints.bind(
		f.manager
	);
	const data = await method(f.uri, { start: 0, end: 1 }, signal);
	expect(data?.inspection).toEqual(inspection);
	expect(data?.contributions[0]?.value.label).toBe('paired');
	expect(service.inspect).toHaveBeenCalledOnce();
	expect(vi.mocked(service.inspect).mock.calls[0]?.[2]).toBe(signal);
	expect(vi.mocked(f.hosts[0]!.synchronizeProviders).mock.calls.at(-1)?.[1]).toBe(signal);
	expect(vi.mocked(f.hosts[0]!.inlayHints).mock.calls[0]?.[2]).toBe(signal);
	expect(vi.mocked(f.hosts[0]!.inlayHints).mock.calls[0]?.[0]).toEqual(
		inspection.languageProjection
	);
	await f.manager.dispose();
	await expect(method(f.uri, { start: 0, end: 1 })).rejects.toThrow('disposed');
});

it('paired API refuses untrusted and non-file requests without creating services', async () => {
	for (const trusted of [false, true]) {
		const createLanguageService = vi.fn();
		const manager = new ExactLanguageWorkspaceManager([], trusted, { createLanguageService });
		onTestFinished(() => manager.dispose());
		expect(
			await manager.inspectWithInlayHints(trusted ? 'untitled:paired' : 'file:///paired/Page.tsx', {
				start: 0,
				end: 1
			})
		).toBeUndefined();
		expect(createLanguageService).not.toHaveBeenCalled();
	}
});

it.each([
	{ stage: 'inspect', retired: false, aborted: false, primary: 0 },
	{ stage: 'inspect', retired: true, aborted: false, primary: undefined },
	{ stage: 'inspect', retired: true, aborted: true, primary: 0 },
	{ stage: 'provider', retired: false, aborted: false, primary: undefined },
	{ stage: 'provider', retired: true, aborted: false, primary: 0 },
	{ stage: 'provider', retired: true, aborted: true, primary: undefined }
] as const)('paired API error policy %s', async ({ stage, retired, aborted, primary }) => {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'source');
	const entered = deferred(),
		release = deferred();
	onTestFinished(() => release.resolve());
	const controller = new AbortController();
	const fail = vi.fn(async () => {
		entered.resolve();
		await release.promise;
		throw primary;
	});
	const service: ExactLanguageService = f.services[0]!;
	if (stage === 'inspect') service.inspect = fail;
	else f.hosts[0]!.inlayHints = fail;
	const outcome = f.manager
		.inspectWithInlayHints(f.uri, { start: 0, end: 1 }, controller.signal)
		.then(
			(value) => ({ value }),
			(error) => ({ error })
		);
	await entered.promise;
	if (retired) await f.manager.dispose();
	if (aborted) controller.abort();
	release.resolve();
	const result = await outcome;
	if (aborted || (stage === 'inspect' && !retired)) expect(result).toEqual({ error: primary });
	else if (retired) expect(result).toEqual({ value: undefined });
	else {
		expect(result).toHaveProperty('value.inspection');
		expect(result).toHaveProperty('value.contributions', []);
		expect(f.manager.providerFailure(f.uri)).toBe('undefined');
	}
});
