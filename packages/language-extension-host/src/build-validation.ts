import type { ExactLanguageExtensionsConfig, ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import type { ExactHostedLanguageDiagnostic, ExactLanguageProviderStatus } from './contracts.js';
import { createExactLanguageExtensionHost } from './language-host.js';

/** Options shared by compiler and bundler language-validation boundaries. */
export interface ExactLanguageValidationSessionOptions {
	readonly workspaceRoot: string;
	readonly locale?: string;
	readonly config?: ExactLanguageExtensionsConfig;
	readonly packageEnhancements?: readonly ExactPackageEnhancementImport[];
}

/** One accepted validation result, including visible provider state for build reporting. */
export interface ExactLanguageValidationResult {
	readonly diagnostics: readonly ExactHostedLanguageDiagnostic[];
	readonly statuses: readonly ExactLanguageProviderStatus[];
}

/** A provider-owned error that rejects a candidate compiler or bundler generation. */
export class ExactLanguageValidationError extends Error {
	constructor(readonly diagnostics: readonly ExactHostedLanguageDiagnostic[]) {
		super(
			`Language validation failed:\n${diagnostics
				.map(
					({ provider, diagnostic }) =>
						`${diagnostic.range.start}: ${provider}/${diagnostic.code}: ${diagnostic.summary}`
				)
				.join('\n')}`
		);
		this.name = 'ExactLanguageValidationError';
	}
}

/**
 * Creates the reusable Node-only validation session used by exactc and official build adapters.
 * The session owns discovery and provider processes so adapters never implement either concern.
 */
export function createExactLanguageValidationSession(
	options: ExactLanguageValidationSessionOptions
): ExactLanguageValidationSession {
	const host = createExactLanguageExtensionHost(options);
	return Object.freeze({
		async validate(
			projections: readonly ExactLanguageProjectionV1[],
			signal?: AbortSignal
		): Promise<ExactLanguageValidationResult> {
			const packageNames = [
				...new Set([
					...projections.flatMap((projection) =>
						projection.imports.flatMap((entry) =>
							entry.enhancement && entry.package ? [entry.package.name] : []
						)
					),
					...(options.packageEnhancements ?? []).flatMap((entry) => {
						const name = packageName(entry.moduleSpecifier);
						return name ? [name] : [];
					})
				])
			];
			await host.synchronizeProviders(packageNames, signal);
			const contributions = await Promise.all(
				projections.map((projection) => host.diagnostics(projection, signal))
			);
			const diagnostics = Object.freeze(
				contributions.flatMap((contribution) => contribution.diagnostics)
			);
			const statuses = host.status();
			const failed = statuses.filter(
				(status) => status.health === 'failed' || status.health === 'quarantined'
			);
			if (failed.length && (options.config?.diagnostics?.providerFailures ?? 'error') === 'error')
				throw new Error(
					`Language validation failed: ${failed
						.map((provider) => `${provider.id}: ${provider.message ?? 'provider failure'}`)
						.join('; ')}`
				);
			const errors = diagnostics.filter((value) => value.diagnostic.severity === 'error');
			if (errors.length) throw new ExactLanguageValidationError(errors);
			return Object.freeze({ diagnostics, statuses });
		},
		status: () => host.status(),
		dispose: () => host.dispose()
	});
}

/** Returns the installable package portion of one bare module specifier. */
function packageName(specifier: string): string | undefined {
	if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:'))
		return undefined;
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Shared compiler/bundler validation-session surface. */
export interface ExactLanguageValidationSession {
	validate(
		projections: readonly ExactLanguageProjectionV1[],
		signal?: AbortSignal
	): Promise<ExactLanguageValidationResult>;
	status(): readonly ExactLanguageProviderStatus[];
	dispose(): Promise<void>;
}
