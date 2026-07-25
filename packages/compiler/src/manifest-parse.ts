import type { ExactCompilerManifest } from './types.js';
import { exactCompilerManifestVersion } from './versions.js';

import { isExactCallableSummary } from './manifest/callable-validation.js';
import {
	isExactComponentResumption,
	isExactContinuation
} from './manifest/continuation-validation.js';
import { validatePluginEnvelope } from './manifest/plugin-validation.js';
import {
	isExactAssetDependency,
	isExactCapabilityRequirements,
	isExactPolicyManifest
} from './manifest/policy-validation.js';
import { isExactSemanticGraph } from './manifest/semantic-validation.js';

export { isExactArtifactManifest } from './manifest/artifact-validation.js';

/** Parses and validates a compiler manifest loaded from JSON. */
export function parseExactCompilerManifest(
	value: unknown,
	source = 'manifest',
	kind = 'compiler'
): ExactCompilerManifest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Malformed eXact ${kind} manifest in ${source}`);
	}
	const manifest = value as Partial<ExactCompilerManifest> & { version?: unknown };
	if (manifest.version !== exactCompilerManifestVersion) {
		throw new Error(
			`Unsupported eXact ${kind} manifest version in ${source}: ${String(manifest.version)}`
		);
	}
	if (
		typeof manifest.filename !== 'string' ||
		!Array.isArray(manifest.dependencies) ||
		!manifest.dependencies.every((dependency) => typeof dependency === 'string') ||
		!Array.isArray(manifest.assets) ||
		!manifest.assets.every(isExactAssetDependency) ||
		!Array.isArray(manifest.components) ||
		!Array.isArray(manifest.exports) ||
		!Array.isArray(manifest.symbols) ||
		!Array.isArray(manifest.boundaries) ||
		!Array.isArray(manifest.callables) ||
		!Array.isArray(manifest.continuations) ||
		!Array.isArray(manifest.resumptions) ||
		!isExactPolicyManifest(manifest.policy) ||
		!manifest.serverActions ||
		typeof manifest.serverActions !== 'object' ||
		Array.isArray(manifest.serverActions) ||
		!Array.isArray(manifest.diagnostics)
	) {
		throw new Error(`Malformed eXact ${kind} manifest in ${source}`);
	}
	if (manifest.version !== exactCompilerManifestVersion) {
		throw new Error(
			`Unsupported eXact ${kind} manifest version in ${source}: ${String(manifest.version)}`
		);
	}
	if (manifest.semanticGraph !== undefined && !isExactSemanticGraph(manifest.semanticGraph)) {
		throw new Error(`Malformed eXact ${kind} semantic graph in ${source}`);
	}
	if (!manifest.callables!.every(isExactCallableSummary)) {
		throw new Error(`Malformed eXact ${kind} callable summaries in ${source}`);
	}
	if (
		!manifest.continuations!.every(isExactContinuation) ||
		!manifest.resumptions!.every(isExactComponentResumption)
	) {
		throw new Error(`Malformed eXact ${kind} continuation contracts in ${source}`);
	}
	if (
		(manifest.packageName !== undefined &&
			(typeof manifest.packageName !== 'string' || !manifest.packageName)) ||
		(manifest.requiredCapabilities !== undefined &&
			!isExactCapabilityRequirements(manifest.requiredCapabilities))
	) {
		throw new Error(`Malformed eXact ${kind} capability requirements in ${source}`);
	}
	if (
		new Set(manifest.dependencies).size !== manifest.dependencies.length ||
		manifest.dependencies.some(
			(dependency) => dependency.length === 0 || /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(dependency)
		)
	) {
		throw new Error(`Malformed eXact ${kind} dependencies in ${source}`);
	}
	const callableIds = new Set(manifest.callables!.map((callable) => callable.id));
	const componentIds = new Set(manifest.components.map((component) => component.id));
	const taskIds = new Set(
		manifest.components.flatMap((component) => component.tasks.map((task) => task.id))
	);
	const boundaryIds = new Set(manifest.boundaries.map((boundary) => boundary.id));
	if (
		callableIds.size !== manifest.callables!.length ||
		manifest.callables!.some(
			(callable) => new Set(callable.calls.map((edge) => edge.id)).size !== callable.calls.length
		) ||
		manifest.callables!.some((callable) =>
			callable.calls.some((edge) => edge.targetId !== undefined && !callableIds.has(edge.targetId))
		)
	) {
		throw new Error(`Malformed eXact ${kind} callable graph in ${source}`);
	}
	if (
		manifest.continuations!.some(
			(continuation) =>
				!componentIds.has(continuation.componentId) ||
				!taskIds.has(continuation.taskId) ||
				continuation.effects.boundaries.some((boundary) => !boundaryIds.has(boundary))
		) ||
		manifest.resumptions!.some(
			(resumption) =>
				!componentIds.has(resumption.componentId) ||
				resumption.client.boundaries.some((boundary) => !boundaryIds.has(boundary))
		)
	) {
		throw new Error(`Malformed eXact ${kind} continuation graph in ${source}`);
	}
	const policySubjectIds = new Set(manifest.policy!.subjects.map((subject) => subject.id));
	const secretConsumerIds = new Set(
		manifest.policy!.secretConsumers.map((consumer) => consumer.id)
	);
	const policySourceIds = new Set([
		...policySubjectIds,
		...secretConsumerIds,
		...callableIds,
		...manifest.components.map((component) => component.id),
		...manifest.components.flatMap((component) => component.tasks.map((task) => task.id))
	]);
	if (
		policySubjectIds.size !== manifest.policy!.subjects.length ||
		secretConsumerIds.size !== manifest.policy!.secretConsumers.length ||
		new Set(manifest.policy!.flows.map((flow) => flow.id)).size !== manifest.policy!.flows.length ||
		manifest.policy!.flows.some((flow) => flow.from.some((id) => !policySourceIds.has(id)))
	) {
		throw new Error(`Malformed eXact ${kind} policy graph in ${source}`);
	}
	validatePluginEnvelope(manifest, source, kind);
	return manifest as ExactCompilerManifest;
}
