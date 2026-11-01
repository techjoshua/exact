import { pathToFileURL, fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { folderFailureFixture } from './test-support/workspace-folder-failures.js';
import { folderLifecycle } from './test-support/workspace-folder-lifecycle.js';

it.each(['none', 'first', 'second'] as const)(
	'destination setup remains owned and unavailable until seeded: %s',
	async (fault) => {
		const f = folderFailureFixture();
		await f.open();
		f.faults.beforeCreate = (options) => {
			if (options.root === (fault === 'first' ? f.a : fault === 'second' ? f.b : '')) throw 0;
		};
		if (fault === 'second')
			f.services[0]!.dispose.mockImplementationOnce(async () => {
				throw undefined;
			});
		let batch: ReturnType<typeof f.manager.reconcileWorkspaceFolders> | undefined;
		let threw = false;
		try {
			batch = f.manager.reconcileWorkspaceFolders(f.change, f.inputs);
		} catch {
			threw = true;
		}
		expect(threw).toBe(false);
		expect(batch).toBeDefined();
		expect(batch!.affectedInputs).toEqual(f.inputs);
		const data = await batch!.completion;
		expect(data.errors).toStrictEqual(
			fault === 'none' ? [] : fault === 'first' ? [0] : [0, undefined]
		);
		expect(data.results.map((result) => result.input.uri)).toEqual(
			fault === 'none'
				? f.inputs.map((input) => input.uri)
				: [f.inputs[fault === 'first' ? 1 : 0]!.uri]
		);
		for (const input of f.inputs) {
			const failed = input === f.inputs[fault === 'first' ? 0 : 1] && fault !== 'none';
			const count = f.services.length;
			const inspection = await f.manager.inspect(input.uri);
			if (failed) {
				expect(inspection).toBeUndefined();
				expect(f.services).toHaveLength(count);
			} else expect(inspection?.languageProjection.document.text).toBe(input.source);
		}
		expect(f.services[0]!.dispose).toHaveBeenCalledOnce();
		expect(f.hosts[0]!.dispose).toHaveBeenCalledOnce();
		f.faults.beforeCreate = undefined;
		const retry = await f.manager.reconcileWorkspaceFolders({ added: [], removed: [] }, f.inputs)
			.completion;
		expect(retry.errors).toEqual([]);
		for (const input of f.inputs)
			expect((await f.manager.inspect(input.uri))?.languageProjection.document.text).toBe(
				input.source
			);
	}
);

it.each([0, undefined])(
	'registered mixed core failure publishes current sibling before exact error: %s',
	async (primary) => {
		const f = folderFailureFixture(),
			life = folderLifecycle(f.manager);
		for (const input of f.inputs) life.open(input.uri, input.version, input.source);
		await f.open();
		f.faults.afterCreate = (service) => {
			if (service.creation.root === f.b)
				service.before = async () => {
					throw primary;
				};
		};
		await life.change({ added: f.folders, removed: [] });
		expect(life.published).toEqual([{ uri: f.inputs[0]!.uri, version: 1, text: 'current a' }]);
		expect(life.analyses.presentationBlocked(f.inputs[0]!.uri, 1)).toBe(false);
		expect(life.analyses.presentationBlocked(f.inputs[1]!.uri, 1)).toBe(true);
		expect(life.errors).toStrictEqual([primary]);
		f.faults.afterCreate = undefined;
		await life.change({ added: [], removed: [] });
		expect(life.published.map((value) => value.uri)).toEqual(f.inputs.map((input) => input.uri));
		expect(life.analyses.presentationBlocked(f.inputs[0]!.uri, 1)).toBe(false);
		expect(life.analyses.presentationBlocked(f.inputs[1]!.uri, 1)).toBe(false);
		expect(life.errors).toStrictEqual([primary]);
	}
);

it('retired cleanup failure retains every successful registered publication', async () => {
	const f = folderFailureFixture(),
		life = folderLifecycle(f.manager);
	for (const input of f.inputs) life.open(input.uri, input.version, input.source);
	await f.open();
	f.services[0]!.dispose.mockImplementationOnce(async () => {
		throw 0;
	});
	await life.change({ added: f.folders, removed: [] });
	expect(life.published.map((value) => value.uri)).toEqual(f.inputs.map((input) => input.uri));
	for (const input of f.inputs) expect(life.analyses.presentationBlocked(input.uri, 1)).toBe(false);
	expect(life.errors).toStrictEqual([0]);
	await life.change({ added: [], removed: [] });
	expect(life.published).toHaveLength(2);
	expect(life.errors).toStrictEqual([0]);
});

it('one document finalization failure retains a sibling and only a newer input restores its publication', async () => {
	const f = folderFailureFixture(false),
		life = folderLifecycle(f.manager);
	for (const input of f.inputs) life.open(input.uri, input.version, input.source);
	await f.open();
	let restoreInspect: (() => void) | undefined;
	f.faults.afterCreate = (service) => {
		const inspect = service.inspect.bind(service);
		restoreInspect = () => {
			service.inspect = inspect;
		};
		service.inspect = async (filename) => {
			if (filename === fileURLToPath(f.inputs[1]!.uri)) throw undefined;
			return inspect(filename);
		};
	};
	await life.change({ added: [{ uri: pathToFileURL(f.root).href, name: 'outer' }], removed: [] });
	expect(life.published).toEqual([{ uri: f.inputs[0]!.uri, version: 1, text: 'current a' }]);
	expect(life.analyses.presentationBlocked(f.inputs[0]!.uri, 1)).toBe(false);
	expect(life.errors).toStrictEqual([undefined]);
	restoreInspect!();
	await life.change({ added: [], removed: [] });
	expect(life.analyses.presentationBlocked(f.inputs[1]!.uri, 1)).toBe(true);
	expect(life.published).toHaveLength(1);
	f.faults.afterCreate = undefined;
	life.edit(f.inputs[1]!.uri, 2, 'next b');
	await life.change({ added: [], removed: [] });
	expect(life.analyses.presentationBlocked(f.inputs[0]!.uri, 1)).toBe(false);
	expect(life.analyses.presentationBlocked(f.inputs[1]!.uri, 2)).toBe(false);
	expect(life.published.at(-1)).toEqual({ uri: f.inputs[1]!.uri, version: 2, text: 'next b' });
	expect(life.errors).toStrictEqual([undefined]);
});

it('core primary precedes its cleanup failure without discarding a successful destination', async () => {
	const f = folderFailureFixture();
	await f.open();
	f.faults.afterCreate = (service) => {
		if (service.creation.root !== f.b) return;
		service.before = async () => {
			throw undefined;
		};
		service.dispose.mockImplementationOnce(async () => {
			throw 0;
		});
	};
	const data = await f.manager.reconcileWorkspaceFolders(f.change, f.inputs).completion;
	expect(data.errors).toStrictEqual([undefined, 0]);
	expect(data.results.map((result) => result.input.uri)).toEqual([f.inputs[0]!.uri]);
	f.faults.afterCreate = undefined;
	const retry = await f.manager.reconcileWorkspaceFolders({ added: [], removed: [] }, f.inputs)
		.completion;
	expect(retry.errors).toStrictEqual([0]);
	expect(retry.results.map((result) => result.input.uri)).toEqual([f.inputs[1]!.uri]);
});

it('reentrant factory retirement disposes only the returned uncommitted resource', async () => {
	const f = folderFailureFixture();
	await f.open();
	let nested: ReturnType<typeof f.manager.reconcileWorkspaceFolders> | undefined;
	let entered = false;
	f.faults.beforeCreate = (options) => {
		if (entered || options.root !== f.a) return;
		entered = true;
		nested = f.manager.reconcileWorkspaceFolders({ added: [], removed: [f.a, f.b] }, f.inputs);
	};
	const outer = f.manager.reconcileWorkspaceFolders(f.change, f.inputs);
	expect((await outer.completion).results).toEqual([]);
	expect((await nested!.completion).results).toHaveLength(2);
	const provisional = f.services.find((service) => service.creation.root === f.a)!;
	expect(provisional.dispose).toHaveBeenCalledOnce();
	expect(provisional.deliveries).toEqual([]);
	for (const input of f.inputs)
		expect((await f.manager.inspect(input.uri))?.languageProjection.document.text).toBe(
			input.source
		);
});

it('publishes successful results before reporting and finishes controllers if the reporter throws', async () => {
	const f = folderFailureFixture();
	const life = folderLifecycle(f.manager, (error) => {
		expect(error).toBe(0);
		expect(life.analyses.presentationBlocked(f.inputs[0]!.uri, 1)).toBe(false);
		throw undefined;
	});
	for (const input of f.inputs) life.open(input.uri, 1, input.source);
	await f.open();
	f.faults.afterCreate = (service) => {
		if (service.creation.root === f.b)
			service.before = async () => {
				throw 0;
			};
	};
	await expect(life.change({ added: f.folders, removed: [] })).rejects.toBeUndefined();
	expect(life.errors).toStrictEqual([0]);
	const following = life.analyses.start(f.inputs[1]!.uri, 1);
	expect(following).toBeDefined();
	life.analyses.finish(f.inputs[1]!.uri, following!);
	f.faults.afterCreate = undefined;
	await life.change({ added: [], removed: [] });
	expect(life.analyses.presentationBlocked(f.inputs[1]!.uri, 1)).toBe(false);
	expect(life.errors).toStrictEqual([0]);
});
