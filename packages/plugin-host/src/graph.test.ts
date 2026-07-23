import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createExactPackageGraph,
	createInstalledExactPackageGraph,
	createNpmExactPackageGraph,
	dependencyDistance,
	findUp,
	packageName,
	packageVersion
} from './graph.js';

describe('plugin package graph', () => {
	it('builds an npm lock graph with hoisted and workspace-linked dependencies', () => {
		const root = createFixtureRoot('npm');
		writeJson(path.join(root, 'package.json'), {
			name: '@app/root',
			version: '1.0.0',
			dependencies: { '@acme/framework': '^1.0.0' }
		});
		const framework = path.join(root, 'packages', 'framework');
		mkdirSync(framework, { recursive: true });
		writeJson(path.join(framework, 'package.json'), {
			name: '@acme/framework',
			version: '1.0.0',
			peerDependencies: { '@exactjs/plugin': '^1.0.0' }
		});
		const plugin = path.join(root, 'node_modules', '@exactjs', 'plugin');
		mkdirSync(plugin, { recursive: true });
		writeJson(path.join(plugin, 'package.json'), {
			name: '@exactjs/plugin',
			version: '1.2.0'
		});
		writeJson(path.join(root, 'package-lock.json'), {
			lockfileVersion: 3,
			packages: {
				'': {
					name: '@app/root',
					version: '1.0.0',
					dependencies: { '@acme/framework': '^1.0.0' }
				},
				'node_modules/@acme/framework': {
					resolved: 'packages/framework',
					link: true
				},
				'packages/framework': {
					name: '@acme/framework',
					version: '1.0.0',
					peerDependencies: { '@exactjs/plugin': '^1.0.0' }
				},
				'node_modules/@exactjs/plugin': {
					name: '@exactjs/plugin',
					version: '1.2.0'
				}
			}
		});

		const graph = createNpmExactPackageGraph(root);

		expect(graph.rootId).toBe('');
		expect(graph.nodes.get('')?.dependencies.get('@acme/framework')?.targetId).toBe(
			'packages/framework'
		);
		expect(graph.nodes.get('packages/framework')?.dependencies.get('@exactjs/plugin')).toEqual(
			expect.objectContaining({ kind: 'peer', targetId: 'node_modules/@exactjs/plugin' })
		);
		expect(dependencyDistance(graph)).toEqual(
			new Map([
				['', 0],
				['packages/framework', 1],
				['node_modules/@exactjs/plugin', 2]
			])
		);
	});

	it('falls back to the installed package tree when no npm lock exists', () => {
		const root = createFixtureRoot('installed');
		writeJson(path.join(root, 'package.json'), {
			name: '@app/root',
			version: '1.0.0',
			dependencies: { dependency: '1.0.0' }
		});
		const dependency = path.join(root, 'node_modules', 'dependency');
		mkdirSync(dependency, { recursive: true });
		writeJson(path.join(dependency, 'package.json'), {
			name: 'dependency',
			version: '1.0.0',
			optionalDependencies: { missing: '1.0.0' }
		});

		const graph = createExactPackageGraph(path.join(root, 'nested'));
		const direct = createInstalledExactPackageGraph(root);

		expect(graph.nodes).toHaveLength(2);
		expect(direct.nodes.get(direct.rootId)?.dependencies.get('dependency')?.targetId).toBeDefined();
		const dependencyNode = [...direct.nodes.values()].find(
			(node) => node.manifest.name === 'dependency'
		);
		expect(dependencyNode?.dependencies.get('missing')).toEqual(
			expect.objectContaining({ kind: 'optional', targetId: undefined })
		);
	});

	it('rejects malformed and unsupported lockfiles with useful paths', () => {
		const malformed = createFixtureRoot('malformed');
		writeJson(path.join(malformed, 'package.json'), {
			name: '@app/root',
			version: '1.0.0'
		});
		writeFileSync(path.join(malformed, 'package-lock.json'), '{');
		expect(() => createNpmExactPackageGraph(malformed)).toThrow('Unable to parse');

		const unsupported = createFixtureRoot('unsupported');
		writeJson(path.join(unsupported, 'package.json'), {
			name: '@app/root',
			version: '1.0.0'
		});
		writeJson(path.join(unsupported, 'package-lock.json'), {
			lockfileVersion: 1,
			packages: {}
		});
		expect(() => createNpmExactPackageGraph(unsupported)).toThrow('lockfileVersion 2 or 3');
	});

	it('validates package identity helpers and upward discovery', () => {
		const root = createFixtureRoot('identity');
		writeJson(path.join(root, 'marker.json'), {});
		const nested = path.join(root, 'a', 'b');
		mkdirSync(nested, { recursive: true });

		expect(findUp(nested, 'marker.json')).toBe(path.join(root, 'marker.json'));
		expect(() => findUp(nested, 'absent.json')).toThrow('was not found above');
		expect(packageName(fixtureNode(root, { name: 'package', version: '2.0.0' }))).toBe('package');
		expect(packageVersion(fixtureNode(root, { name: 'package', version: '2.0.0' }))).toBe('2.0.0');
		expect(() => packageName(fixtureNode(root, { version: '1.0.0' }))).toThrow(
			'must declare a package name'
		);
		expect(() => packageVersion(fixtureNode(root, { name: 'package' }))).toThrow(
			'must declare a package version'
		);
	});
});

function createFixtureRoot(name: string): string {
	const root = mkdtempSync(path.join(tmpdir(), `exact-graph-${name}-`));
	mkdirSync(path.join(root, 'nested'), { recursive: true });
	return root;
}

function writeJson(filename: string, value: unknown): void {
	writeFileSync(filename, JSON.stringify(value));
}

function fixtureNode(location: string, manifest: Record<string, unknown>) {
	return {
		id: 'fixture',
		location,
		realPath: location.replaceAll('\\', '/'),
		manifest,
		dependencies: new Map()
	};
}
