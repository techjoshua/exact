import { expect, it } from 'vitest';
import { migrationFixture } from './test-support/workspace-migration.js';

// Before-owner fallback exercises the actual low-level folder behavior, never a missing-method error.
async function reconcile(
	f: ReturnType<typeof migrationFixture>,
	added: string[],
	removed: string[],
	source: string,
	version = 2
) {
	const manager: Pick<typeof f.manager, 'addRoot' | 'removeRoot'> &
		Partial<Pick<typeof f.manager, 'reconcileWorkspaceFolders'>> = f.manager;
	if (manager.reconcileWorkspaceFolders) {
		return await manager.reconcileWorkspaceFolders({ added, removed }, [f.input(version, source)])
			.completion;
	}
	for (const root of added) manager.addRoot(root);
	for (const root of removed) await manager.removeRoot(root);
	return [];
}

it('migration preserves current unsaved input when returning to the outer project', async () => {
	const f = migrationFixture();
	writeFileSync(path.join(f.root, 'exact.config.ts'), 'export default {};\n');
	await f.manager.synchronizeDocument(f.uri, 1, 'before');
	await reconcile(f, [f.inner], [], 'before', 1);
	await f.manager.synchronizeDocument(f.uri, 2, 'after');
	await reconcile(f, [], [f.inner], 'after');
	const current = await f.manager.inspect(f.uri);
	expect(current?.languageProjection.document.text).toBe('after');
	expect(current?.languageProjection.document.version).toBe(2);
	const result = await f.manager.synchronizeDocument(f.uri, 3, 'latest');
	expect(result?.inspection.languageProjection.document.text).toBe('latest');
});

it('migration recreates same-key inferred and configured constructor context', async () => {
	const f = migrationFixture(false);
	await f.manager.synchronizeDocument(f.uri, 1, 'before');
	const before = f.services[0]!;
	await reconcile(f, [f.inner], [], 'current');
	const configured = await f.manager.inspect(f.uri);
	expect(configured?.project?.kind).toBe('configured');
	expect(before.dispose).toHaveBeenCalledOnce();
	await reconcile(f, [], [f.inner], 'current');
	expect((await f.manager.inspect(f.uri))?.project?.kind).toBe('inferred');
});

import { onTestFinished, vi } from 'vitest';
import { deferred } from './test-support/workspace-manager.js';

it.each(['edit', 'reopen'] as const)(
	'preparation orders held seed before %s and refuses early queries',
	async (mode) => {
		const f = migrationFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'old');
		const entered = deferred(),
			release = deferred();
		onTestFinished(() => release.resolve());
		f.prepareNext((service) => {
			service.before = async () => {
				service.before = undefined;
				entered.resolve();
				await release.promise;
			};
		});
		const input = f.input(1, 'seed');
		const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [input]);
		expect(batch.affectedInputs[0]).toBe(input);
		await entered.promise;
		expect(await f.manager.inspect(f.uri)).toBeUndefined();
		expect(await f.manager.inlayHints(f.uri, { start: 0, end: 1 })).toEqual([]);
		const plan = f.manager.refactor(f.uri, {
			generation: 1,
			range: { start: 0, end: 1 },
			kind: 'make-placement-explicit'
		});
		expect(await plan).toBeUndefined();
		let close: Promise<void> | undefined;
		if (mode === 'reopen') close = f.manager.closeDocument(f.uri);
		const edit = f.manager.synchronizeDocument(f.uri, mode === 'edit' ? 2 : 1, 'current');
		release.resolve();
		await close;
		expect(await batch.completion).toEqual({ results: [], errors: [] });
		expect((await edit)?.inspection.languageProjection.document.text).toBe('current');
		const current = f.services.at(-1)!;
		expect(current.inputs.get(f.filename)?.source).toBe('current');
		expect(current.deliveries).toEqual(
			mode === 'edit'
				? ['upsert:1:seed', 'upsert:2:current']
				: ['upsert:1:seed', 'close', 'upsert:1:current']
		);
		expect((await f.manager.inspect(f.uri))?.languageProjection.document.text).toBe('current');
	}
);

it('keeps compatible no-op and independent project identities', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'same');
	const current = f.services[0]!;
	const input = f.input(1, 'same');
	const noop = f.manager.reconcileWorkspaceFolders({ added: [f.root], removed: [] }, [input]);
	expect(noop.affectedInputs).toEqual([]);
	await noop.completion;
	expect(f.services).toHaveLength(1);
	expect(current.dispose).not.toHaveBeenCalled();
	const both = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [f.inner] }, [
		input
	]);
	expect(both.affectedInputs).toEqual([]);
	await both.completion;
	expect(f.services).toHaveLength(1);
});

