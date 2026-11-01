import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { expect, it, onTestFinished, vi } from 'vitest';
import { prepareExactPluginRegistry, invalidateExactPluginRegistry } from './node.js';
import { importPublicPackageEntry } from './modules.js';
import { createPackage } from './test-support/registry-fixtures.js';

it('honors type synchronization after a cached preparation disabled it', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-cached-types-'));
	onTestFinished(() => {
		invalidateExactPluginRegistry(root);
		rmSync(root, { recursive: true, force: true });
	});
	createPackage(
		root,
		'@exactjs/example',
		{
			exports: { './config-types': './config.d.ts' },
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: 'example',
					entries: { configTypes: './config-types' }
				}
			}
		},
		{ 'config.d.ts': 'export {};' }
	);
	createPackage(
		root,
		'@acme/framework',
		{
			exact: {
				pluginForwarding: { schemaVersion: 1, include: { '@exactjs/example': { required: true } } }
			}
		},
		{},
		{ '@exactjs/example': '^1.0.0' }
	);
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@app/root',
			version: '1.0.0',
			dependencies: { '@acme/framework': '^1.0.0' }
		})
	);
	await prepareExactPluginRegistry({ applicationRoot: root, syncTypes: false });
	const target = path.join(root, '.exact', 'plugins.d.ts');
	expect(existsSync(target)).toBe(false);
	await prepareExactPluginRegistry({ applicationRoot: root });
	expect(readFileSync(target, 'utf8')).toContain(
		'/// <reference types="@exactjs/example/config-types" />'
	);
});

it('retains a cached registry when an independent preparation fails', async () => {
	const { root, module } = await createCachedConfigurationFixture();
	const first = await prepareExactPluginRegistry({ applicationRoot: root, syncTypes: false });
	expect(first.build.get('@exactjs/example')).toEqual({ generation: 1 });
	await expect(
		prepareExactPluginRegistry({
			applicationRoot: root,
			syncTypes: false,
			graph: { rootId: 'missing', nodes: new Map() }
		})
	).rejects.toThrow();
	const next = await prepareExactPluginRegistry({ applicationRoot: root, syncTypes: false });
	expect(next.build.get('@exactjs/example')).toEqual({ generation: 1 });
	expect(module.calls()).toBe(1);
});

it('keeps pending cached preparations with different timeout policies independent', async () => {
	const { root, module } = await createCachedConfigurationFixture();
	module.hold();
	vi.useFakeTimers();
	onTestFinished(() => {
		module.release();
		vi.useRealTimers();
	});
	const first = prepareExactPluginRegistry({
		applicationRoot: root,
		syncTypes: false,
		timeoutMs: 1000
	});
	const firstOutcome = first.catch((error) => error);
	await module.entered;
	const second = prepareExactPluginRegistry({
		applicationRoot: root,
		syncTypes: false,
		timeoutMs: 2000
	});
	let secondSettled = false;
	const secondOutcome = second.then(
		(value) => {
			secondSettled = true;
			return value;
		},
		(error) => {
			secondSettled = true;
			return error;
		}
	);
	const waiting = new AbortController();
	try {
		await Promise.race([module.secondEntered, wait(1000, undefined, { signal: waiting.signal })]);
	} finally {
		waiting.abort();
	}
	expect(module.calls()).toBe(2);
	await vi.advanceTimersByTimeAsync(1000);
	expect(await firstOutcome).toBeInstanceOf(Error);
	expect(secondSettled).toBe(false);
	module.release();
	const registry = await secondOutcome;
	expect(registry).toHaveProperty('build');
});

it('invalidates only the requested root when another cached root shares its path prefix', async () => {
	const first = await createCachedConfigurationFixture();
	const neighbor = await createCachedConfigurationFixture(first.root + '-neighbor');
	await prepareExactPluginRegistry({ applicationRoot: first.root, syncTypes: false });
	await prepareExactPluginRegistry({ applicationRoot: neighbor.root, syncTypes: false });
	invalidateExactPluginRegistry(first.root);
	const retained = await prepareExactPluginRegistry({
		applicationRoot: neighbor.root,
		syncTypes: false
	});
	expect(retained.build.get('@exactjs/example')).toEqual({ generation: 1 });
	expect(neighbor.module.calls()).toBe(1);
});

/** Owns real package discovery and observable configuration generations for cache contracts. */
async function createCachedConfigurationFixture(providedRoot?: string) {
	const root = providedRoot ?? mkdtempSync(path.join(tmpdir(), 'exact-plugin-cache-policy-'));
	onTestFinished(() => {
		invalidateExactPluginRegistry(root);
		rmSync(root, { recursive: true, force: true });
	});
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
			'config.js': `let count=0,blocked=false,enter,enterSecond;const releases=[];export const entered=new Promise(resolve=>enter=resolve);export const secondEntered=new Promise(resolve=>enterSecond=resolve);export const calls=()=>count;export const hold=()=>blocked=true;export const release=()=>{blocked=false;for(const resolve of releases.splice(0))resolve();};export default {async defaults(){count++;if(count===2)enterSecond();if(blocked){enter();await new Promise(resolve=>releases.push(resolve));}return {generation:count};},validate(){},buildConfig(value){return value;}};`
		}
	);
	createPackage(
		root,
		'@acme/framework',
		{
			exact: {
				pluginForwarding: { schemaVersion: 1, include: { '@exactjs/example': { required: true } } }
			}
		},
		{},
		{ '@exactjs/example': '^1.0.0' }
	);
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@app/root',
			version: '1.0.0',
			dependencies: { '@acme/framework': '^1.0.0' }
		})
	);
	const module = (await importPublicPackageEntry(plugin, './config')) as {
		calls: () => number;
		hold: () => void;
		release: () => void;
		entered: Promise<void>;
		secondEntered: Promise<void>;
	};
	return { root, module };
}
