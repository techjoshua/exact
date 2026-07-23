import {
	packageDirectlyDependsOnAdapterMarker,
	packageNameFromBareSpecifier,
	readReactCompatAdapterDeclaration,
	readReactCompatApplicationPolicy,
	type ReactCompatAdapterDeclaration
} from '@exactjs/react-compat-adapter-api';
import path from 'node:path';
import { intersects, satisfies, validRange } from 'semver';
import type {
	ReactCompatPackageGraph,
	ReactCompatPackageNode,
	ResolvedReactCompatAdapters,
	ResolvedReactCompatReplacement,
	ResolvedReactCompatSourcePolicy,
	UnsupportedReactCompatSource
} from './contracts.js';
import {
	packageName,
	packageVersion,
	validateAdapterExports,
	validateProtocolRange
} from './validation-rules.js';

/** Performs the replacements for importer domain operation. */
export function replacementsForImporter(
	graph: ReactCompatPackageGraph,
	registry: ResolvedReactCompatAdapters,
	importer: string
): readonly ResolvedReactCompatReplacement[] {
	const modules = new Set([...registry.replacements.values()].map((value) => value.sourceModule));
	const selected: ResolvedReactCompatReplacement[] = [];
	for (const sourceModule of modules) {
		const instance = resolveSourceInstance(
			graph,
			importer,
			packageNameFromBareSpecifier(sourceModule)
		);
		if (!instance) continue;
		for (const replacement of registry.replacements.values()) {
			if (replacement.sourceInstance === instance.id && replacement.sourceModule === sourceModule)
				selected.push(replacement);
		}
	}
	return Object.freeze(selected);
}

/** Performs the unsupported sources for importer domain operation. */
export function unsupportedSourcesForImporter(
	graph: ReactCompatPackageGraph,
	registry: ResolvedReactCompatAdapters,
	importer: string
): readonly UnsupportedReactCompatSource[] {
	return Object.freeze(
		registry.unsupportedSources.filter(
			(source) =>
				resolveSourceInstance(graph, importer, source.sourcePackage)?.id === source.sourceInstance
		)
	);
}

/** Performs the source policies for importer domain operation. */
export function sourcePoliciesForImporter(
	graph: ReactCompatPackageGraph,
	registry: ResolvedReactCompatAdapters,
	importer: string
): readonly ResolvedReactCompatSourcePolicy[] {
	return Object.freeze(
		registry.sourcePolicies.filter(
			(source) =>
				resolveSourceInstance(graph, importer, source.sourcePackage)?.id === source.sourceInstance
		)
	);
}