it.each([0, undefined])(
	'core failure preserves exact primary and cleans every owned resource: %s',
	async (primary) => {
		const f = migrationFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'old');
		f.prepareNext((service) => {
			service.before = async () => {
				throw primary;
			};
			service.dispose.mockImplementationOnce(async () => {
				throw new Error('cleanup secondary');
			});
		});
		const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
			f.input(2, 'current')
		]);
		const result = await batch.completion;
		expect(result.results).toEqual([]);
		expect(result.errors).toHaveLength(2);
		expect(result.errors[0]).toBe(primary);
		expect(result.errors[1]).toMatchObject({ message: 'cleanup secondary' });
		for (const service of f.services) expect(service.dispose).toHaveBeenCalledOnce();
		for (const host of f.hosts) expect(host.dispose).toHaveBeenCalledOnce();
		const count = f.services.length;
		expect(await f.manager.inspect(f.uri)).toBeUndefined();
		expect(await f.manager.inlayHints(f.uri, { start: 0, end: 1 })).toEqual([]);
		expect(await f.manager.providerStatus(f.uri)).toEqual([]);
		expect(f.services).toHaveLength(count);
		f.prepareNext();
		const retry = f.manager.reconcileWorkspaceFolders({ added: [], removed: [] }, [
			f.input(2, 'current')
		]);
		// The old cleanup was already attempted. Its failure remains observable on explicit retirement,
		// without re-invoking disposal or hiding the successfully delivered current replacement input.
		expect((await retry.completion).errors).toEqual([
			expect.objectContaining({ message: 'cleanup secondary' })
		]);
		expect((await f.manager.inspect(f.uri))?.languageProjection.document.text).toBe('current');
		expect(
			await f.manager.reconcileWorkspaceFolders({ added: [], removed: [] }, [f.input(2, 'current')])
				.completion
		).toEqual({ results: [], errors: [] });
	}
);

it('a later folder plan retires a held preparation without restoring its roots or source', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old');
	const entered = deferred(),
		release = deferred();
	onTestFinished(() => release.resolve());
	f.prepareNext((service) => {
		service.before = async () => {
			service.before = undefined;
			entered.resolve();
			await release.promise;
		};
	});
	const first = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
		f.input(2, 'middle')
	]);
	await entered.promise;
	const retiredService = f.services.at(-1)!;
	const queued = f.manager.synchronizeDocument(f.uri, 3, 'retired edit');
	f.prepareNext();
	const second = f.manager.reconcileWorkspaceFolders({ added: [], removed: [f.inner] }, [
		f.input(4, 'final')
	]);
	expect(
		(await second.completion).results[0]?.synchronization.inspection.languageProjection.document
			.text
	).toBe('final');
	release.resolve();
	expect(await first.completion).toEqual({ results: [], errors: [] });
	expect(await queued).toBeUndefined();
	expect(retiredService.deliveries).toEqual(['upsert:2:middle']);
	expect((await f.manager.inspect(f.uri))?.languageProjection.document.text).toBe('final');
});

it('failed reservation refuses queries during cleanup and after settlement, then explicitly reseeds', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old');
	const cleaning = deferred(),
		release = deferred();
	onTestFinished(() => release.resolve());
	f.prepareNext((service) => {
		service.before = async () => {
			throw 0;
		};
		service.dispose.mockImplementationOnce(async () => {
			cleaning.resolve();
			await release.promise;
		});
	});
	const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
		f.input(2, 'current')
	]);
	const outcome = batch.completion;
	await cleaning.promise;
	const count = f.services.length;
	expect(await f.manager.inspect(f.uri)).toBeUndefined();
	expect(f.services).toHaveLength(count);
	release.resolve();
	expect((await outcome).errors).toStrictEqual([0]);
	expect(await f.manager.inspect(f.uri)).toBeUndefined();
	expect(f.services).toHaveLength(count);
	f.prepareNext();
	const retried = await f.manager.reconcileWorkspaceFolders({ added: [], removed: [] }, [
		f.input(2, 'current')
	]).completion;
	expect(retried.results[0]?.synchronization.inspection.languageProjection.document.text).toBe(
		'current'
	);
});

