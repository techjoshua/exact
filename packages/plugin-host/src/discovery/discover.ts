import type { ExactPluginDiscoveryConfig } from '@exact/config';
import { matchesPackageSelectors, readExactPackageParticipation } from '@exact/plugin-api';
import { packageName, type ExactPackageGraph } from '../graph.js';
import type {
	ExactConfigurationContributor,
	ExactPluginDiscoveryResult,
	ExactPluginRequirement
} from './contracts.js';
import { resolveDiscoveryPolicy } from './policy.js';
import {
	acceptParticipant,
	freezeParticipant,
	hasParticipation,
	isTrustedChild,
	manifestLabel,
	rejectAmbiguousParticipants,
	rejectConfigKeyConflicts,
	requiredNode,
	selectPlugins,
	validateParticipantMarker,
	versionSatisfies,
	type MutableParticipant
} from './selection.js';

/** Collects exact plugins in deterministic order. */
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
