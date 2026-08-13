import type { ExactLanguageDiagnosticV1 } from '@exactjs/language-extension-api';

/** Source span reported by the build-only native intl analyzer. */
export type IntlLanguageSpan = Readonly<{ start: number; length: number }>;

/** Runtime-ready message descriptor exposed to language assistance. */
export type IntlLanguageDescriptor = Readonly<{
	key: string;
	contract: string;
	name?: string;
	sourceLocale: string;
	target: Readonly<{ kind: 'content' } | { kind: 'property'; name: string }>;
	bindings: readonly Readonly<Record<string, unknown>>[];
	source: readonly Readonly<Record<string, unknown>>[];
	capabilities: readonly string[];
}>;

/** One immutable native analysis generation used by all intl language roles. */
export type IntlNativeLanguageAnalysis = Readonly<{
	descriptors: readonly IntlLanguageDescriptor[];
	regions: readonly Readonly<{
		descriptorIndex: number;
		element: IntlLanguageSpan;
		attribute: IntlLanguageSpan;
		evidence: readonly Readonly<IntlLanguageSpan & { kind: string; detail: string }>[];
	}>[];
	untranslated: readonly IntlLanguageSpan[];
	diagnostics: readonly Readonly<{ start: number; length: number; message: string }>[];
}>;

/** Locale coverage collected from configured runtime or XLIFF catalogs. */
export type IntlCatalogCoverage = ReadonlyMap<string, ReadonlySet<string>>;

/** One catalog hygiene finding projected back onto a matching source message. */
export type IntlCatalogIssue = Readonly<{ code: string; summary: string; key?: string }>;

/** Catalog facts shared by diagnostics, hover, and inlay hints. */
export type IntlCatalogInventory = Readonly<{
	coverage: IntlCatalogCoverage;
	issues: readonly IntlCatalogIssue[];
}>;

/** Completion entry before it is projected into the generic protocol. */
export type IntlCompletionValue = Readonly<{ label: string; detail: string }>;

/** Locale-consistency diagnostics owned by the intl provider. */
export type IntlLocaleDiagnostic = ExactLanguageDiagnosticV1;