it('ordinary explicit edit replaces an unavailable slot without retrying siblings', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old');
	f.prepareNext((service) => {
		service.before = async () => {
			throw undefined;
		};
	});
	expect(
		(
			await f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
				f.input(2, 'seed')
			]).completion
		).errors
	).toStrictEqual([undefined]);
	f.prepareNext();
	expect(
		(await f.manager.synchronizeDocument(f.uri, 3, 'edited'))?.inspection.languageProjection
			.document.text
	).toBe('edited');
});

it('skips superseded queued input and preserves explicit duplicate/older admission', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old');
	const entered = deferred(),
		release = deferred();
	onTestFinished(() => release.resolve());
	f.prepareNext((service) => {
		service.before = async () => {
			service.before = undefined;
			entered.resolve();
			await release.promise;
		};
	});
	const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
		f.input(1, 'seed')
	]);
	await entered.promise;
	const middle = f.manager.synchronizeDocument(f.uri, 2, 'middle');
	const latest = f.manager.synchronizeDocument(f.uri, 3, 'latest');
	expect(await f.manager.synchronizeDocument(f.uri, 3, 'duplicate')).toBeUndefined();
	expect(await f.manager.synchronizeDocument(f.uri, 2, 'older')).toBeUndefined();
	release.resolve();
	await batch.completion;
	expect(await middle).toBeUndefined();
	expect((await latest)?.inspection.languageProjection.document.text).toBe('latest');
	expect(f.services.at(-1)?.deliveries).toEqual(['upsert:1:seed', 'upsert:3:latest']);
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExactRefactorPlan, ExactLanguageService } from '@exactjs/compiler';

it('reseeds shared project siblings but retains independent and nested-config sessions', async () => {
	const f = migrationFixture();
	const nested = path.join(f.root, 'stable');
	mkdirSync(nested);
	writeFileSync(path.join(nested, 'exact.config.ts'), 'export default {};\n');
	const independent = mkdtempSync(path.join(tmpdir(), 'exact-independent-folder-'));
	onTestFinished(() => rmSync(independent, { recursive: true, force: true }));
	f.manager.addRoot(independent);
	const make = (filename: string, source: string) => ({
		uri: pathToFileURL(filename).href,
		version: 1,
		source
	});
	const sibling = make(path.join(f.root, 'Sibling.tsx'), 'sibling');
	const stable = make(path.join(nested, 'Page.tsx'), 'nested');
	const separate = make(path.join(independent, 'Page.tsx'), 'independent');
	const inputs = [f.input(1, 'current'), sibling, stable, separate];
	for (const input of inputs)
		await f.manager.synchronizeDocument(input.uri, input.version, input.source);
	const nestedService = f.services.find((service) => service.creation.root === nested)!;
	const independentService = f.services.find((service) => service.creation.root === independent)!;
	const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, inputs);
	expect(batch.affectedInputs).toEqual(inputs.slice(0, 2));
	await batch.completion;
	expect(nestedService.dispose).not.toHaveBeenCalled();
	expect(independentService.dispose).not.toHaveBeenCalled();
	expect((await f.manager.inspect(stable.uri))?.languageProjection.document.text).toBe('nested');
	expect((await f.manager.inspect(separate.uri))?.languageProjection.document.text).toBe(
		'independent'
	);
	expect((await f.manager.inspect(sibling.uri))?.languageProjection.document.text).toBe('sibling');
});

it('migration preserves actual provider input affinity and refuses held old query/refactor success', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old');
	const entered = deferred(),
		release = deferred();
	onTestFinished(() => release.resolve());
	let count = 0;
	const hold = async () => {
		if (++count === 2) entered.resolve();
		await release.promise;
	};
	f.hosts[0]!.inlayHints = async () => {
		await hold();
		return [{ provider: 'old', value: { position: 0, label: 'old' } }];
	};
	const plan: ExactRefactorPlan = {
		title: 'data',
		semanticChange: 'none',
		explanation: 'Service ownership control',
		edits: [],
		expected: { before: 'client', after: 'client', preserved: [] }
	};
	const oldService: ExactLanguageService = f.services[0]!;
	oldService.refactor = async () => {
		await hold();
		return plan;
	};
	const hints = f.manager.inlayHints(f.uri, { start: 0, end: 1 });
	const refactor = f.manager.refactor(f.uri, {
		generation: 1,
		range: { start: 0, end: 1 },
		kind: 'make-placement-explicit'
	});
	await entered.promise;
	await f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
		f.input(2, 'current')
	]).completion;
	release.resolve();
	expect(await hints).toEqual([]);
	expect(await refactor).toBeUndefined();
	const current = f.hosts.at(-1)!;
	current.inlayHints = vi.fn(async () => []);
	expect(
		(await f.manager.inspectWithInlayHints(f.uri, { start: 0, end: 1 }))?.inspection
			.languageProjection.document.text
	).toBe('current');
	expect(vi.mocked(current.inlayHints).mock.calls[0]?.[0].document).toMatchObject({
		version: 2,
		text: 'current'
	});
});

