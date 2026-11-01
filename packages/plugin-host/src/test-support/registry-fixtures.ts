import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ExactPackageGraph, ExactPackageNode } from '../node.js';

/** Creates an application-only graph for registry lifecycle controls. */
export function emptyFixtureGraph(root: string): ExactPackageGraph {
	const node: ExactPackageNode = {
		id: 'root',
		location: root,
		realPath: root.replaceAll('\\', '/'),
		manifest: { name: '@app/root', version: '1.0.0' },
		dependencies: new Map()
	};
	return { rootId: node.id, nodes: new Map([[node.id, node]]) };
}

/** Installs a public package fixture with owned metadata and entry files. */
export function createPackage(
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
			'@exactjs/plugin-api': '^1.0.0',
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

/** Links a forwarded plugin through its framework dependency for registry controls. */
export function createFixtureGraph(
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
			['@exactjs/plugin-api', { name: '@exactjs/plugin-api', range: '^1.0.0', kind: 'dependency' }],
			[
				'@exactjs/example',
				{ name: '@exactjs/example', range: '^1.0.0', kind: 'dependency', targetId: plugin.id }
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
