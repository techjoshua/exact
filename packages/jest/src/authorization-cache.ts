import type {
	ExactComponentAuthorizationAudit,
	ExactComponentAuthorizationManifest
} from '@exactjs/component-library-policy';

/** Environment variable containing the active immutable Jest authorization cache path. */
export const exactJestAuthorizationCacheEnvironment = 'EXACT_JEST_AUTHORIZATION_CACHE';

/** Immutable preflight result shared with isolated Jest resolver and transformer workers. */
export type ExactJestAuthorizationCache = Readonly<{
	protocol: 1;
	projectRoot: string;
	sources: Readonly<Record<string, string>>;
	resolutions: Readonly<Record<string, string>>;
	manifest: ExactComponentAuthorizationManifest;
	audit: ExactComponentAuthorizationAudit;
}>;

/** Creates the stable resolver lookup key for an importer directory and authored request. */
export function exactJestResolutionKey(basedir: string, request: string): string {
	return `${basedir}\0${request}`;
}
