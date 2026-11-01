import {
	emptyFixtureGraph,
	createPackage,
	createFixtureGraph
} from './test-support/registry-fixtures.js';
import type { ExactConfig } from '@exactjs/config';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importPublicPackageEntry } from './modules.js';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { rmSync } from 'node:fs';
import {
	prepareExactPluginRegistry,
	type ExactPackageGraph,
	type ExactPackageNode
} from './node.js';

describe('prepared plugin registry', () => {
	it('loads TypeScript configuration through the native Node loader and removes its temporary module', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-config-success-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const configPath = path.join(root, 'exact.config.ts');
		writeFileSync(configPath, "export default { pluginDiscovery: { mode: 'root' } };\n");

		const registry = await prepareExactPluginRegistry({
			applicationRoot: root,
			configPath,
			graph: emptyFixtureGraph(root),
			syncTypes: false
		});

		expect(registry.configPath).toBe(configPath);
		expect(readdirSync(root).filter((file) => file.startsWith('.exact-config-'))).toEqual([]);
	});

	it('removes a temporary TypeScript configuration module when validation fails', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-config-failure-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const configPath = path.join(root, 'exact.config.ts');
		writeFileSync(configPath, 'export default null;\n');

		await expect(
			prepareExactPluginRegistry({
				applicationRoot: root,
				configPath,
				graph: emptyFixtureGraph(root),
				syncTypes: false
			})
		).rejects.toThrow('must default-export an eXact configuration object');
		expect(readdirSync(root).filter((file) => file.startsWith('.exact-config-'))).toEqual([]);
	});

	it('runs defaults, deepest contributors, and root mutation with undefined retention', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-registry-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const plugin = createPackage(
			root,
			'@exactjs/example',
			{
				exports: {
					'./config': './config.js',
					'./config-types': './config.d.ts'
				},
				exact: {
					plugin: {
						schemaVersion: 1,
						protocolVersion: '1.0.0',
						configKey: 'example',
						entries: { config: './config', configTypes: './config-types' }
					}
				}
			},
			{
				'config.js': `
        export default {
          defaults() { return { order: ["defaults"] }; },
          validate(config) {
            if (!Array.isArray(config.order)) throw new Error("invalid config");
            return undefined;
					}
        };
      `,
				'config.d.ts': 'export {};'
			}
		);
		const framework = createPackage(
			root,
			'@acme/framework',
			{
				exact: {
					pluginForwarding: {
						schemaVersion: 1,
						include: { '@exactjs/example': { required: true } }
					},
					pluginConfiguration: {
						'@exactjs/example': {
							version: '^1.0.0',
							subpath: './exact',
							export: 'configureExample'
						}
					}
				},
				exports: { './exact': './exact.js' }
			},
			{
				'exact.js': `
        export async function configureExample(config) {
          await Promise.resolve();
          config.order.push("framework");
          return undefined;
        }
      `
			},
			{ '@exactjs/example': '^1.0.0' }
		);
		const graph = createFixtureGraph(root, plugin, framework);
		const config: ExactConfig = {
			plugins: {
				example: async (value: unknown) => {
					(value as { order: string[] }).order.push('root');
					return undefined;
				}
			} as ExactConfig['plugins']
		};
		const registry = await prepareExactPluginRegistry({
			applicationRoot: root,
			graph,
			config,
			syncTypes: true
		});
		expect(registry.reports.map((report) => report.contributor)).toEqual([
			'@acme/framework',
			'@app/root'
		]);
		expect(readFileSync(path.join(root, '.exact', 'plugins.d.ts'), 'utf8')).toContain(
			'/// <reference types="@exactjs/example/config-types" />'
		);
		expect(JSON.stringify(registry)).not.toContain('providers');
	});

	it('does not discover component-library enhancement metadata as a framework plugin', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-component-library-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const library: ExactPackageNode = {
			id: '@exactjs/example-components',
			location: path.join(root, 'node_modules', '@exactjs', 'example-components'),
			realPath: path
				.join(root, 'node_modules', '@exactjs', 'example-components')
				.replaceAll('\\', '/'),
			manifest: {
				name: '@exactjs/example-components',
				version: '1.0.0',
				exports: { '.': './capability.d.ts' }
			},
			dependencies: new Map()
		};
		const rootNode = emptyFixtureGraph(root).nodes.get('root')!;
		const graph: ExactPackageGraph = {
			rootId: rootNode.id,
			nodes: new Map([
				[
					rootNode.id,
					{
						...rootNode,
						manifest: {
							...rootNode.manifest,
							dependencies: { '@exactjs/example-components': '^1.0.0' }
						},
						dependencies: new Map([
							[
								'@exactjs/example-components',
								{
									name: '@exactjs/example-components',
									range: '^1.0.0',
									kind: 'dependency',
									targetId: library.id
								}
							]
						])
					}
				],
				[library.id, library]
			])
		};

		const registry = await prepareExactPluginRegistry({
			applicationRoot: root,
			graph,
			config: { pluginDiscovery: { mode: 'all' } },
			syncTypes: false
		});

		expect(registry.discovery.plugins.size).toBe(0);
		expect(registry.discovery.participants.has(library.id)).toBe(false);
	});
});

