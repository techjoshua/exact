import type {
	ExactLanguageAnalyzer,
	ExactLanguageAnalyzerContext,
	ExactLanguageAnalyzerFactory,
	ExactLanguageCompletionRequestV1,
	ExactLanguageCompletionV1,
	ExactLanguageDiagnosticV1,
	ExactLanguageDiagnosticsRequestV1,
	ExactLanguageHoverRequestV1,
	ExactLanguageHoverV1,
	ExactLanguageInlayHintRequestV1,
	ExactLanguageInlayHintV1,
	ExactLanguageJsonValue
} from '@exactjs/language-extension-api';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
	IntlCatalogInventory,
	IntlCatalogIssue,
	IntlLanguageDescriptor,
	IntlNativeLanguageAnalysis
} from './language/analysis-contracts.js';
import {
	canonicalIntlLocale,
	describeIntlCoverage,
	describeIntlInference,
	describeIntlInferenceDetails,
	intlCompletionValues,
	intlDescriptorRequiresTranslation,
	intlLiteralLocaleDiagnostics
} from './language/assistance.js';
import {
	inspectIntlJsonCatalog,
	inspectIntlXliffCatalog,
	intlCatalogErrorMessage,
	type IntlLanguageXmlElement
} from './language/catalogs.js';
import type { ExactIntlLanguageConfiguration } from './language/config.js';
import { intlLanguageRange, intlLanguageRangesOverlap } from './language/ranges.js';
import { intlUntranslatedDiagnostics } from './language/untranslated-diagnostics.js';
export type { ExactIntlLanguageConfiguration } from './language/config.js';
import { intl } from '@exactjs/core';

type NativeAnalyzer = Readonly<{
	analyze(
		source: string,
		options: Readonly<{ filename: string; owner: string; sourceLocale: string }>
	): NativeAnalysis;
	dispose(): void;
}>;

type NativeAnalysis = IntlNativeLanguageAnalysis;
type NativeDescriptor = IntlLanguageDescriptor;
type CatalogIssue = IntlCatalogIssue;
type CatalogInventory = IntlCatalogInventory;

/** Creates the Node-only intl analyzer used by the generic eXact language-extension host. */
export const createExactLanguageAnalyzer: ExactLanguageAnalyzerFactory = async (context) =>
	new IntlLanguageAnalyzer(context);

class IntlLanguageAnalyzer implements ExactLanguageAnalyzer {
	private readonly config: ExactIntlLanguageConfiguration;
	private native: NativeAnalyzer | undefined;
	private finalize: ((descriptor: unknown) => NativeDescriptor) | undefined;
	private parseXliff: ((input: string) => IntlLanguageXmlElement) | undefined;

	constructor(private readonly context: ExactLanguageAnalyzerContext) {
		this.config = languageConfiguration(context.configuration);
	}

