import { readReactCompatAdapterDeclaration } from '@exactjs/react-compat-adapter-api';
import type { ResolvedReactCompatAdapters } from './contracts.js';
import { discoverReactCompatAdapters } from './discovery.js';
import { createInstalledReactCompatPackageGraph } from './package-graph.js';
import { validateReplacementTypeDeclarations } from './validation-rules.js';

/** Validates react compat adapter package and throws when the contract is violated. */
export function validateReactCompatAdapterPackage(
	cwd = process.cwd()
): ResolvedReactCompatAdapters {
	const installed = createInstalledReactCompatPackageGraph(cwd);
	const adapter = installed.nodes.get(installed.rootId);
	if (!adapter) throw new Error(`Adapter package graph root ${installed.rootId} does not exist`);
	if (!readReactCompatAdapterDeclaration(adapter.manifest, `${adapter.location}/package.json`)) {
		throw new Error(
			`${adapter.location}/package.json does not declare exact.reactCompatibility adapter metadata`
		);
	}
	validateReplacementTypeDeclarations(
		adapter,
		readReactCompatAdapterDeclaration(adapter.manifest, `${adapter.location}/package.json`)!
	);
	const rootId = '__exact_adapter_validation_root__';
	const nodes = new Map(installed.nodes);
	nodes.set(
		rootId,
		Object.freeze({
			id: rootId,
			location: adapter.location,
			manifest: { name: '@exactjs/adapter-validation-root', version: '1.0.0' },
			dependencies: Object.freeze([installed.rootId])
		})
	);
	return discoverReactCompatAdapters(Object.freeze({ rootId, nodes }));
}
