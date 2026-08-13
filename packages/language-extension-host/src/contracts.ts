import type {
	ExactLanguageAnalyzerCapability,
	ExactLanguageCodeActionV1,
	ExactLanguageCompletionV1,
	ExactLanguageDiagnosticV1,
	ExactLanguageHoverV1,
	ExactLanguageInlayHintV1,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import type { ExactDeclarativeLanguageContributionV1 } from '@exactjs/language-extension-api';

/** One discovered physical package language provider. */
export interface ExactLanguageProviderDescriptor {
	readonly key: string;
	readonly id: string;
	readonly version: string;
	readonly packageRoot: string;
	readonly manifestPath: string;
	readonly integrity?: string;
	readonly entry?: string;
	readonly declarative?: Readonly<{
		filename: string;
		contribution: ExactDeclarativeLanguageContributionV1;
	}>;
	readonly dataFiles: readonly string[];
	readonly capabilities: readonly ExactLanguageAnalyzerCapability[];
	readonly projection: readonly string[];
	readonly trust: 'declarative' | 'root' | 'allow' | 'scope' | 'all';
}

/** Provider-owned diagnostic decorated with stable host provenance. */
export type ExactHostedLanguageDiagnostic = Readonly<{
	provider: string;
	providerVersion: string;
	generation: number;
	diagnostic: ExactLanguageDiagnosticV1;
}>;

/** Health and policy state reported to editor clients. */
export interface ExactLanguageProviderStatus {
	readonly id: string;
	readonly version: string;
	readonly trust: ExactLanguageProviderDescriptor['trust'];
	readonly capabilities: readonly ExactLanguageAnalyzerCapability[];
	readonly packageRoot: string;
	readonly manifestPath: string;
	readonly integrity?: string;
	readonly entry?: string;
	readonly ignoredRoles: readonly string[];
	readonly health: 'idle' | 'ready' | 'failed' | 'quarantined';
	readonly generation: number;
	readonly lastDurationMs?: number;
	readonly message?: string;
}

/** Results returned from one synchronized language-provider generation. */
export interface ExactLanguageDocumentContribution {
	readonly diagnostics: readonly ExactHostedLanguageDiagnostic[];
	readonly statuses: readonly ExactLanguageProviderStatus[];
}

/** Development-time host consumed by the LSP and compilation validation. */
export interface ExactLanguageExtensionHost {
	synchronizeProviders(packageNames: readonly string[], signal?: AbortSignal): Promise<void>;
	diagnostics(
		projection: ExactLanguageProjectionV1,
		signal?: AbortSignal
	): Promise<ExactLanguageDocumentContribution>;
	complete(
		projection: ExactLanguageProjectionV1,
		position: number,
		trigger?: string,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCompletionV1 }>[]>;
	hover(
		projection: ExactLanguageProjectionV1,
		position: number,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageHoverV1 }>[]>;
	inlayHints(
		projection: ExactLanguageProjectionV1,
		range: Readonly<{ start: number; end: number }>,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageInlayHintV1 }>[]>;
	codeActions(
		projection: ExactLanguageProjectionV1,
		range: Readonly<{ start: number; end: number }>,
		diagnostics: readonly string[],
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCodeActionV1 }>[]>;
	status(): readonly ExactLanguageProviderStatus[];
	dispose(): Promise<void>;
}
