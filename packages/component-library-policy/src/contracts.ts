import type { ExactComponentBuildFacts } from '@exactjs/compiler';

/** Server execution paths requiring component-library authorization. */
export type ExactComponentServerExecutionReason =
	| 'ssr'
	| 'server-component'
	| 'server-enhancement'
	| 'server-task'
	| 'refresh'
	| 'resumption'
	| 'server-test';

/** Resolver-owned identity for one physical package instance. */
export type ExactResolvedPackageInstance = Readonly<{
	key: string;
	root: string;
	manifestPath: string;
	name: string;
	version: string;
	integrity?: string;
}>;

/** Resolver-owned dependency edge used to prove root or delegated provenance. */
export type ExactResolvedDependencyEdge = Readonly<{
	owner: 'application' | string;
	candidate: string;
	specifier: string;
	kind: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency';
}>;

/** One compiler-recorded component request after the bundler has resolved it. */
export type ExactResolvedComponentCandidate = Readonly<{
	importerModuleId: string;
	moduleSpecifier: string;
	exportName: string;
	resolvedModuleId: string;
	packageInstanceKey: string;
	reason: ExactComponentServerExecutionReason;
	optionalEnhancementIdentity?: string;
}>;

/** Stable authorization decision categories emitted in manifests and audits. */
export type ExactComponentAuthorizationDecision = 'root' | 'allow' | 'scope' | 'delegated' | 'all';

/** Compact server-private authorization manifest for one committed generation. */
export type ExactComponentAuthorizationManifest = Readonly<{
	protocol: 1;
	buildKey: string;
	fingerprint: string;
	policyHash: string;
	markerProtocol: 1;
	packages: readonly Readonly<{
		instanceId: string;
		name: string;
		version: string;
		integrityHash?: string;
		decision: ExactComponentAuthorizationDecision;
		reasons: readonly ExactComponentServerExecutionReason[];
	}>[];
	omittedEnhancements: readonly string[];
}>;

/** Redacted provenance and matched-policy explanation for one committed generation. */
export type ExactComponentAuthorizationAudit = Readonly<{
	protocol: 1;
	buildKey: string;
	fingerprint: string;
	packages: readonly Readonly<{
		instanceId: string;
		name: string;
		version: string;
		markerVersion: string;
		decision: ExactComponentAuthorizationDecision;
		reasons: readonly ExactComponentServerExecutionReason[];
		matchedRule?: string;
		provenance: readonly Readonly<{
			owner: 'application' | string;
			specifier: string;
			kind: ExactResolvedDependencyEdge['kind'];
		}>[];
	}>[];
	omittedEnhancements: readonly Readonly<{
		identity: string;
		packageName: string;
		reason: Extract<
			ExactComponentAuthorizationErrorCode,
			| 'unmarked'
			| 'marker-incompatible'
			| 'build-facts-missing'
			| 'build-facts-invalid'
			| 'not-allowed'
			| 'explicitly-denied'
		>;
	}>[];
}>;

/** Stable authorization diagnostic codes shared by every adapter. */
export type ExactComponentAuthorizationErrorCode =
	| 'unmarked'
	| 'marker-incompatible'
	| 'build-facts-missing'
	| 'build-facts-invalid'
	| 'not-allowed'
	| 'explicitly-denied'
	| 'provenance-unresolved'
	| 'generation-stale'
	| 'server-hmr-unsupported';

/** Structured build diagnostic safe for adapter-specific rendering. */
export type ExactComponentAuthorizationDiagnostic = Readonly<{
	code: ExactComponentAuthorizationErrorCode;
	message: string;
	buildKey: string;
	request?: Readonly<{
		importerModuleId: string;
		moduleSpecifier: string;
		exportName: string;
		resolvedModuleId: string;
		reason: ExactComponentServerExecutionReason;
	}>;
	package?: Readonly<{
		instanceId: string;
		name: string;
		version: string;
	}>;
	resolution?: string;
}>;

/** Error thrown before an unauthorized component implementation can be evaluated. */
export class ExactComponentAuthorizationError extends Error {
	readonly code: ExactComponentAuthorizationErrorCode;
	readonly diagnostic: ExactComponentAuthorizationDiagnostic;

	constructor(diagnostic: ExactComponentAuthorizationDiagnostic) {
		super(diagnostic.message);
		this.name = 'ExactComponentAuthorizationError';
		this.code = diagnostic.code;
		this.diagnostic = diagnostic;
	}
}

/** Result of authorizing one required component or optional enhancement. */
export type ExactResolvedComponentAuthorization =
	| Readonly<{
			outcome: 'authorized';
			packageInstanceId: string;
			componentBuild: ExactComponentBuildFacts;
	  }>
	| Readonly<{ outcome: 'omitted'; enhancementIdentity: string }>;

/** Atomic authorization generation shared by build and test adapters. */
export interface ExactComponentAuthorizationSession {
	recordImporterFacts(moduleId: string, facts: ExactComponentBuildFacts, version: string): void;
	recordPackageInstance(instance: ExactResolvedPackageInstance): void;
	recordDependencyEdge(edge: ExactResolvedDependencyEdge): void;
	authorizeResolvedComponent(
		candidate: ExactResolvedComponentCandidate
	): Promise<ExactResolvedComponentAuthorization>;
	commitGeneration(): Promise<
		Readonly<{
			manifest: ExactComponentAuthorizationManifest;
			audit: ExactComponentAuthorizationAudit;
		}>
	>;
	rejectGeneration(): void;
	dispose(): void;
}
