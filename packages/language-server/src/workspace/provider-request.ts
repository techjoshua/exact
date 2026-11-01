import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import type { ExactLanguageExtensionHost } from '@exactjs/language-extension-host';
import { relevantLanguageProviderPackages } from '../provider-relevance.js';

/** Provider resources/status remain owned by the manager's captured workspace record. */
type ProviderWorkspace = {
	languageHost: Promise<ExactLanguageExtensionHost>;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
	providerFailure?: string;
};

/**
 * Runs the fixed provider acquisition/synchronization/contribution sequence for one captured input.
 * The manager supplies its existing ownership predicate and already acquired inspection projection.
 * Retired work returns empty without status publication. Live provider failures retain the existing
 * empty-result/status policy, while explicitly aborted rejections propagate unchanged.
 */
export async function requestWorkspaceProviders<T>(
	workspace: ProviderWorkspace,
	projection: ExactLanguageProjectionV1,
	request: (host: ExactLanguageExtensionHost, projection: ExactLanguageProjectionV1) => Promise<T>,
	isCurrent: () => boolean,
	signal?: AbortSignal
): Promise<T | readonly []> {
	try {
		const host = await workspace.languageHost;
		if (!isCurrent()) return [];
		await host.synchronizeProviders(
			relevantLanguageProviderPackages(projection, workspace.packageEnhancements),
			signal
		);
		if (!isCurrent()) return [];
		const result = await request(host, projection);
		if (!isCurrent()) return [];
		workspace.providerFailure = undefined;
		return result;
	} catch (error) {
		if (signal?.aborted) throw error;
		if (isCurrent()) workspace.providerFailure = providerFailureMessage(error);
		return [];
	}
}

/** Retains ordinary thrown values in the existing provider-health message contract. */
export function providerFailureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
