import type { ExactComponentBuildFacts } from '@exactjs/compiler';
import type { ExactComponentLibraryTrustConfig } from '@exactjs/config';
import path from 'node:path';
import {
	exactComponentLibraryRuleMatches,
	normalizeExactComponentLibraryPolicy,
	type ExactNormalizedComponentLibraryPolicy
} from './configuration.js';
import {
	ExactComponentAuthorizationError,
	type ExactComponentAuthorizationAudit,
	type ExactComponentAuthorizationDecision,
	type ExactComponentAuthorizationErrorCode,
	type ExactComponentAuthorizationManifest,
	type ExactComponentAuthorizationSession,
	type ExactComponentAuthorizationTelemetry,
	type ExactComponentServerExecutionReason,
	type ExactResolvedComponentAuthorization,
	type ExactResolvedComponentCandidate,
	type ExactResolvedDependencyEdge,
	type ExactResolvedPackageInstance
} from './contracts.js';
import { canonicalHash } from './hashing.js';
import {
	createExactAuthorizationArtifacts,
	type ExactAuthorizedGenerationRecord,
	type ExactOmittedGenerationRecord
} from './generation-output.js';
import {
	ExactComponentParticipationValidator,
	ExactComponentParticipationError
} from './participation.js';

/** Options for one isolated build/watch authorization generation. */
export type CreateExactComponentAuthorizationSessionOptions = Readonly<{
	buildKey: string;
	config?: ExactComponentLibraryTrustConfig;
}>;

type ImporterRecord = Readonly<{ facts: ExactComponentBuildFacts; version: string }>;
type AuthorizedRecord = ExactAuthorizedGenerationRecord & {
	reasons: Set<ExactComponentServerExecutionReason>;
};
type OmittedRecord = ExactOmittedGenerationRecord;
type OmittedReason = ExactComponentAuthorizationAudit['omittedEnhancements'][number]['reason'];

/** Creates the authoritative pre-evaluation policy session for one build generation. */
export function createExactComponentAuthorizationSession(
	options: CreateExactComponentAuthorizationSessionOptions
): ExactComponentAuthorizationSession {
	if (!options.buildKey.trim()) throw new Error('Component authorization requires a buildKey');
	return new ComponentAuthorizationGeneration(
		options.buildKey,
		normalizeExactComponentLibraryPolicy(options.config)
	);
}

/** Owns all mutable provenance and decisions until one atomic commit or rejection. */
class ComponentAuthorizationGeneration implements ExactComponentAuthorizationSession {
	readonly #importers = new Map<string, ImporterRecord>();
	readonly #instances = new Map<string, ExactResolvedPackageInstance>();
	readonly #edges: ExactResolvedDependencyEdge[] = [];
	readonly #authorized = new Map<string, AuthorizedRecord>();
	readonly #omitted = new Map<string, OmittedRecord>();
	readonly #participation = new ExactComponentParticipationValidator();
	#state: 'open' | 'committed' | 'rejected' | 'disposed' = 'open';

	constructor(
		private readonly buildKey: string,
		private readonly policy: ExactNormalizedComponentLibraryPolicy
	) {}

	recordImporterFacts(moduleId: string, facts: ExactComponentBuildFacts, version: string): void {
		this.assertOpen();
		if (facts.protocol !== 1 || facts.filename !== moduleId)
			throw this.error('provenance-unresolved', 'Importer facts do not match their module ID');
		const existing = this.#importers.get(moduleId);
		if (existing && existing.version !== version)
			throw this.error(
				'generation-stale',
				`Importer ${moduleId} changed during authorization generation ${this.buildKey}`
			);
		this.#importers.set(moduleId, Object.freeze({ facts, version }));
	}

	recordPackageInstance(instance: ExactResolvedPackageInstance): void {
		this.assertOpen();
		if (
			!instance.key ||
			!path.isAbsolute(instance.root) ||
			!path.isAbsolute(instance.manifestPath) ||
			!instance.name ||
			!instance.version
		)
			throw this.error('provenance-unresolved', 'Resolver supplied an incomplete package identity');
		const existing = this.#instances.get(instance.key);
		if (existing && canonicalHash(existing) !== canonicalHash(instance))
			throw this.error(
				'provenance-unresolved',
				`Resolver key ${instance.key} identifies more than one physical package instance`
			);
		this.#instances.set(instance.key, Object.freeze({ ...instance }));
	}

