import type { ExactPluginDiscoveryConfig } from '@exact/config';
import {
	assertPackageSelector,
	dependencyRange,
	exactPluginApiPackage,
	exactPluginProtocolVersion,
	matchesPackageSelectors,
	packageDirectlyDependsOnPluginApi,
	readExactPackageParticipation,
	type ExactPackageParticipation,
	type ExactPluginConfigurationDeclaration,
	type ExactPluginDeclaration
} from '@exact/plugin-api';
import path from 'node:path';
import { rcompare, satisfies, valid, validRange } from 'semver';
import {
	dependencyDistance,
	packageName,
	packageVersion,
	type ExactPackageGraph,
	type ExactPackageNode
} from './graph.js';

export interface ExactDiscoveryPolicy {
	readonly mode: 'root' | 'trusted' | 'all';
	readonly trustedPackages: readonly string[];
	readonly trustedPrefixes: readonly string[];
	readonly ignore: readonly string[];
}

export interface ExactPluginRequirement {
	readonly plugin: string;
	readonly range: string;
	readonly required: boolean;
	readonly parentId: string;
	readonly path: readonly string[];
}

export interface ExactParticipatingPackage {
	readonly node: ExactPackageNode;
	readonly participation: ExactPackageParticipation;
	readonly activationPaths: readonly (readonly string[])[];
}

export interface ExactSelectedPlugin {
	readonly packageName: string;
	readonly version: string;
	readonly node: ExactPackageNode;
	readonly declaration: ExactPluginDeclaration;
	readonly requirements: readonly ExactPluginRequirement[];
}

export interface ExactConfigurationContributor {
	readonly plugin: string;
	readonly node: ExactPackageNode;
	readonly declaration: ExactPluginConfigurationDeclaration;
}

export interface ExactPluginDiscoveryResult {
	readonly policy: ExactDiscoveryPolicy;
	readonly root: ExactPackageNode;
	readonly participants: ReadonlyMap<string, ExactParticipatingPackage>;
	readonly participantEdges: ReadonlyMap<string, ReadonlySet<string>>;
	readonly plugins: ReadonlyMap<string, ExactSelectedPlugin>;
	readonly contributors: readonly ExactConfigurationContributor[];
	readonly warnings: readonly string[];
}

export function resolveDiscoveryPolicy(
	config: ExactPluginDiscoveryConfig | undefined
): ExactDiscoveryPolicy {
	if (!config) {
		return Object.freeze({
			mode: 'trusted',
			trustedPackages: Object.freeze([]),
			trustedPrefixes: Object.freeze(['@exact/']),
			ignore: Object.freeze([])
		});
	}
	if (config.mode === 'all') {
		validateSelectors(config.ignore ?? [], 'pluginDiscovery.ignore');
		return Object.freeze({
			mode: 'all',
			trustedPackages: Object.freeze([]),
			trustedPrefixes: Object.freeze([]),
			ignore: Object.freeze([...(config.ignore ?? [])])
		});
	}
	if (config.mode === 'trusted') {
		validateSelectors(config.trustedPackages ?? [], 'pluginDiscovery.trustedPackages');
		for (const packageNameValue of config.trustedPackages ?? []) {
			if (packageNameValue.endsWith('/'))
				throw new Error(
					`pluginDiscovery.trustedPackages entry ${packageNameValue} must be an exact package name`
				);
		}
		validateSelectors(config.trustedPrefixes ?? [], 'pluginDiscovery.trustedPrefixes');
		for (const prefix of config.trustedPrefixes ?? []) {
			if (!prefix.endsWith('/'))
				throw new Error(`pluginDiscovery.trustedPrefixes entry ${prefix} must end in /`);
		}
		validateSelectors(config.ignore ?? [], 'pluginDiscovery.ignore');
		return Object.freeze({
			mode: 'trusted',
			trustedPackages: Object.freeze([...(config.trustedPackages ?? [])]),
			trustedPrefixes: Object.freeze([
				...(config.includeDefaultTrustedPrefixes === false ? [] : ['@exact/']),
				...(config.trustedPrefixes ?? [])
			]),
			ignore: Object.freeze([...(config.ignore ?? [])])
		});
	}
	validateSelectors(config.ignore ?? [], 'pluginDiscovery.ignore');
	return Object.freeze({
		mode: 'root',
		trustedPackages: Object.freeze([]),
		trustedPrefixes: Object.freeze([]),
		ignore: Object.freeze([...(config.ignore ?? [])])
	});
}

function validateSelectors(values: readonly string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		assertPackageSelector(value, label);
		if (seen.has(value)) throw new Error(`${label} contains duplicate selector ${value}`);
		seen.add(value);
	}
}

