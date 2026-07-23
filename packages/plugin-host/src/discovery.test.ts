import { describe, expect, it } from 'vitest';
import { discoverExactPlugins, type ExactPackageGraph, type ExactPackageNode } from './node.js';

describe('plugin discovery', () => {
	it('prevents a trusted parent from laundering an untrusted forwarded child', () => {
		const graph = fixtureGraph({
			rootDependencies: { '@acme/framework': '^1.0.0' },
			packages: [
				packageFixture('@acme/framework', '1.0.0', {
					dependencies: {
						'@exactjs/plugin-api': '^1.0.0',
						'@untrusted/security': '^1.0.0'
					},
					exact: {
						pluginForwarding: {
							schemaVersion: 1,
							include: { '@untrusted/security': { required: true } }
						}
					}
				}),
				pluginFixture('@untrusted/security', '1.0.0')
			]
		});
		expect(() =>
			discoverExactPlugins(graph, {
				mode: 'trusted',
				trustedPrefixes: ['@acme/'],
				includeDefaultTrustedPrefixes: false
			})
		).toThrow('is not trusted');
	});

	it('traverses only explicit forwarding edges in all mode', () => {
		const graph = fixtureGraph({
			rootDependencies: {
				'@acme/framework': '^1.0.0',
				'@unused/plugin': '^1.0.0'
			},
			packages: [
				packageFixture('@acme/framework', '1.0.0', {
					dependencies: {
						'@exactjs/plugin-api': '^1.0.0',
						'@third-party/security': '^1.0.0'
					},
					exact: {
						pluginForwarding: {
							schemaVersion: 1,
							include: { '@third-party/security': { required: true } }
						}
					}
				}),
				pluginFixture('@third-party/security', '1.0.0'),
				pluginFixture('@unused/plugin', '1.0.0')
			]
		});
		const result = discoverExactPlugins(graph, { mode: 'all' });
		expect([...result.plugins.keys()].sort()).toEqual(['@third-party/security', '@unused/plugin']);
		expect(result.warnings).toHaveLength(1);
	});

	it('selects one highest compatible implementation when root resolution is not compatible', () => {
		const graph = fixtureGraph({
			rootDependencies: { '@acme/framework': '^1.0.0' },
			packages: [
				packageFixture('@acme/framework', '1.0.0', {
					dependencies: {
						'@exactjs/plugin-api': '^1.0.0',
						'@exactjs/security': '^2.0.0'
					},
					exact: {
						pluginForwarding: {
							schemaVersion: 1,
							include: { '@exactjs/security': { required: true } }
						}
					}
				}),
				pluginFixture('@exactjs/security', '2.0.0', 'security-two'),
				pluginFixture('@exactjs/security', '2.3.0', 'security-three')
			]
		});
		const result = discoverExactPlugins(graph);
		expect(result.plugins.get('@exactjs/security')?.version).toBe('2.3.0');
	});

	it('uses one ignore mechanism to prune optional forwarding', () => {
		const graph = fixtureGraph({
			rootDependencies: { '@acme/framework': '^1.0.0' },
			packages: [
				packageFixture('@acme/framework', '1.0.0', {
					dependencies: { '@exactjs/plugin-api': '^1.0.0' },
					optionalDependencies: { '@exactjs/security': '^1.0.0' },
					exact: {
						pluginForwarding: {
							schemaVersion: 1,
							include: { '@exactjs/security': { required: false } }
						}
					}
				}),
				pluginFixture('@exactjs/security', '1.0.0')
			]
		});
		expect([
			...discoverExactPlugins(graph, {
				mode: 'trusted',
				ignore: ['@exactjs/security']
			}).plugins
		]).toEqual([]);
	});
});

type PackageInput = {
	name: string;
	version: string;
	id?: string;
	manifest: Record<string, unknown>;
};

function fixtureGraph(input: {
	rootDependencies: Record<string, string>;
	packages: PackageInput[];
}): ExactPackageGraph {
	const nodes = new Map<string, ExactPackageNode>();
	const idsByName = new Map<string, string[]>();
	for (const item of input.packages) {
		const values = idsByName.get(item.name) ?? [];
		const id = item.id ?? `${item.name}@${item.version}:${values.length}`;
		values.push(id);
		idsByName.set(item.name, values);
	}
	const rootDependencies = new Map(
		Object.entries(input.rootDependencies).map(([name, range]) => [
			name,
			Object.freeze({
				name,
				range,
				kind: 'dependency' as const,
				targetId: idsByName.get(name)?.[0]
			})
		])
	);
	nodes.set(
		'root',
		Object.freeze({
			id: 'root',
			location: '/app',
			realPath: '/app',
			manifest: {
				name: '@app/root',
				version: '1.0.0',
				dependencies: input.rootDependencies
			},
			dependencies: rootDependencies
		})
	);
	const usedByName = new Map<string, number>();
	for (const item of input.packages) {
		const index = usedByName.get(item.name) ?? 0;
		usedByName.set(item.name, index + 1);
		const id = idsByName.get(item.name)![index]!;
		const dependencies = new Map<
			string,
			{
				name: string;
				range: string;
				kind: 'dependency' | 'optional' | 'peer';
				targetId?: string;
			}
		>();
		for (const [kind, values] of [
			['dependency', item.manifest.dependencies],
			['optional', item.manifest.optionalDependencies],
			['peer', item.manifest.peerDependencies]
		] as const) {
			if (!values || typeof values !== 'object') continue;
			for (const [name, range] of Object.entries(values)) {
				if (typeof range !== 'string') continue;
				dependencies.set(name, {
					name,
					range,
					kind,
					targetId: idsByName.get(name)?.[0]
				});
			}
		}
		nodes.set(
			id,
			Object.freeze({
				id,
				location: `/app/node_modules/${item.name}/${item.version}/${index}`,
				realPath: `/app/node_modules/${item.name}/${item.version}/${index}`,
				manifest: { name: item.name, version: item.version, ...item.manifest },
				dependencies
			})
		);
	}
	return Object.freeze({ rootId: 'root', nodes });
}

function packageFixture(
	name: string,
	version: string,
	manifest: Record<string, unknown>
): PackageInput {
	return { name, version, manifest };
}

function pluginFixture(name: string, version: string, id?: string): PackageInput {
	return {
		name,
		version,
		id,
		manifest: {
			dependencies: { '@exactjs/plugin-api': '^1.0.0' },
			exports: { './config': './config.js', './config-types': './config.d.ts' },
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: name.split('/').at(-1)!.replaceAll('-', '_'),
					entries: {
						config: './config',
						configTypes: './config-types'
					}
				}
			}
		}
	};
}
