import type { AnalyzedMessageDescriptorV1, IntlClientRequirement } from '@exactjs/intl';

/** Configuration for one source-local intl analysis pass. */
export interface AnalyzeIntlSourceOptions {
	filename: string;
	owner: string;
	sourceLocale: string;
	ownerComponentId?: string;
	/** Optional bundler-owned module that receives hoisted runtime descriptors. */
	descriptorModuleId?: string;
	generation?: number;
}

/** One source construct deliberately left for a later analyzer capability. */
export interface IntlAnalysisDiagnostic {
	readonly file: string;
	readonly start: number;
	readonly length: number;
	readonly message: string;
}

/** Instrumented source and the protocol descriptors discovered within it. */
export interface IntlSourceAnalysis {
	readonly code: string;
	readonly descriptors: readonly AnalyzedMessageDescriptorV1[];
	/** Compiler component-fact ordinal that owns each descriptor, or -1 outside a component. */
	readonly descriptorOwnerOrdinals: readonly number[];
	readonly diagnostics: readonly IntlAnalysisDiagnostic[];
	/** Conservative platform features required by supported analyzed expressions in this module. */
	readonly clientRequirements: readonly IntlClientRequirement[];
	readonly companions?: readonly IntlDescriptorCompanion[];
}

/** One component-owned generated descriptor module and its source descriptor indexes. */
export interface IntlDescriptorCompanion {
	readonly id: string;
	readonly code: string;
	readonly generation: number;
	readonly descriptorIndexes: readonly number[];
}