it.each(['buildConfig', 'languageConfig'])(
	'accepts shared sibling JSON references in %s',
	async (projection) => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-json-'));
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
				'config.js': `export default {defaults(){return {};},validate(){},${projection}(){const shared={value:42};return {left:shared,right:shared};}};`
			}
		);
		const framework = createPackage(
			root,
			'@acme/framework',
			{
				exact: {
					pluginForwarding: {
						schemaVersion: 1,
						include: { '@exactjs/example': { required: true } }
					}
				}
			},
			{}
		);
		const registry = await prepareExactPluginRegistry({
			applicationRoot: root,
			graph: createFixtureGraph(root, plugin, framework),
			syncTypes: false
		});
		if (projection === 'buildConfig')
			expect(registry.build.get('@exactjs/example')).toEqual({
				left: { value: 42 },
				right: { value: 42 }
			});
		else expect(registry.discovery.plugins.has('@exactjs/example')).toBe(true);
	}
);

it.each(['buildConfig', 'languageConfig'])('rejects ancestor cycles in %s', async (projection) => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-json-cycle-'));
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
			'config.js': `export default {defaults(){return {};},validate(){},${projection}(){const value={};value.self=value;return value;}};`
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
	await expect(
		prepareExactPluginRegistry({
			applicationRoot: root,
			graph: createFixtureGraph(root, plugin, framework),
			syncTypes: false
		})
	).rejects.toThrow(/JSON-safe/);
});

it.each([new Error('preparation canceled'), 'canceled', null, false, 0])(
	'rejects a preparation that starts with an aborted signal: %s',
	async (reason) => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-aborted-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const controller = new AbortController();
		controller.abort(reason);
		await expect(
			prepareExactPluginRegistry({
				applicationRoot: root,
				config: {},
				graph: emptyFixtureGraph(root),
				signal: controller.signal,
				syncTypes: false
			})
		).rejects.toBe(reason);
	}
);

it('prepares an empty registry with a live cancellation signal', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-live-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const registry = await prepareExactPluginRegistry({
		applicationRoot: root,
		config: {},
		graph: emptyFixtureGraph(root),
		signal: new AbortController().signal,
		syncTypes: false
	});
	expect(registry.discovery.plugins.size).toBe(0);
});

it('observes cancellation while loading configuration before preparing plugins', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-load-cancel-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const configPath = path.join(root, 'exact.config.mjs');
	writeFileSync(configPath, 'export default {};');
	const controller = new AbortController();
	const pending = prepareExactPluginRegistry({
		applicationRoot: root,
		configPath,
		graph: emptyFixtureGraph(root),
		signal: controller.signal,
		syncTypes: false
	});
	queueMicrotask(() => controller.abort(new Error('configuration load canceled')));
	await expect(pending).rejects.toThrow('configuration load canceled');
});

it.each(
	['factory', 'validation'].flatMap((phase) =>
		['abort', 'timeout'].map((mode) => ({ phase, mode }))
	)
)('fences registry publication during held runtime $phase ($mode)', async ({ phase, mode }) => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-runtime-cancel-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const plugin = createPackage(
		root,
		'@exactjs/example',
		{
			exports: { './config': './config.js', './server': './server.js' },
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: 'example',
					entries: { config: './config', server: './server' }
				}
			}
		},
		{
			'config.js': `export default {defaults(){return {};},validate(){},serverConfig(){return {};}};`,
			'server.js': `let enter,finish;export const entered=new Promise(resolve=>enter=resolve);export const release=()=>finish();async function hold(){enter();await new Promise(resolve=>finish=resolve);}export default async()=>{${phase === 'factory' ? 'await hold();return {};' : 'return {validate:hold};'}};`
		}
	);
	const framework = createPackage(
		root,
		'@acme/framework',
		{
			exact: {
				pluginForwarding: {
					schemaVersion: 1,
					include: { '@exactjs/example': { required: true } }
				}
			}
		},
		{}
	);
	const module = await importPublicPackageEntry(plugin, './server');
	await importPublicPackageEntry(plugin, './config');
	const controller = new AbortController();
	if (mode === 'timeout') {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
	}
	const pending = prepareExactPluginRegistry({
		applicationRoot: root,
		graph: createFixtureGraph(root, plugin, framework),
		signal: controller.signal,
		timeoutMs: 1000,
		hostMode: 'server',
		syncTypes: false
	});
	// Attach a rejection handler before canceling, then release the foreign factory ourselves.
	const outcome = pending.then(
		() => undefined,
		(error) => error
	);
	await module.entered;
	if (mode === 'timeout') await vi.advanceTimersByTimeAsync(1000);
	else controller.abort(new Error('runtime factory canceled'));
	(module.release as () => void)();
	expect(await outcome).toBeInstanceOf(Error);
	await expect(pending).rejects.toThrow(
		mode === 'timeout' ? 'exceeded 1000ms' : 'runtime factory canceled'
	);
});

it('does not start validation or projections after canceled defaults settle', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-late-config-'));
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
			'config.js': `let enter,finish;export const entered=new Promise(resolve=>enter=resolve);export const release=()=>finish();export const calls=[];export default {async defaults(){enter();await new Promise(resolve=>finish=resolve);return {};},validate(){calls.push('validate');},buildConfig(){calls.push('project');return {};}};`
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
	const controller = new AbortController();
	const pending = prepareExactPluginRegistry({
		applicationRoot: root,
		graph: createFixtureGraph(root, plugin, framework),
		signal: controller.signal,
		syncTypes: false
	});
	const outcome = pending.catch((error) => error);
	await module.entered;
	controller.abort(new Error('defaults canceled'));
	expect(await outcome).toBeInstanceOf(Error);
	(module.release as () => void)();
	await nextTurn();
	expect(module.calls).toEqual([]);
});