export function discoverExactPlugins(
	graph: ExactPackageGraph,
	discoveryConfig?: ExactPluginDiscoveryConfig
): ExactPluginDiscoveryResult {
	const root = requiredNode(graph, graph.rootId);
	const policy = resolveDiscoveryPolicy(discoveryConfig);
	const participants = new Map<string, MutableParticipant>();
	const edges = new Map<string, Set<string>>();
	const requirements: ExactPluginRequirement[] = [];
	const rootName = packageName(root);
	participants.set(root.id, {
		node: root,
		participation: readExactPackageParticipation(root.manifest, manifestLabel(root)),
		activationPaths: [[rootName]]
	});
	const pending: string[] = [];
	for (const dependency of root.dependencies.values()) {
		if (!dependency.targetId || matchesPackageSelectors(dependency.name, policy.ignore)) continue;
		const node = requiredNode(graph, dependency.targetId);
		const participation = readExactPackageParticipation(node.manifest, manifestLabel(node));
		if (!hasParticipation(participation)) continue;
		acceptParticipant(participants, edges, root, node, participation, [
			rootName,
			packageName(node)
		]);
		pending.push(node.id);
		if (participation.plugin)
			requirements.push({
				plugin: packageName(node),
				range: dependency.range,
				required: dependency.kind !== 'optional',
				parentId: root.id,
				path: Object.freeze([rootName, packageName(node)])
			});
	}
	if (policy.mode !== 'root') {
		const expanded = new Set<string>();
		while (pending.length) {
			const id = pending.shift()!;
			if (expanded.has(id)) continue;
			expanded.add(id);
			const participant = participants.get(id)!;
			validateParticipantMarker(participant.node);
			const forwarding = participant.participation.forwarding;
			if (!forwarding) continue;
			for (const [childName, declaration] of Object.entries(forwarding.include).sort(
				([left], [right]) => left.localeCompare(right)
			)) {
				const dependency = participant.node.dependencies.get(childName);
				if (!dependency) {
					throw new Error(
						`${manifestLabel(participant.node)} forwards ${childName} without declaring it as a dependency, optional dependency, or peer dependency`
					);
				}
				const ignored =
					matchesPackageSelectors(childName, policy.ignore) ||
					matchesPackageSelectors(childName, forwarding.ignore ?? []);
				if (ignored) {
					if (declaration.required === true) {
						throw new Error(
							`Required forwarded plugin ${childName} is ignored through ${packageName(participant.node)}`
						);
					}
					continue;
				}
				if (!dependency.targetId) {
					if (dependency.kind === 'optional' && declaration.required !== true) continue;
					throw new Error(
						`${packageName(participant.node)} requires forwarded package ${childName}, but it is not installed`
					);
				}
				const child = requiredNode(graph, dependency.targetId);
				if (policy.mode === 'trusted' && !isTrustedChild(root, child, policy)) {
					if (declaration.required === true) {
						throw new Error(
							`Required forwarded package ${childName} is not trusted; add its package name or prefix to pluginDiscovery`
						);
					}
					continue;
				}
				const childParticipation = readExactPackageParticipation(
					child.manifest,
					manifestLabel(child)
				);
				if (!hasParticipation(childParticipation)) {
					throw new Error(
						`${packageName(participant.node)} forwards ${childName}, but that package declares no eXact plugin participation metadata`
					);
				}
				validateParticipantMarker(child);
				const parentPaths = participant.activationPaths;
				for (const parentPath of parentPaths) {
					acceptParticipant(participants, edges, participant.node, child, childParticipation, [
						...parentPath,
						childName
					]);
				}
				pending.push(child.id);
				if (childParticipation.plugin)
					requirements.push({
						plugin: childName,
						range: dependency.range,
						required: declaration.required === true || dependency.kind !== 'optional',
						parentId: participant.node.id,
						path: Object.freeze([
							...(parentPaths[0] ?? [rootName, packageName(participant.node)]),
							childName
						])
					});
			}
		}
	}
	// Ordering uses accepted dependency relationships as well as forwarding
	// edges, without implicitly activating dependency packages.
	for (const participant of participants.values()) {
		for (const dependency of participant.node.dependencies.values()) {
			if (!dependency.targetId || !participants.has(dependency.targetId)) continue;
			const children = edges.get(participant.node.id) ?? new Set<string>();
			children.add(dependency.targetId);
			edges.set(participant.node.id, children);
		}
	}
	rejectAmbiguousParticipants(participants, root.id);
	const plugins = selectPlugins(graph, root, requirements);
	rejectConfigKeyConflicts(plugins);
	const contributors: ExactConfigurationContributor[] = [];
	if (policy.mode !== 'root') {
		for (const participant of participants.values()) {
			if (participant.node.id === root.id) continue;
			for (const [plugin, declaration] of Object.entries(participant.participation.configuration)) {
				const selected = plugins.get(plugin);
				if (!selected) continue;
				if (declaration.version && !versionSatisfies(selected.version, declaration.version)) {
					throw new Error(
						`${packageName(participant.node)} configures ${plugin} ${declaration.version}, but selected ${selected.version}`
					);
				}
				contributors.push(Object.freeze({ plugin, node: participant.node, declaration }));
			}
		}
	}
	contributors.sort(
		(left, right) =>
			left.plugin.localeCompare(right.plugin) ||
			packageName(left.node).localeCompare(packageName(right.node))
	);
	return Object.freeze({
		policy,
		root,
		participants: new Map(
			[...participants].map(([id, participant]) => [id, freezeParticipant(participant)])
		),
		participantEdges: new Map([...edges].map(([id, values]) => [id, new Set(values)])),
		plugins,
		contributors: Object.freeze(contributors),
		warnings: Object.freeze(
			policy.mode === 'all'
				? [
						'pluginDiscovery.mode "all" executes explicitly forwarded third-party packages as trusted in-process code'
					]
				: []
		)
	});
}

