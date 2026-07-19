import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactConfig } from '@exact/config';
import {
	prepareExactPluginRegistry,
	type ExactPackageGraph,
	type ExactPackageNode
} from './node.js';

describe('prepared plugin registry', () => {
	it('loads TypeScript configuration through the native Node loader and removes its temporary module', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-config-success-'));
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
		const plugin = createPackage(
			root,
			'@exact/example',
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
          },
          compilerConfig(config) { return { cacheKey: { order: config.order } }; }
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
						include: { '@exact/example': { required: true } }
					},
					pluginConfiguration: {
						'@exact/example': {
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
			{ '@exact/example': '^1.0.0' }
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
		expect(registry.compiler.plugins['@exact/example']?.cacheKey).toEqual({
			order: ['defaults', 'framework', 'root']
		});
		expect(registry.reports.map((report) => report.contributor)).toEqual([
			'@acme/framework',
			'@app/root'
		]);
		expect(readFileSync(path.join(root, '.exact', 'plugins.d.ts'), 'utf8')).toContain(
			'/// <reference types="@exact/example/config-types" />'
		);
		expect(JSON.stringify(registry)).not.toContain('providers');
	});
});

function emptyFixtureGraph(root: string): ExactPackageGraph {
	const node: ExactPackageNode = {
		id: 'root',
		location: root,
		realPath: root.replaceAll('\\', '/'),
		manifest: { name: '@app/root', version: '1.0.0' },
		dependencies: new Map()
	};
	return { rootId: node.id, nodes: new Map([[node.id, node]]) };
}

function createPackage(
	root: string,
	name: string,
	manifest: Record<string, unknown>,
	files: Record<string, string>,
	dependencies: Record<string, string> = {}
): ExactPackageNode {
	const location = path.join(root, 'node_modules', ...name.split('/'));
	mkdirSync(location, { recursive: true });
	const packageManifest = {
		name,
		version: '1.0.0',
		type: 'module',
		dependencies: {
			'@exact/plugin-api': '^1.0.0',
			...dependencies
		},
		...manifest
	};
	writeFileSync(path.join(location, 'package.json'), JSON.stringify(packageManifest));
	for (const [filename, contents] of Object.entries(files))
		writeFileSync(path.join(location, filename), contents);
	return {
		id: name,
		location,
		realPath: location.replaceAll('\\', '/'),
		manifest: packageManifest,
		dependencies: new Map()
	};
}

function createFixtureGraph(
	root: string,
	plugin: ExactPackageNode,
	framework: ExactPackageNode
): ExactPackageGraph {
	const rootNode: ExactPackageNode = {
		id: 'root',
		location: root,
		realPath: root.replaceAll('\\', '/'),
		manifest: {
			name: '@app/root',
			version: '1.0.0',
			dependencies: { '@acme/framework': '^1.0.0' }
		},
		dependencies: new Map([
			[
				'@acme/framework',
				{ name: '@acme/framework', range: '^1.0.0', kind: 'dependency', targetId: framework.id }
			]
		])
	};
	const frameworkNode: ExactPackageNode = {
		...framework,
		dependencies: new Map([
			['@exact/plugin-api', { name: '@exact/plugin-api', range: '^1.0.0', kind: 'dependency' }],
			[
				'@exact/example',
				{ name: '@exact/example', range: '^1.0.0', kind: 'dependency', targetId: plugin.id }
			]
		])
	};
	return {
		rootId: rootNode.id,
		nodes: new Map([
			[rootNode.id, rootNode],
			[frameworkNode.id, frameworkNode],
			[plugin.id, plugin]
		])
	};
}
