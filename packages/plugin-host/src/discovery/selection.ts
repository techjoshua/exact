import {
	dependencyRange,
	exactPluginApiPackage,
	exactPluginProtocolVersion,
	packageDirectlyDependsOnPluginApi,
	readExactPackageParticipation,
	type ExactPackageParticipation,
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
} from '../graph.js';
import type {
	ExactDiscoveryPolicy,
	ExactParticipatingPackage,
	ExactPluginRequirement,
	ExactSelectedPlugin
} from './contracts.js';

export type MutableParticipant = {
	node: ExactPackageNode;
	participation: ExactPackageParticipation;
	activationPaths: string[][];
};

export function acceptParticipant(
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

export function selectPlugins(
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

export function validateParticipantMarker(node: ExactPackageNode): void {
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

export function validatePluginProtocol(name: string, declaration: ExactPluginDeclaration): void {
	if (
		!valid(declaration.protocolVersion) ||
		declaration.protocolVersion.split('.')[0] !== exactPluginProtocolVersion.split('.')[0]
	) {
		throw new Error(`${name} declares unsupported plugin protocol ${declaration.protocolVersion}`);
	}
}

export function validatePluginEntries(
	node: ExactPackageNode,
	declaration: ExactPluginDeclaration
): void {
	for (const [kind, subpath] of Object.entries(declaration.entries)) {
		if (!manifestExportsSubpath(node.manifest.exports, subpath)) {
			throw new Error(
				`${packageName(node)} plugin ${kind} entry ${subpath} is not a public package export`
			);
		}
	}
}

export function rejectAmbiguousParticipants(
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

export function rejectConfigKeyConflicts(plugins: ReadonlyMap<string, ExactSelectedPlugin>): void {
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

export function isTrustedChild(
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

export function versionSatisfies(version: string, range: string): boolean {
	if (isLocalRange(range)) return true;
	return (
		valid(version) !== null &&
		validRange(range) !== null &&
		satisfies(version, range, { includePrerelease: true })
	);
}

export function isLocalRange(range: string): boolean {
	return /^(?:file|workspace|link):/.test(range) || range === '*';
}

export function hasParticipation(value: ExactPackageParticipation): boolean {
	return (
		value.plugin !== undefined ||
		value.forwarding !== undefined ||
		Object.keys(value.configuration).length > 0
	);
}

export function freezeParticipant(value: MutableParticipant): ExactParticipatingPackage {
	return Object.freeze({
		node: value.node,
		participation: value.participation,
		activationPaths: Object.freeze(
			value.activationPaths.map((pathValue) => Object.freeze([...pathValue]))
		)
	});
}

export function requiredNode(graph: ExactPackageGraph, id: string): ExactPackageNode {
	const node = graph.nodes.get(id);
	if (!node) throw new Error(`Package graph references missing node ${JSON.stringify(id)}`);
	return node;
}

export function safePackageName(node: ExactPackageNode): string | undefined {
	return typeof node.manifest.name === 'string' && node.manifest.name
		? node.manifest.name
		: undefined;
}

export function manifestLabel(node: ExactPackageNode): string {
	return path.join(node.location, 'package.json');
}

export function manifestExportsSubpath(exportsField: unknown, subpath: string): boolean {
	if (typeof exportsField === 'string' || Array.isArray(exportsField)) return subpath === '.';
	if (!exportsField || typeof exportsField !== 'object') return false;
	const record = exportsField as Record<string, unknown>;
	return (
		Object.prototype.hasOwnProperty.call(record, subpath) ||
		(subpath === '.' && Object.keys(record).every((key) => !key.startsWith('.')))
	);
}