	recordDependencyEdge(edge: ExactResolvedDependencyEdge): void {
		this.assertOpen();
		if (!edge.candidate || !edge.specifier)
			throw this.error('provenance-unresolved', 'Resolver supplied an incomplete dependency edge');
		if (!this.#edges.some((existing) => canonicalHash(existing) === canonicalHash(edge)))
			this.#edges.push(Object.freeze({ ...edge }));
	}

	async authorizeResolvedComponent(
		candidate: ExactResolvedComponentCandidate
	): Promise<ExactResolvedComponentAuthorization> {
		this.assertOpen();
		const instance = this.#instances.get(candidate.packageInstanceKey);
		if (!instance)
			throw this.candidateError(
				'provenance-unresolved',
				candidate,
				undefined,
				`No resolved package instance was recorded for ${candidate.moduleSpecifier}`
			);
		this.validateImporterCandidate(candidate, instance);
		try {
			const participation = await this.#participation.validate(
				instance,
				candidate,
				this.#instances,
				this.#edges
			);
			const decision = this.policyDecision(instance);
			if (!decision)
				throw this.candidateError(
					'not-allowed',
					candidate,
					instance,
					`${instance.name}@${instance.version} is not allowed by componentLibraries policy`
				);
			if (decision.denied)
				throw this.candidateError(
					'explicitly-denied',
					candidate,
					instance,
					`${instance.name}@${instance.version} matches deny rule ${decision.matchedRule}`
				);
			const instanceId = packageInstanceId(instance);
			const existing = this.#authorized.get(instance.key);
			if (existing) {
				existing.reasons.add(candidate.reason);
			} else {
				this.#authorized.set(instance.key, {
					instance,
					instanceId,
					participation,
					decision: decision.decision,
					...(decision.matchedRule ? { matchedRule: decision.matchedRule } : {}),
					reasons: new Set([candidate.reason])
				});
			}
			this.recordPublishedImporterFacts(participation.componentBuild);
			return Object.freeze({
				outcome: 'authorized' as const,
				packageInstanceId: instanceId,
				componentBuild: participation.componentBuild,
				watchFiles: Object.freeze([participation.buildFactsPath])
			});
		} catch (error) {
			const authorizationError =
				error instanceof ExactComponentAuthorizationError
					? error
					: error instanceof ExactComponentParticipationError
						? this.candidateError(error.code, candidate, instance, error.message)
						: error;
			if (
				authorizationError instanceof ExactComponentAuthorizationError &&
				candidate.optionalEnhancementIdentity &&
				this.policy.unauthorizedOptionalEnhancements === 'exclude' &&
				isOmittableReason(authorizationError.code)
			) {
				this.#omitted.set(
					candidate.optionalEnhancementIdentity,
					Object.freeze({
						identity: candidate.optionalEnhancementIdentity,
						packageName: instance.name,
						reason: authorizationError.code
					})
				);
				return Object.freeze({
					outcome: 'omitted' as const,
					enhancementIdentity: candidate.optionalEnhancementIdentity
				});
			}
			throw authorizationError;
		}
	}

	async commitGeneration(): Promise<
		Readonly<{
			manifest: ExactComponentAuthorizationManifest;
			audit: ExactComponentAuthorizationAudit;
		}>
	> {
		this.assertOpen();
		const artifacts = createExactAuthorizationArtifacts({
			buildKey: this.buildKey,
			policyHash: this.policy.policyHash,
			packages: [...this.#authorized.values()],
			omittedEnhancements: [...this.#omitted.values()],
			instances: this.#instances,
			edges: this.#edges
		});
		this.#state = 'committed';
		this.releaseMutableInputs();
		return artifacts;
	}

	getTelemetry(): ExactComponentAuthorizationTelemetry {
		return Object.freeze({
			state: this.#state,
			importers: this.#importers.size,
			packageInstances: this.#instances.size,
			dependencyEdges: this.#edges.length,
			authorizedPackages: this.#authorized.size,
			omittedEnhancements: this.#omitted.size,
			participationCacheEntries: this.#participation.size
		});
	}

	rejectGeneration(): void {
		if (this.#state !== 'open') return;
		this.#state = 'rejected';
		this.releaseMutableInputs();
	}

	dispose(): void {
		if (this.#state === 'disposed') return;
		this.#state = 'disposed';
		this.releaseMutableInputs();
	}

	private validateImporterCandidate(
		candidate: ExactResolvedComponentCandidate,
		instance: ExactResolvedPackageInstance
	): void {
		const importer = this.#importers.get(candidate.importerModuleId);
		if (!importer)
			throw this.candidateError(
				'provenance-unresolved',
				candidate,
				instance,
				`No compiler component facts were recorded for ${candidate.importerModuleId}`
			);
		const componentEdge = importer.facts.componentImports.some(
			(edge) =>
				edge.moduleSpecifier === candidate.moduleSpecifier &&
				edge.exportName === candidate.exportName &&
				edge.artifactTargets.includes('server')
		);
		const enhancementEdge =
			candidate.optionalEnhancementIdentity !== undefined &&
			importer.facts.rendererEnhancements.some(
				(edge) =>
					edge.identity === candidate.optionalEnhancementIdentity &&
					edge.moduleSpecifier === candidate.moduleSpecifier &&
					edge.exportName === candidate.exportName
			);
		if (!componentEdge && !enhancementEdge)
			throw this.candidateError(
				'provenance-unresolved',
				candidate,
				instance,
				`Compiler facts for ${candidate.importerModuleId} do not contain a ${candidate.reason} edge for ${candidate.moduleSpecifier}#${candidate.exportName}; recorded enhancements: ${
					importer.facts.rendererEnhancements
						.map((edge) => `${edge.moduleSpecifier}#${edge.exportName}`)
						.join(', ') || '(none)'
				}`
			);
	}

	private recordPublishedImporterFacts(facts: ExactComponentBuildFacts): void {
		const version = canonicalHash(facts);
		const existing = this.#importers.get(facts.filename);
		if (existing && canonicalHash(existing.facts) !== canonicalHash(facts))
			throw this.error(
				'provenance-unresolved',
				`Published component facts conflict for ${facts.filename}`
			);
		if (!existing) this.#importers.set(facts.filename, Object.freeze({ facts, version }));
	}

	private policyDecision(instance: ExactResolvedPackageInstance):
		| Readonly<{
				denied: false;
				decision: ExactComponentAuthorizationDecision;
				matchedRule?: string;
		  }>
		| Readonly<{ denied: true; matchedRule: string }>
		| undefined {
		const denied = this.policy.deny.find((rule) =>
			exactComponentLibraryRuleMatches(rule, instance)
		);
		if (denied) return Object.freeze({ denied: true, matchedRule: denied.description });
		const allowed = this.policy.allow.find((rule) =>
			exactComponentLibraryRuleMatches(rule, instance)
		);
		if (allowed)
			return Object.freeze({ denied: false, decision: 'allow', matchedRule: allowed.description });
		const rootEdge = this.#edges.find(
			(edge) =>
				edge.owner === 'application' &&
				edge.candidate === instance.key &&
				edge.kind === 'dependency'
		);
		if (rootEdge) return Object.freeze({ denied: false, decision: 'root' });
		if (this.policy.mode === 'root') return undefined;
		if (this.policy.mode === 'all') return Object.freeze({ denied: false, decision: 'all' });
		const scopes = [
			...this.policy.trustedScopes,
			...(this.policy.includeDefaultTrustedScopes ? ['@exactjs/'] : [])
		];
		const scope = scopes.find((prefix) => instance.name.startsWith(prefix));
		if (scope) return Object.freeze({ denied: false, decision: 'scope', matchedRule: scope });
		const delegated = this.#edges.find(
			(edge) =>
				edge.candidate === instance.key &&
				edge.kind === 'dependency' &&
				edge.owner !== 'application' &&
				this.#authorized.has(edge.owner)
		);
		return delegated ? Object.freeze({ denied: false, decision: 'delegated' }) : undefined;
	}

	private candidateError(
		code: ExactComponentAuthorizationErrorCode,
		candidate: ExactResolvedComponentCandidate,
		instance: ExactResolvedPackageInstance | undefined,
		message: string
	): ExactComponentAuthorizationError {
		return this.error(code, message, candidate, instance);
	}

	private error(
		code: ExactComponentAuthorizationErrorCode,
		message: string,
		candidate?: ExactResolvedComponentCandidate,
		instance?: ExactResolvedPackageInstance
	): ExactComponentAuthorizationError {
		return new ExactComponentAuthorizationError(
			Object.freeze({
				code,
				message,
				buildKey: this.buildKey,
				...(candidate
					? {
							request: Object.freeze({
								importerModuleId: candidate.importerModuleId,
								moduleSpecifier: candidate.moduleSpecifier,
								exportName: candidate.exportName,
								resolvedModuleId: candidate.resolvedModuleId,
								reason: candidate.reason
							})
						}
					: {}),
				...(instance
					? {
							package: Object.freeze({
								instanceId: packageInstanceId(instance),
								name: instance.name,
								version: instance.version
							})
						}
					: {})
			})
		);
	}

	private assertOpen(): void {
		if (this.#state !== 'open')
			throw this.error(
				'generation-stale',
				`Authorization generation ${this.buildKey} is ${this.#state}`
			);
	}

	private releaseMutableInputs(): void {
		this.#importers.clear();
		this.#instances.clear();
		this.#edges.length = 0;
		this.#authorized.clear();
		this.#omitted.clear();
		this.#participation.clear();
	}
}

function packageInstanceId(instance: ExactResolvedPackageInstance): string {
	return canonicalHash([
		path.normalize(instance.root),
		instance.name,
		instance.version,
		instance.integrity ?? ''
	]);
}

function isOmittableReason(code: ExactComponentAuthorizationErrorCode): code is OmittedReason {
	return [
		'unmarked',
		'marker-incompatible',
		'build-facts-missing',
		'build-facts-invalid',
		'not-allowed',
		'explicitly-denied'
	].includes(code);
}