	async diagnostics(
		request: ExactLanguageDiagnosticsRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageDiagnosticV1[]> {
		const native = await this.analyze(request, signal);
		const inventory = await this.catalogInventory(native.descriptors, signal);
		const diagnostics: ExactLanguageDiagnosticV1[] = native.diagnostics.map((diagnostic) => ({
			code: 'invalid-message',
			severity: 'error',
			range: { start: diagnostic.start, end: diagnostic.start + diagnostic.length },
			summary: diagnostic.message,
			explanation:
				'The intl build analyzer cannot produce a stable message descriptor for this source.'
		}));
		diagnostics.push(...intlUntranslatedDiagnostics(native.untranslated));
		for (const locale of this.config.requiredLocales ?? []) {
			for (const region of native.regions) {
				const descriptor = native.descriptors[region.descriptorIndex];
				if (
					!descriptor ||
					!intlDescriptorRequiresTranslation(descriptor) ||
					inventory.coverage.get(descriptor.key)?.has(locale)
				)
					continue;
				diagnostics.push({
					code: 'missing-translation',
					severity: 'warning',
					range: intlLanguageRange(region.attribute),
					summary: `This message has no ${locale} translation.`,
					explanation: `Message ${descriptor.key} is required in ${locale}, but no configured catalog contains it.`
				});
			}
		}
		if (this.config.catalogHygiene !== false) {
			const fallbackRange = native.regions[0]
				? intlLanguageRange(native.regions[0].attribute)
				: { start: 0, end: 0 };
			for (const issue of inventory.issues) {
				const region = issue.key
					? native.regions.find(
							(candidate) => native.descriptors[candidate.descriptorIndex]?.key === issue.key
						)
					: undefined;
				diagnostics.push({
					code: issue.code,
					severity: issue.code === 'invalid-catalog' ? 'error' : 'warning',
					range: region ? intlLanguageRange(region.attribute) : fallbackRange,
					summary: issue.summary
				});
			}
		}
		if (this.config.localeConsistency !== false) {
			const source = request.projection.document.text ?? '';
			diagnostics.push(
				...intlLiteralLocaleDiagnostics(
					source,
					native,
					native.descriptors[0]?.sourceLocale ?? 'en-US'
				)
			);
		}
		return Object.freeze(diagnostics);
	}

	async complete(
		request: ExactLanguageCompletionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCompletionV1[]> {
		throwIfAborted(signal);
		const source = request.projection.document.text ?? '';
		const before = source.slice(Math.max(0, request.position - 160), request.position);
		const activation = /intl:([\w-]+)\s*=\s*["']([^"']*)$/u.exec(before);
		if (!activation) return [];
		const attribute = activation[1]!;
		const valueStart = Math.max(before.lastIndexOf('"'), before.lastIndexOf("'")) + 1;
		const start = request.position - before.length + valueStart;
		const prefix = source.slice(start, request.position);
		const values = intlCompletionValues(attribute, before);
		return Object.freeze(
			values
				.filter((value) => value.label.startsWith(prefix))
				.slice(0, 100)
				.map((value) => ({
					label: value.label,
					detail: value.detail,
					replace: { start, end: request.position }
				}))
		);
	}

	async hover(
		request: ExactLanguageHoverRequestV1,
		signal: AbortSignal
	): Promise<ExactLanguageHoverV1 | undefined> {
		const native = await this.analyze(request, signal);
		const region = native.regions.find(
			(candidate) =>
				candidate.element.start <= request.position &&
				request.position <= candidate.element.start + candidate.element.length
		);
		if (!region) return undefined;
		const descriptor = native.descriptors[region.descriptorIndex];
		if (!descriptor) return undefined;
		const inventory = await this.catalogInventory(native.descriptors, signal);
		const locales = [...(inventory.coverage.get(descriptor.key) ?? [])].sort();
		const missing = (this.config.requiredLocales ?? []).filter(
			(locale) => !locales.includes(locale)
		);
		const inference = describeIntlInference(descriptor);
		const details = describeIntlInferenceDetails(descriptor);
		const translatable = intlDescriptorRequiresTranslation(descriptor);
		return Object.freeze({
			range: intlLanguageRange(region.element),
			markdown: [
				'### Internationalized message',
				`**Source locale:** ${descriptor.sourceLocale}`,
				...(descriptor.name ? [`**Message name:** \`${descriptor.name}\``] : []),
				`**${translatable ? 'Message' : 'Formatter descriptor'} key:** \`${descriptor.key}\``,
				`**Target:** ${descriptor.target.kind === 'content' ? 'element content' : `\`${descriptor.target.name}\` property`}`,
				`**Inferred behavior:** ${inference.length ? inference.join(', ') : 'plain message interpolation'}`,
				...details.map((detail) => `- ${detail}`),
				`**Translated locales:** ${translatable ? (locales.length ? locales.join(', ') : 'none found in configured catalogs') : 'not applicable (formatter-only)'}`,
				...(missing.length && translatable
					? [`**Missing required locales:** ${missing.join(', ')}`]
					: [])
			].join('\n\n')
		});
	}

	async inlayHints(
		request: ExactLanguageInlayHintRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageInlayHintV1[]> {
		if (this.config.showInlayHints === false) return [];
		const native = await this.analyze(request, signal);
		const coverage = (await this.catalogInventory(native.descriptors, signal)).coverage;
		return Object.freeze(
			native.regions
				.filter((region) =>
					intlLanguageRangesOverlap(intlLanguageRange(region.attribute), request.range)
				)
				.map((region) => {
					const descriptor = native.descriptors[region.descriptorIndex]!;
					const locales = [...(coverage.get(descriptor.key) ?? [])].sort();
					const missing = (this.config.requiredLocales ?? []).filter(
						(locale) => !locales.includes(locale)
					);
					const coveragePresentation = describeIntlCoverage(descriptor, locales, missing);
					return {
						position: region.attribute.start + region.attribute.length,
						label: ` ⇒ ${describeIntlInference(descriptor).join(' + ') || 'message'} · ${coveragePresentation.label}`,
						tooltip: coveragePresentation.tooltip,
						paddingLeft: true,
						evidence: region.evidence.map((item) => ({
							range: intlLanguageRange(item),
							kind: item.kind,
							explanation: item.detail
						}))
					};
				})
		);
	}

	async dispose(): Promise<void> {
		this.native?.dispose();
		this.native = undefined;
	}

	private async analyze(
		request: Readonly<{ projection: ExactLanguageDiagnosticsRequestV1['projection'] }>,
		signal: AbortSignal
	): Promise<NativeAnalysis> {
		throwIfAborted(signal);
		const source = request.projection.document.text;
		if (source === undefined)
			throw new Error('The intl analyzer requires the sourceText projection');
		const analyzer = await this.nativeAnalyzer();
		const raw = analyzer.analyze(source, {
			filename: request.projection.document.path,
			owner: await workspaceOwner(this.context.workspace.root),
			sourceLocale: await sourceLocale(this.context.workspace.root, this.config)
		});
		throwIfAborted(signal);
		return Object.freeze({
			...raw,
			descriptors: Object.freeze(raw.descriptors.map((descriptor) => this.finalize!(descriptor)))
		});
	}

	private async nativeAnalyzer(): Promise<NativeAnalyzer> {
		if (this.native) return this.native;
		const workspaceRequire = createRequire(
			path.join(this.context.workspace.root, '__exact_intl_language__.cjs')
		);
		let entry: string;
		try {
			entry = workspaceRequire.resolve('@exactjs/intl-analyzer');
		} catch (workspaceError) {
			try {
				entry = createRequire(import.meta.url).resolve('@exactjs/intl-analyzer');
			} catch (packageError) {
				throw new Error(
					'@exactjs/intl language assistance requires @exactjs/intl-analyzer in the application build toolchain',
					{ cause: packageError instanceof Error ? packageError : workspaceError }
				);
			}
		}
		const imported = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
		const Constructor = imported.NativeIntlAnalyzer as (new () => NativeAnalyzer) | undefined;
		const finalize = imported.finalizeNativeIntlDescriptor as
			| ((descriptor: unknown) => NativeDescriptor)
			| undefined;
		if (typeof Constructor !== 'function')
			throw new Error('@exactjs/intl-analyzer does not export NativeIntlAnalyzer');
		if (typeof finalize !== 'function')
			throw new Error('@exactjs/intl-analyzer does not export finalizeNativeIntlDescriptor');
		const parseXliff = imported.parseXml as ((input: string) => IntlLanguageXmlElement) | undefined;
		if (typeof parseXliff !== 'function')
			throw new Error('@exactjs/intl-analyzer does not export parseXml');
		this.native = new Constructor();
		this.finalize = finalize;
		this.parseXliff = parseXliff;
		return this.native;
	}

	private async catalogInventory(
		descriptors: readonly NativeDescriptor[],
		signal: AbortSignal
	): Promise<CatalogInventory> {
		const configured = this.config.catalogFiles?.map((file) =>
			path.resolve(this.context.workspace.root, file)
		);
		const candidates = configured?.length
			? configured
			: [path.join(this.context.workspace.root, '.exact', 'intl-catalogs.json')];
		const coverage = new Map<string, Set<string>>();
		const issues: CatalogIssue[] = [];
		const sourceKeys = new Set<string>();
		for (const filename of candidates) {
			throwIfAborted(signal);
			try {
				await access(filename);
				const source = await readFile(filename, 'utf8');
				if (/\.xlf|\.xliff$/iu.test(filename))
					inspectIntlXliffCatalog(
						this.parseXliff!(source),
						descriptors,
						coverage,
						sourceKeys,
						issues
					);
				else inspectIntlJsonCatalog(JSON.parse(source), coverage, issues);
			} catch (error) {
				if (configured?.includes(filename))
					issues.push({
						code: 'invalid-catalog',
						summary: `Unable to read configured intl catalog ${filename}: ${intlCatalogErrorMessage(error)}`
					});
			}
		}
		if (sourceKeys.size)
			for (const key of coverage.keys())
				if (!sourceKeys.has(key))
					issues.push({
						code: 'obsolete-translation',
						key,
						summary: `Catalog unit ${key} is absent from the generated source-locale catalog.`
					});
		return Object.freeze({ coverage, issues: Object.freeze(issues) });
	}
}

function languageConfiguration(
	value: ExactLanguageJsonValue | undefined
): ExactIntlLanguageConfiguration {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
	const record = value as Record<string, ExactLanguageJsonValue>;
	const catalogFiles = stringArray(record.catalogFiles);
	const requiredLocales = stringArray(record.requiredLocales)?.map(canonicalIntlLocale);
	return Object.freeze({
		...(typeof record.sourceLocale === 'string' ? { sourceLocale: record.sourceLocale } : {}),
		...(catalogFiles ? { catalogFiles } : {}),
		...(requiredLocales ? { requiredLocales } : {}),
		...(typeof record.showInlayHints === 'boolean'
			? { showInlayHints: record.showInlayHints }
			: {}),
		...(typeof record.catalogHygiene === 'boolean'
			? { catalogHygiene: record.catalogHygiene }
			: {}),
		...(typeof record.localeConsistency === 'boolean'
			? { localeConsistency: record.localeConsistency }
			: {})
	});
}

async function sourceLocale(root: string, config: ExactIntlLanguageConfiguration): Promise<string> {
	if (config.sourceLocale)
		return intl.getCanonicalLocales(config.sourceLocale)[0] ?? config.sourceLocale;
	const manifest = await workspaceManifest(root);
	const exact = isRecord(manifest.exact) ? manifest.exact : undefined;
	const internationalization =
		exact && isRecord(exact.internationalization) ? exact.internationalization : undefined;
	return typeof internationalization?.sourceLocale === 'string'
		? (intl.getCanonicalLocales(internationalization.sourceLocale)[0] ??
				internationalization.sourceLocale)
		: 'en-US';
}

async function workspaceOwner(root: string): Promise<string> {
	const manifest = await workspaceManifest(root);
	return typeof manifest.name === 'string' && manifest.name ? manifest.name : path.basename(root);
}

async function workspaceManifest(root: string): Promise<Record<string, unknown>> {
	try {
		return JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as Record<
			string,
			unknown
		>;
	} catch {
		return {};
	}
}

function stringArray(value: ExactLanguageJsonValue | undefined): readonly string[] | undefined {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
		? (value as readonly string[])
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted)
		throw signal.reason instanceof Error
			? signal.reason
			: new Error('Intl language request aborted');
}
