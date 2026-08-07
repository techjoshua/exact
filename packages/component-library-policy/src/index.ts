export {
	ExactComponentAuthorizationError,
	type ExactComponentAuthorizationAudit,
	type ExactComponentAuthorizationDecision,
	type ExactComponentAuthorizationDiagnostic,
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
export {
	exactComponentLibraryRuleMatches,
	normalizeExactComponentLibraryPolicy,
	type ExactNormalizedComponentLibraryPolicy,
	type ExactNormalizedComponentLibraryRule
} from './configuration.js';
export {
	createExactComponentAuthorizationSession,
	type CreateExactComponentAuthorizationSessionOptions
} from './session.js';
export {
	recordExactNodeComponentProvenance,
	type ExactNodeComponentProvenance,
	type RecordExactNodeComponentProvenanceOptions
} from './node-provenance.js';
export {
	exactComponentAuthorizationIdentity,
	readExactComponentAuthorizationIdentity,
	type ExactComponentAuthorizationRuntimeIdentity
} from './runtime-identity.js';
