import {
	NativeCompilerProcess,
	resolveNativeCompilerExecutable,
	type NativeCompilerProcessOptions
} from '@exactjs/compiler';
import type {
	IntlBindingDescriptorV1,
	IntlClientRequirement,
	IntlPatternV1,
	IntlPropertyName
} from '@exactjs/intl';
import path from 'node:path';
import type { AnalyzeIntlSourceOptions, IntlSourceAnalysis } from './analysis-contracts.js';
import { instrumentNativeIntlAnalysis } from './instrumentation.js';
import { sourceLocaleProfile } from './source-locale-profile.js';

const nativeIntlNamespace = '@exactjs/intl/analyze-v1';

/** One source span selected by the native analyzer for portable instrumentation. */
export interface NativeIntlSpan {
	readonly start: number;
	readonly length: number;
}

/** Native semantic descriptor before browser-safe canonicalization and key generation. */
export interface NativeIntlDescriptor {
	readonly protocol: 1;
	readonly owner: string;
	readonly ownerComponentId: string;
	readonly occurrenceId: string;
	readonly sourceLocale: string;
	readonly target: Readonly<{ kind: 'content' } | { kind: 'property'; name: IntlPropertyName }>;
	readonly bindings: readonly IntlBindingDescriptorV1[];
	readonly source: IntlPatternV1;
	readonly capabilities: readonly string[];
	readonly name?: string;
	readonly sourceRange: Readonly<{ file: string; start: number; length: number }>;
}

/** Source edit inputs paired with one native descriptor. */
export interface NativeIntlRegion {
	readonly descriptorIndex: number;
	readonly activationName: string;
	readonly explicit?: boolean;
	readonly element: NativeIntlSpan;
	readonly attribute: NativeIntlSpan;
	/** All analyzer-consumed attributes owned by this message scope. */
	readonly attributes: readonly NativeIntlSpan[];
	readonly content: NativeIntlSpan;
	readonly values: readonly NativeIntlSpan[];
	readonly structures: readonly Readonly<{
		element: NativeIntlSpan;
		content: NativeIntlSpan;
		/** Analyzer metadata removed from the retained structural factory. */
		attributes?: readonly NativeIntlSpan[];
		opaque?: boolean;
	}>[];
	readonly evidence: readonly Readonly<NativeIntlSpan & { kind: string; detail: string }>[];
}

/** Data-only result returned by the isolated native intl operation. */
export interface NativeIntlAnalysis {
	readonly protocol: 1;
	readonly descriptors: readonly NativeIntlDescriptor[];
	readonly descriptorOwnerOrdinals: readonly number[];
	readonly regions: readonly NativeIntlRegion[];
	readonly untranslated: readonly NativeIntlSpan[];
	readonly diagnostics: readonly Readonly<{
		file: string;
		start: number;
		length: number;
		message: string;
	}>[];
	readonly clientRequirements: readonly IntlClientRequirement[];
}

/** Owns one persistent TypeScript-Go frontend session for intl source analysis. */
export class NativeIntlAnalyzer {
	readonly #process: NativeCompilerProcess;

	constructor(options?: NativeCompilerProcessOptions) {
		this.#process = new NativeCompilerProcess(
			options ?? { executable: resolveNativeCompilerExecutable() }
		);
	}

	/** Analyzes one source module without invoking the standard compiler pass. */
	analyze(
		source: string,
		options: Readonly<{ filename: string; owner: string; sourceLocale: string }>
	): NativeIntlAnalysis {
		const localeProfile = sourceLocaleProfile(options.sourceLocale);
		const response = this.#process.request({
			kind: 'extension',
			id: options.filename,
			source,
			root: path.dirname(options.filename),
			extension: {
				namespace: nativeIntlNamespace,
				payload: {
					owner: options.owner,
					sourceLocale: options.sourceLocale,
					...localeProfile
				}
			}
		});
		return normalizeNativeIntlAnalysis(source, validateNativeIntlAnalysis(response.extension));
	}

	/** Analyzes and instruments one source module using only native semantic facts and source spans. */
	analyzeSource(source: string, options: AnalyzeIntlSourceOptions): IntlSourceAnalysis {
		return instrumentNativeIntlAnalysis(source, options, this.analyze(source, options));
	}

	/** Releases the worker and native subprocess owned by this analyzer. */
	dispose(): void {
		this.#process.dispose();
	}
}

function normalizeNativeIntlAnalysis(
	source: string,
	analysis: NativeIntlAnalysis
): NativeIntlAnalysis {
	const offsets = utf8ToUtf16Offsets(source);
	const span = (value: NativeIntlSpan): NativeIntlSpan => {
		const start = Math.max(0, Math.min(offsets.length - 1, value.start));
		const end = Math.max(start, Math.min(offsets.length - 1, value.start + value.length));
		return { start: offsets[start]!, length: offsets[end]! - offsets[start]! };
	};
	return {
		...analysis,
		descriptors: analysis.descriptors.map((descriptor) => ({
			...descriptor,
			sourceRange: { ...descriptor.sourceRange, ...span(descriptor.sourceRange) }
		})),
		regions: analysis.regions.map((region) => ({
			...region,
			element: span(region.element),
			attribute: span(region.attribute),
			attributes: region.attributes.map(span),
			content: span(region.content),
			values: region.values.map(span),
			evidence: region.evidence.map((item) => ({ ...item, ...span(item) })),
			structures: region.structures.map((structure) => ({
				...structure,
				element: span(structure.element),
				content: span(structure.content),
				...(structure.attributes ? { attributes: structure.attributes.map(span) } : {})
			}))
		})),
		untranslated: analysis.untranslated.map(span),
		diagnostics: analysis.diagnostics.map((diagnostic) => ({
			...diagnostic,
			...span(diagnostic)
		}))
	};
}

function utf8ToUtf16Offsets(source: string): readonly number[] {
	const offsets: number[] = [0];
	let byteOffset = 0;
	let utf16Offset = 0;
	for (const character of source) {
		const codePoint = character.codePointAt(0)!;
		const byteLength = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
		for (let byte = 1; byte <= byteLength; byte++)
			offsets[byteOffset + byte] =
				byte === byteLength ? utf16Offset + character.length : utf16Offset;
		byteOffset += byteLength;
		utf16Offset += character.length;
	}
	return offsets;
}

function validateNativeIntlAnalysis(value: unknown): NativeIntlAnalysis {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Native intl analyzer returned an invalid response');
	const candidate = value as Partial<NativeIntlAnalysis>;
	if (
		candidate.protocol !== 1 ||
		!Array.isArray(candidate.descriptors) ||
		!Array.isArray(candidate.descriptorOwnerOrdinals) ||
		!Array.isArray(candidate.regions) ||
		!Array.isArray(candidate.untranslated) ||
		!Array.isArray(candidate.diagnostics) ||
		!Array.isArray(candidate.clientRequirements)
	)
		throw new Error('Native intl analyzer returned an invalid response');
	return value as NativeIntlAnalysis;
}