it.each([0, undefined])(
	'normal retirement attempts every resource before exact cleanup rejection: %s',
	async (primary) => {
		const f = migrationFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'old');
		f.services[0]!.dispose.mockImplementationOnce(() => {
			throw primary;
		});
		await expect(f.manager.removeRoot(f.root)).rejects.toBe(primary);
		expect(f.services[0]!.dispose).toHaveBeenCalledOnce();
		expect(f.hosts[0]!.dispose).toHaveBeenCalledOnce();
	}
);

it.each([0, undefined])(
	'appended core failure remains exact for its edit and owning batch: %s',
	async (primary) => {
		const f = migrationFixture();
		await f.manager.synchronizeDocument(f.uri, 1, 'old');
		const entered = deferred(),
			release = deferred();
		onTestFinished(() => release.resolve());
		f.prepareNext((service) => {
			let calls = 0;
			service.before = async () => {
				if (++calls === 1) {
					entered.resolve();
					await release.promise;
				} else throw primary;
			};
		});
		const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
			f.input(1, 'seed')
		]);
		const batchOutcome = batch.completion;
		await entered.promise;
		const edited = f.manager.synchronizeDocument(f.uri, 2, 'current').then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		release.resolve();
		expect(await edited).toStrictEqual({ error: primary });
		expect((await batchOutcome).errors).toStrictEqual([primary]);
		expect(await f.manager.inspect(f.uri)).toBeUndefined();
	}
);

it('migration live current input and following ordinary edit remain available', async () => {
	const f = migrationFixture();
	expect(
		(await f.manager.synchronizeDocument(f.uri, 1, 'live'))?.inspection.languageProjection.document
			.text
	).toBe('live');
	expect((await f.manager.inspect(f.uri))?.languageProjection.document.version).toBe(1);
	expect(
		(await f.manager.synchronizeDocument(f.uri, 2, 'next'))?.inspection.languageProjection.document
			.text
	).toBe('next');
});

it('held close mutates before a same-version reopen during preparation', async () => {
	const f = migrationFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old');
	const seeded = deferred(),
		seedRelease = deferred(),
		closing = deferred(),
		closeRelease = deferred();
	onTestFinished(() => {
		seedRelease.resolve();
		closeRelease.resolve();
	});
	f.prepareNext((service) => {
		service.before = async (changes) => {
			if (changes[0]?.kind === 'close') {
				closing.resolve();
				await closeRelease.promise;
			} else if (changes[0]?.kind === 'upsert' && changes[0].source === 'seed') {
				seeded.resolve();
				await seedRelease.promise;
			}
		};
	});
	const batch = f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, [
		f.input(1, 'seed')
	]);
	await seeded.promise;
	const closed = f.manager.closeDocument(f.uri);
	const reopened = f.manager.synchronizeDocument(f.uri, 1, 'reopened');
	seedRelease.resolve();
	await closing.promise;
	expect(f.services.at(-1)?.inputs.get(f.filename)?.source).toBe('seed');
	expect(await f.manager.inspect(f.uri)).toBeUndefined();
	closeRelease.resolve();
	await closed;
	await batch.completion;
	expect((await reopened)?.inspection.languageProjection.document.text).toBe('reopened');
	expect(f.services.at(-1)?.deliveries).toEqual(['upsert:1:seed', 'close', 'upsert:1:reopened']);
});

it('cached empty incompatible projects retire without eagerly creating a destination', async () => {
	const f = migrationFixture(false);
	expect((await f.manager.inspect(f.uri))?.project?.kind).toBe('inferred');
	await f.manager.reconcileWorkspaceFolders({ added: [f.inner], removed: [] }, []).completion;
	expect(f.services).toHaveLength(1);
	expect(f.services[0]!.dispose).toHaveBeenCalledOnce();
	expect((await f.manager.inspect(f.uri))?.project?.kind).toBe('configured');
	expect(f.services).toHaveLength(2);
});
