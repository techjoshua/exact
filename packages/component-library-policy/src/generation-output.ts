import type {
	ExactComponentAuthorizationAudit,
	ExactComponentAuthorizationDecision,
	ExactComponentAuthorizationManifest,
	ExactComponentServerExecutionReason,
	ExactResolvedDependencyEdge,
	ExactResolvedPackageInstance
} from './contracts.js';
import { canonicalHash } from './hashing.js';
import type { ExactComponentParticipation } from './participation.js';

/** Authorized package data retained until one generation publishes immutable artifacts. */
export type ExactAuthorizedGenerationRecord = Readonly<{
	instance: ExactResolvedPackageInstance;
	instanceId: string;
	participation: ExactComponentParticipation;
	decision: ExactComponentAuthorizationDecision;
	matchedRule?: string;
	reasons: ReadonlySet<ExactComponentServerExecutionReason>;
}>;

/** Optional enhancement omission retained until one generation publishes immutable artifacts. */
export type ExactOmittedGenerationRecord = Readonly<{
	identity: string;
	packageName: string;
	reason: ExactComponentAuthorizationAudit['omittedEnhancements'][number]['reason'];
}>;

/** Inputs needed to create the public manifest and redacted private audit atomically. */
export type ExactAuthorizationArtifactInputs = Readonly<{
	buildKey: string;
	policyHash: string;
	packages: readonly ExactAuthorizedGenerationRecord[];
	omittedEnhancements: readonly ExactOmittedGenerationRecord[];
	instances: ReadonlyMap<string, ExactResolvedPackageInstance>;
	edges: readonly ExactResolvedDependencyEdge[];
}>;

/** Creates deterministic authorization artifacts without retaining mutable generation state. */
export function createExactAuthorizationArtifacts(
	inputs: ExactAuthorizationArtifactInputs
): Readonly<{
	manifest: ExactComponentAuthorizationManifest;
	audit: ExactComponentAuthorizationAudit;
}> {
	const packages = [...inputs.packages].sort((left, right) =>
		left.instanceId.localeCompare(right.instanceId)
	);
	const omitted = [...inputs.omittedEnhancements].sort((left, right) =>
		left.identity.localeCompare(right.identity)
	);
	const fingerprint = canonicalHash({
		protocol: 1,
		markerProtocol: 1,
		buildKey: inputs.buildKey,
		policyHash: inputs.policyHash,
		packages: packages.map((record) => ({
			instanceId: record.instanceId,
			decision: record.decision,
			reasons: sorted(record.reasons)
		})),
		omittedEnhancements: omitted.map((record) => record.identity)
	});
	const manifest: ExactComponentAuthorizationManifest = Object.freeze({
		protocol: 1,
		buildKey: inputs.buildKey,
		fingerprint,
		policyHash: inputs.policyHash,
		markerProtocol: 1,
		packages: Object.freeze(
			packages.map((record) =>
				Object.freeze({
					instanceId: record.instanceId,
					name: record.instance.name,
					version: record.instance.version,
					...(record.instance.integrity
						? { integrityHash: canonicalHash(record.instance.integrity) }
						: {}),
					decision: record.decision,
					reasons: Object.freeze(sorted(record.reasons))
				})
			)
		),
		omittedEnhancements: Object.freeze(omitted.map((record) => record.identity))
	});
	const audit: ExactComponentAuthorizationAudit = Object.freeze({
		protocol: 1,
		buildKey: inputs.buildKey,
		fingerprint,
		packages: Object.freeze(packages.map((record) => auditPackage(record, inputs))),
		omittedEnhancements: Object.freeze(omitted.map((record) => Object.freeze({ ...record })))
	});
	return Object.freeze({ manifest, audit });
}

function auditPackage(
	record: ExactAuthorizedGenerationRecord,
	inputs: ExactAuthorizationArtifactInputs
): ExactComponentAuthorizationAudit['packages'][number] {
	const provenance = inputs.edges
		.filter((edge) => edge.candidate === record.instance.key)
		.map((edge) =>
			Object.freeze({
				owner:
					edge.owner === 'application'
						? ('application' as const)
						: (inputs.instances.get(edge.owner)?.name ?? edge.owner),
				specifier: edge.specifier,
				kind: edge.kind
			})
		)
		.sort((left, right) => canonicalHash(left).localeCompare(canonicalHash(right)));
	return Object.freeze({
		instanceId: record.instanceId,
		name: record.instance.name,
		version: record.instance.version,
		markerVersion: record.participation.markerVersion,
		decision: record.decision,
		reasons: Object.freeze(sorted(record.reasons)),
		...(record.matchedRule ? { matchedRule: record.matchedRule } : {}),
		provenance: Object.freeze(provenance)
	});
}

function sorted<T extends string>(values: Iterable<T>): T[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}