type MutableParticipant = {
	node: ExactPackageNode;
	participation: ExactPackageParticipation;
	activationPaths: string[][];
};

function acceptParticipant(
	participants: Map<string, MutableParticipant>,
	edges: Map<string, Set<string>>,
	parent: ExactPackageNode,
	child: ExactPackageNode,
	participation: ExactPackageParticipation,
	activationPath: string[]
): void {
	validateParticipantMarker(child);
	const current = participants.get(child.id);
	if (current) {
		if (
			!current.activationPaths.some(
				(pathValue) => pathValue.join('\0') === activationPath.join('\0')
			)
		) {
			current.activationPaths.push(activationPath);
		}
	} else {
		participants.set(child.id, { node: child, participation, activationPaths: [activationPath] });
	}
	const children = edges.get(parent.id) ?? new Set<string>();
	children.add(child.id);
	edges.set(parent.id, children);
}

function selectPlugins(
	graph: ExactPackageGraph,
	root: ExactPackageNode,
	requirements: readonly ExactPluginRequirement[]
): ReadonlyMap<string, ExactSelectedPlugin> {
	const result = new Map<string, ExactSelectedPlugin>();
	const distances = dependencyDistance(graph);
	const grouped = new Map<string, ExactPluginRequirement[]>();
	for (const requirement of requirements) {
		const values = grouped.get(requirement.plugin) ?? [];
		values.push(requirement);
		grouped.set(requirement.plugin, values);
	}
	for (const [name, ranges] of grouped) {
		const candidates = [...graph.nodes.values()].filter((node) => {
			if (safePackageName(node) !== name) return false;
			const declaration = readExactPackageParticipation(node.manifest, manifestLabel(node)).plugin;
			return (
				declaration !== undefined &&
				ranges.every((requirement) => versionSatisfies(packageVersion(node), requirement.range))
			);
		});
		if (!candidates.length) {
			throw new Error(
				`No installed ${name} implementation satisfies ${ranges.map((value) => `${value.range} via ${value.path.join(' -> ')}`).join(', ')}`
			);
		}
		const rootResolution = root.dependencies.get(name)?.targetId;
		candidates.sort((left, right) => {
			if (left.id === rootResolution) return -1;
			if (right.id === rootResolution) return 1;
			const versionOrder = rcompare(packageVersion(left), packageVersion(right));
			if (versionOrder) return versionOrder;
			const distanceOrder =
				(distances.get(left.id) ?? Number.POSITIVE_INFINITY) -
				(distances.get(right.id) ?? Number.POSITIVE_INFINITY);
			return distanceOrder || left.realPath.localeCompare(right.realPath);
		});
		const node = candidates[0]!;
		validateParticipantMarker(node);
		const declaration = readExactPackageParticipation(node.manifest, manifestLabel(node)).plugin!;
		validatePluginProtocol(name, declaration);
		validatePluginEntries(node, declaration);
		result.set(
			name,
			Object.freeze({
				packageName: name,
				version: packageVersion(node),
				node,
				declaration,
				requirements: Object.freeze([...ranges])
			})
		);
	}
	return result;
}

function validateParticipantMarker(node: ExactPackageNode): void {
	if (!packageDirectlyDependsOnPluginApi(node.manifest)) {
		throw new Error(
			`${packageName(node)} must directly depend on ${exactPluginApiPackage} to participate in the eXact plugin system`
		);
	}
	const range =
		dependencyRange(node.manifest.dependencies, exactPluginApiPackage) ??
		dependencyRange(node.manifest.optionalDependencies, exactPluginApiPackage);
	if (
		range &&
		!isLocalRange(range) &&
		(!validRange(range) || !satisfies(exactPluginProtocolVersion, range))
	) {
		throw new Error(
			`${packageName(node)} declares incompatible ${exactPluginApiPackage} range ${JSON.stringify(range)}`
		);
	}
}

