import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import { prepareExactPluginRegistry } from './registry.js';
import { importPublicPackageEntry } from './modules.js';
import { createPackage, createFixtureGraph } from './test-support/registry-fixtures.js';

/** Holds authored configuration work without depending on a timer or external service. */
async function heldConfiguration() {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-held-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const plugin = createPackage(
		root,
		'@exactjs/example',
		{
			exports: { './config': './config.js' },
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: 'example',
					entries: { config: './config' }
				}
			}
		},
		{
			'config.js': `let enter,finish;export const entered=new Promise(resolve=>enter=resolve);export const release=()=>finish?.();export const calls=[];export default{async defaults(){calls.push('defaults');enter();await new Promise(resolve=>finish=resolve);return {};},validate(){calls.push('validate');},buildConfig(){calls.push('build');return {};}};`
		}
	);
	const framework = createPackage(
		root,
		'@acme/framework',
		{
			exact: {
				pluginForwarding: { schemaVersion: 1, include: { '@exactjs/example': { required: true } } }
			}
		},
		{}
	);
	const module = await importPublicPackageEntry(plugin, './config');
	onTestFinished(() => {
		(module.release as () => void)();
	});
	return { root, graph: createFixtureGraph(root, plugin, framework), module };
}

it('keeps preparation active beyond the old deadline when the application supplies no expiration', async () => {
	const { root, graph, module } = await heldConfiguration();
	vi.useFakeTimers();
	onTestFinished(() => {
		vi.useRealTimers();
	});
	let settled = false;
	const pending = prepareExactPluginRegistry({
		applicationRoot: root,
		graph,
		config: {},
		syncTypes: false
	});
	const outcome = pending.then(
		(value) => {
			settled = true;
			return { ok: true, value };
		},
		(reason) => {
			settled = true;
			return { ok: false, reason };
		}
	);
	await module.entered;
	await vi.advanceTimersByTimeAsync(30001);
	const beforeRelease = settled;
	(module.release as () => void)();
	const result = await outcome;
	expect(beforeRelease).toBe(false);
	expect(result.ok).toBe(true);
	expect(module.calls).toEqual(['defaults', 'validate', 'build']);
});

it('retains an exact non-Error reason when active configuration is cancelled', async () => {
	const { root, graph, module } = await heldConfiguration();
	const owner = new AbortController();
	const pending = prepareExactPluginRegistry({
		applicationRoot: root,
		graph,
		signal: owner.signal,
		syncTypes: false
	});
	const outcome = pending.then(
		() => ({ ok: true }),
		(reason) => ({ ok: false, reason })
	);
	await module.entered;
	owner.abort(null);
	const result = await outcome;
	(module.release as () => void)();
	expect(result).toEqual({ ok: false, reason: null });
	await Promise.resolve();
	expect(module.calls).toEqual(['defaults']);
});

it('captures the caller signal before asynchronous config loading yields', async () => {
	const { root, graph, module } = await heldConfiguration();
	const owner = new AbortController();
	const options = { applicationRoot: root, graph, signal: owner.signal, syncTypes: false };
	const pending = prepareExactPluginRegistry(options);
	const outcome = pending.then(
		() => ({ ok: true }),
		(reason) => ({ ok: false, reason })
	);
	options.signal = new AbortController().signal;
	owner.abort(null);
	const entered = await Promise.race([
		Promise.resolve(module.entered).then(() => true),
		outcome.then(() => false)
	]);
	(module.release as () => void)();
	expect(await outcome).toEqual({ ok: false, reason: null });
	expect(entered).toBe(false);
	expect(module.calls).toEqual([]);
});

it('retains declared options and their receiver when they come from class getters', async () => {
	const { root, graph, module } = await heldConfiguration();
	const owner = new AbortController();
	class Options {
		#signal = owner.signal;
		get applicationRoot() {
			return root;
		}
		get graph() {
			return graph;
		}
		get signal() {
			return this.#signal;
		}
		readonly config = {};
		readonly syncTypes = false;
	}
	const pending = prepareExactPluginRegistry(new Options());
	const outcome = pending.then(
		() => ({ ok: true }),
		(reason) => ({ ok: false, reason })
	);
	await Promise.race([
		Promise.resolve(module.entered),
		outcome.then((result) => {
			throw new Error('Preparation settled before defaults: ' + result.ok);
		})
	]);
	owner.abort(null);
	const result = await outcome;
	(module.release as () => void)();
	expect(result).toEqual({ ok: false, reason: null });
});