/** Discovers reachable adapters and resolves their declarations into a conflict-free registry. */
export function discoverReactCompatAdapters(
	graph: ReactCompatPackageGraph
): ResolvedReactCompatAdapters {
	const root = graph.nodes.get(graph.rootId);
	if (!root)
		throw new Error(
			`React compatibility package graph root ${JSON.stringify(graph.rootId)} does not exist`
		);
	const ignored = new Set(
		readReactCompatApplicationPolicy(root.manifest, `${root.location}/package.json`)
			.ignoreAdapters ?? []
	);
	const reachable = reachableNodes(graph);
	const replacements = new Map<string, ResolvedReactCompatReplacement>();
	const unsupportedSources: UnsupportedReactCompatSource[] = [];
	const sourcePolicies: ResolvedReactCompatSourcePolicy[] = [];
	const adapters: string[] = [];
	const candidates = [...reachable]
		.filter((node) => node.id !== graph.rootId)
		.map((node) => ({
			node,
			declaration: readReactCompatAdapterDeclaration(node.manifest, `${node.location}/package.json`)
		}))
		.filter(
			(
				value
			): value is { node: ReactCompatPackageNode; declaration: ReactCompatAdapterDeclaration } =>
				value.declaration !== undefined
		)
		.filter((value) => !ignored.has(packageName(value.node)))
		.sort(
			(left, right) =>
				packageName(left.node).localeCompare(packageName(right.node)) ||
				left.node.id.localeCompare(right.node.id)
		);
	const candidatesByName = new Map<string, typeof candidates>();
	for (const candidate of candidates) {
		const name = packageName(candidate.node);
		const values = candidatesByName.get(name) ?? [];
		values.push(candidate);
		candidatesByName.set(name, values);
	}
	for (const [name, values] of candidatesByName) {
		const versions = [...new Set(values.map((value) => packageVersion(value.node)))];
		if (versions.length > 1) {
			throw new Error(
				`React compatibility build root ${root.location} reaches incompatible versions of adapter ${name}: ${versions.join(', ')}`
			);
		}
	}
	for (const { node, declaration } of [...candidatesByName.values()].map((values) => values[0]!)) {
		const name = packageName(node);
		if (!packageDirectlyDependsOnAdapterMarker(node.manifest)) {
			throw new Error(
				`React compatibility adapter ${name} must directly depend on @exactjs/react-compat-adapter-api`
			);
		}
		validateProtocolRange(node);
		validateAdapterExports(node, declaration);
		adapters.push(name);
		for (const [sourceModule, source] of Object.entries(declaration.substitutions)) {
			const sourcePackage = packageNameFromBareSpecifier(sourceModule);
			for (const [index, variant] of source.variants.entries()) {
				if (!validRange(variant.version))
					throw new Error(
						`React compatibility adapter ${name} declares invalid source range ${JSON.stringify(variant.version)} for ${sourcePackage}`
					);
				for (const previous of source.variants.slice(0, index)) {
					if (intersects(previous.version, variant.version, { includePrerelease: true })) {
						throw new Error(
							`React compatibility adapter ${name} declares overlapping source ranges ${JSON.stringify(previous.version)} and ${JSON.stringify(variant.version)} for ${sourceModule}`
						);
					}
				}
			}
			for (const sourceNode of reachable.filter(
				(candidate) => candidate.manifest.name === sourcePackage
			)) {
				const installedVersion = packageVersion(sourceNode);
				const variant = source.variants.find((candidate) =>
					satisfies(installedVersion, candidate.version, { includePrerelease: true })
				);
				if (!variant) {
					unsupportedSources.push(
						Object.freeze({
							sourceInstance: sourceNode.id,
							sourceLocation: sourceNode.location,
							sourceModule,
							sourcePackage,
							installedVersion,
							supportedRanges: Object.freeze(source.variants.map((candidate) => candidate.version)),
							adapterPackage: name,
							adapterVersion: packageVersion(node)
						})
					);
					continue;
				}
				sourcePolicies.push(
					Object.freeze({
						sourceInstance: sourceNode.id,
						sourceLocation: sourceNode.location,
						sourceModule,
						sourcePackage,
						installedVersion,
						fallback: source.fallback,
						adapterPackage: name,
						adapterVersion: packageVersion(node)
					})
				);
				for (const [sourceExport, replacement] of Object.entries(variant.exports)) {
					const key = replacementKey(sourceNode.id, sourceModule, sourceExport);
					const resolved: ResolvedReactCompatReplacement = Object.freeze({
						...replacement,
						sourceInstance: sourceNode.id,
						sourceLocation: sourceNode.location,
						sourceModule,
						sourcePackage,
						sourceExport,
						sourceVersion: variant.version,
						adapterPackage: name,
						adapterVersion: packageVersion(node),
						specifier: replacement.subpath === '.' ? name : `${name}${replacement.subpath.slice(1)}`
					});
					const previous = replacements.get(key);
					if (previous) {
						throw new Error(
							`React compatibility replacement conflict at build root ${root.location} for ` +
								`${sourceModule} from ${sourceNode.location}@${installedVersion}.${sourceExport}: ` +
								`${previous.adapterPackage}@${previous.adapterVersion} -> ${previous.specifier}#${previous.export} and ` +
								`${name}@${packageVersion(node)} -> ${resolved.specifier}#${resolved.export}`
						);
					}
					replacements.set(key, resolved);
				}
			}
		}
	}
	return Object.freeze({
		replacements,
		unsupportedSources: Object.freeze(unsupportedSources),
		sourcePolicies: Object.freeze(sourcePolicies),
		adapters: Object.freeze(adapters),
		ignoredAdapters: Object.freeze([...ignored].sort())
	});
}

/** Loads the nearest npm lockfile and materializes the installed graph without running npm. */

export function replacementKey(
	sourceInstance: string,
	sourceModule: string,
	sourceExport: string
): string {
	return `${sourceInstance}\0${sourceModule}\0${sourceExport}`;
}

/** Validates one adapter package and its installed peers without executing it. */

function reachableNodes(graph: ReactCompatPackageGraph): ReactCompatPackageNode[] {
	const result: ReactCompatPackageNode[] = [];
	const seen = new Set<string>();
	const pending = [graph.rootId];
	while (pending.length) {
		const id = pending.shift()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const node = graph.nodes.get(id);
		if (!node)
			throw new Error(
				`React compatibility package graph references missing node ${JSON.stringify(id)}`
			);
		result.push(node);
		pending.push(...node.dependencies);
	}
	return result;
}

function resolveSourceInstance(
	graph: ReactCompatPackageGraph,
	importer: string,
	sourcePackage: string
): ReactCompatPackageNode | undefined {
	const normalizedImporter = path.resolve(importer).toLowerCase();
	const owners = [...graph.nodes.values()]
		.filter((node) => {
			const location = path.resolve(node.location).toLowerCase();
			return (
				normalizedImporter === location || normalizedImporter.startsWith(`${location}${path.sep}`)
			);
		})
		.sort((left, right) => right.location.length - left.location.length);
	if (!owners.length) {
		const root = graph.nodes.get(graph.rootId);
		if (root) owners.push(root);
	}
	for (const owner of owners) {
		if (owner.manifest.name === sourcePackage) return owner;
		for (const dependencyId of owner.dependencies) {
			const dependency = graph.nodes.get(dependencyId);
			if (dependency?.manifest.name === sourcePackage) return dependency;
		}
	}
	return undefined;
}