function validatePluginProtocol(name: string, declaration: ExactPluginDeclaration): void {
	if (
		!valid(declaration.protocolVersion) ||
		declaration.protocolVersion.split('.')[0] !== exactPluginProtocolVersion.split('.')[0]
	) {
		throw new Error(`${name} declares unsupported plugin protocol ${declaration.protocolVersion}`);
	}
}

function validatePluginEntries(node: ExactPackageNode, declaration: ExactPluginDeclaration): void {
	for (const [kind, subpath] of Object.entries(declaration.entries)) {
		if (!manifestExportsSubpath(node.manifest.exports, subpath)) {
			throw new Error(
				`${packageName(node)} plugin ${kind} entry ${subpath} is not a public package export`
			);
		}
	}
}

function rejectAmbiguousParticipants(
	participants: ReadonlyMap<string, MutableParticipant>,
	rootId: string
): void {
	const byName = new Map<string, MutableParticipant[]>();
	for (const participant of participants.values()) {
		if (participant.node.id === rootId) continue;
		const name = packageName(participant.node);
		const values = byName.get(name) ?? [];
		values.push(participant);
		byName.set(name, values);
	}
	for (const [name, values] of byName) {
		const versions = [...new Set(values.map((value) => packageVersion(value.node)))];
		if (
			versions.length > 1 &&
			values.some(
				(value) =>
					value.participation.forwarding || Object.keys(value.participation.configuration).length
			)
		) {
			throw new Error(
				`Participating framework package ${name} has ambiguous executable versions: ${versions.join(', ')}`
			);
		}
	}
}

function rejectConfigKeyConflicts(plugins: ReadonlyMap<string, ExactSelectedPlugin>): void {
	const keys = new Map<string, string>();
	for (const plugin of plugins.values()) {
		const previous = keys.get(plugin.declaration.configKey);
		if (previous)
			throw new Error(
				`Plugin configKey ${plugin.declaration.configKey} is declared by both ${previous} and ${plugin.packageName}`
			);
		keys.set(plugin.declaration.configKey, plugin.packageName);
	}
}

function isTrustedChild(
	root: ExactPackageNode,
	child: ExactPackageNode,
	policy: ExactDiscoveryPolicy
): boolean {
	const name = packageName(child);
	return (
		[...root.dependencies.values()].some((dependency) => dependency.targetId === child.id) ||
		policy.trustedPackages.includes(name) ||
		policy.trustedPrefixes.some((prefix) => name.startsWith(prefix))
	);
}

function versionSatisfies(version: string, range: string): boolean {
	if (isLocalRange(range)) return true;
	return (
		valid(version) !== null &&
		validRange(range) !== null &&
		satisfies(version, range, { includePrerelease: true })
	);
}

function isLocalRange(range: string): boolean {
	return /^(?:file|workspace|link):/.test(range) || range === '*';
}

function hasParticipation(value: ExactPackageParticipation): boolean {
	return (
		value.plugin !== undefined ||
		value.forwarding !== undefined ||
		Object.keys(value.configuration).length > 0
	);
}

function freezeParticipant(value: MutableParticipant): ExactParticipatingPackage {
	return Object.freeze({
		node: value.node,
		participation: value.participation,
		activationPaths: Object.freeze(
			value.activationPaths.map((pathValue) => Object.freeze([...pathValue]))
		)
	});
}

function requiredNode(graph: ExactPackageGraph, id: string): ExactPackageNode {
	const node = graph.nodes.get(id);
	if (!node) throw new Error(`Package graph references missing node ${JSON.stringify(id)}`);
	return node;
}

function safePackageName(node: ExactPackageNode): string | undefined {
	return typeof node.manifest.name === 'string' && node.manifest.name
		? node.manifest.name
		: undefined;
}

function manifestLabel(node: ExactPackageNode): string {
	return path.join(node.location, 'package.json');
}

function manifestExportsSubpath(exportsField: unknown, subpath: string): boolean {
	if (typeof exportsField === 'string' || Array.isArray(exportsField)) return subpath === '.';
	if (!exportsField || typeof exportsField !== 'object') return false;
	const record = exportsField as Record<string, unknown>;
	return (
		Object.prototype.hasOwnProperty.call(record, subpath) ||
		(subpath === '.' && Object.keys(record).every((key) => !key.startsWith('.')))
	);
}
