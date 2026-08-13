import type {
	AnalyzedMessageDescriptorV1,
	IntlClientRequirement,
	IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { validateIntlCatalog } from '@exactjs/intl/internal';
import { NativeIntlAnalyzer, type IntlSourceAnalysis } from '@exactjs/intl-analyzer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadExactIntlCatalogFiles } from './catalog-files.js';
import { importXliff21Catalog } from './xliff-interchange.js';
import {
	exactIntlDescriptorModuleId,
	relinkExactIntlDescriptorModule,
	resolvedExactIntlDescriptorModule,
	resolveExactIntlDescriptorModule,
	type ExactIntlDescriptorModule
} from './descriptor-modules.js';
import type { IntlPackagePublication } from './package-publication.js';
import { discoverIntlPackagePublications } from './package-discovery.js';
import {
	createIntlClientCapabilityBootstrap,
	type IntlClientCapabilityProvider
} from './client-capabilities.js';
import {
	boundedOwner,
	canonicalBuildLocale,
	emptyIntlAnalysis,
	objectRecord,
	runtimeDescriptor
} from './coordinator-support.js';

/** Host-neutral inputs used by every bundler's intl coordinator. */
export interface IntlBuildCoordinatorOptions {
	readonly applicationRoot?: string;
	readonly configuration?: IntlBuildConfiguration;
	readonly target?: 'client' | 'server';
}

/** Bundler-neutral internationalization build configuration. */
export interface IntlBuildConfiguration {
	/** Authored-message owner; defaults to the application package name. */
	readonly owner?: string;
	/** Authored source locale; defaults to application package intl metadata. */
	readonly sourceLocale?: string;
	/** Development target locale; defaults to the resolved application source locale. */
	readonly developmentLocale?: string;
	/** Target locales whose dependency catalogs should be selected during this build. */
	readonly locales?: readonly string[];
	/** Generator-owned native, bundled-module, or pinned-CDN capability policies. */
	readonly clientCapabilityProviders?: Readonly<
		Partial<Record<IntlClientRequirement, IntlClientCapabilityProvider>>
	>;
	readonly catalogs?: readonly unknown[];
	readonly catalogFiles?: readonly string[];
	readonly onDescriptors?: (
		descriptors: readonly AnalyzedMessageDescriptorV1[],
		moduleId: string
	) => void;
	readonly onClientRequirements?: (
		requirements: readonly IntlClientRequirement[],
		moduleId: string
	) => void;
}

/** Owns shared mutable intl catalogs, descriptor companions, and generation fencing. */
export class IntlBuildCoordinator {
	readonly modules = new Map<string, ExactIntlDescriptorModule>();
	readonly descriptors = new Map<string, readonly IntlRuntimeDescriptorV1[]>();
	#catalogFiles: readonly string[] = [];
	#packageFiles: readonly string[] = [];
	#catalogs: readonly unknown[];
	#configuredCatalogs: readonly unknown[] = [];
	#xliffCatalogs: readonly Readonly<{ filename: string; input: string; locale: string }>[] = [];
	#libraryCatalogs: unknown[] = [];
	#packagePublications: IntlPackagePublication[] = [];
	#activePackages = new Set<string>();
	#activePackageModules = new Set<string>();
	#generation = 0;
	#analyzer: NativeIntlAnalyzer | undefined;
	#owner: string | undefined;
	#sourceLocale: string | undefined;
	#developmentLocale: string | undefined;

	constructor(private readonly options: IntlBuildCoordinatorOptions) {
		this.#configuredCatalogs = options.configuration?.catalogs ?? [];
		this.#catalogs = this.#configuredCatalogs;
		this.#owner = options.configuration?.owner;
		this.#sourceLocale = options.configuration?.sourceLocale;
		this.#developmentLocale = options.configuration?.developmentLocale;
	}

	/** Returns the immutable catalog generation currently supplied to source transforms. */
	get catalogs(): readonly unknown[] {
		return Object.freeze([...this.#libraryCatalogs, ...this.#catalogs]);
	}

	/** Returns resolved catalog paths that Vite must watch. */
	get catalogFiles(): readonly string[] {
		return Object.freeze([...this.#catalogFiles, ...this.#packageFiles]);
	}

	/** Returns the current descriptor/catalog generation fence. */
	get generation(): number {
		return this.#generation;
	}

	/** Opens an empty generation and loads configured catalog inputs. */
	async beginBuild(): Promise<void> {
		this.modules.clear();
		this.descriptors.clear();
		this.#libraryCatalogs = [];
		this.#packagePublications = [];
		this.#activePackages.clear();
		this.#activePackageModules.clear();
		this.#packageFiles = [];
		this.#generation++;
		await this.#resolveApplicationIdentity();
		await this.#reloadCatalogs();
		await this.#discoverPackagePublications();
	}

	/** Analyzes one authored module and retains its component-owned companions for any host adapter. */
	analyzeSource(input: {
		code: string;
		filename: string;
		owner: string;
		sourceLocale: string;
	}): IntlSourceAnalysis {
		this.#analyzer ??= new NativeIntlAnalyzer();
		const analysis = this.#analyzer.analyzeSource(input.code, {
			filename: input.filename,
			owner: input.owner,
			sourceLocale: input.sourceLocale,
			descriptorModuleId: exactIntlDescriptorModuleId(input.filename),
			generation: this.#generation
		});
		if (!analysis.companions) return analysis;
		const descriptors = analysis.descriptors.map(runtimeDescriptor);
		this.descriptors.set(input.filename, descriptors);
		this.#materializeXliffCatalogs();
		for (const companion of analysis.companions) {
			const componentDescriptors = companion.descriptorIndexes.map((index) => descriptors[index]!);
			this.modules.set(
				resolvedExactIntlDescriptorModule(companion.id),
				relinkExactIntlDescriptorModule(
					companion.id,
					companion.code,
					componentDescriptors,
					this.catalogs,
					companion.generation,
					input.filename,
					analysis.clientRequirements,
					this.#clientBootstrap(analysis.clientRequirements)
				)
			);
		}
		this.options.configuration?.onClientRequirements?.(analysis.clientRequirements, input.filename);
		return analysis;
	}

	/** Releases the persistent native analyzer process owned by this coordinator. */
	dispose(): void {
		this.#analyzer?.dispose();
		this.#analyzer = undefined;
	}

	/** Analyzes with the configured owner and locale, or leaves source untouched when disabled. */
	analyzeConfiguredSource(code: string, filename: string): IntlSourceAnalysis | undefined {
		const configuration = this.options.configuration;
		if (!configuration) return undefined;
		const publicationImport = this.#activatePackageForFile(filename, code);
		if (!/\bintl:/u.test(code))
			return publicationImport ? emptyIntlAnalysis(`${publicationImport}\n${code}`) : undefined;
		const publication = this.#publicationForFile(filename);
		const analysis = this.analyzeSource({
			code,
			filename,
			owner: publication?.packageName ?? this.#requiredOwner(),
			sourceLocale: publication?.metadata.sourceLocale ?? this.#requiredSourceLocale()
		});
		return publicationImport
			? Object.freeze({ ...analysis, code: `${publicationImport}\n${analysis.code}` })
			: analysis;
	}

	/** Injects an inert registration import when a transformed file makes a published package reachable. */
	activateReachedSource(code: string, filename: string): IntlSourceAnalysis | undefined {
		const publicationImport = this.#activatePackageForFile(filename, code);
		return publicationImport ? emptyIntlAnalysis(`${publicationImport}\n${code}`) : undefined;
	}

	/** Joins analyzer-local ordinals to compiler identities and publishes extraction facts. */
	linkDescriptorOwners(
		analysis: IntlSourceAnalysis,
		components: readonly Readonly<{ id: string }>[],
		filename: string
	): readonly AnalyzedMessageDescriptorV1[] {
		const linked = Object.freeze(
			analysis.descriptors.map((descriptor, index) => {
				const ordinal = analysis.descriptorOwnerOrdinals[index] ?? -1;
				const component = components[ordinal];
				if (!component)
					throw new Error(
						`Intl message ${descriptor.key} in ${filename} is not owned by a compiler-recognized component`
					);
				return Object.freeze({ ...descriptor, ownerComponentId: component.id });
			})
		);
		this.options.configuration?.onDescriptors?.(linked, filename);
		return linked;
	}

	/** Registers one inert package publication below application catalog authority. */
	registerPackagePublication(publication: IntlPackagePublication): void {
		this.descriptors.set(`package:${publication.packageName}`, publication.descriptors);
		this.#libraryCatalogs.push(...publication.catalogs);
	}

	/** Advances fencing before one source or catalog watch update. */
	advanceGeneration(): void {
		this.#generation++;
	}

	/** Resolves the public generated descriptor request without side effects. */
	resolve(source: string): string | undefined {
		return resolveExactIntlDescriptorModule(source);
	}

	/** Returns one retained generated companion. */
	load(id: string): ExactIntlDescriptorModule | undefined {
		return this.modules.get(id);
	}

	/** Loads a public or host-resolved descriptor request through one shared lookup. */
	loadRequest(source: string): ExactIntlDescriptorModule | undefined {
		return this.modules.get(resolveExactIntlDescriptorModule(source) ?? source);
	}

	/** Validates every configured catalog against the completed descriptor set. */
	validateCatalogs(): void {
		this.#materializeXliffCatalogs();
		const descriptors = [...this.descriptors.values()].flat();
		for (const catalog of this.catalogs) validateIntlCatalog(catalog, descriptors);
		this.#relinkModules();
	}

	/** Lowers deferred XLIFF against every descriptor known at the current analysis frontier. */
	#materializeXliffCatalogs(): void {
		const descriptors = [...this.descriptors.values()].flat();
		this.#catalogs = Object.freeze([
			...this.#configuredCatalogs,
			...this.#xliffCatalogs.map((catalog) => importXliff21Catalog(catalog.input, descriptors))
		]);
	}

	/** Tests whether a watched path belongs to configured catalog data. */
	isCatalogFile(file: string): boolean {
		const candidate = path.resolve(file).toLowerCase();
		return this.#catalogFiles.some((catalog) => catalog.toLowerCase() === candidate);
	}

	/** Removes every component companion owned by one changed source module. */
	invalidateSource(filename: string): void {
		for (const [id, module] of this.modules)
			if (module.filename === filename) this.modules.delete(id);
		this.descriptors.delete(filename);
	}

	/** Reloads and atomically relinks catalogs while preserving the last valid generation on error. */
	async refreshCatalogGeneration(): Promise<void> {
		const previousFiles = this.#catalogFiles;
		const previousCatalogs = this.#catalogs;
		const previousConfiguredCatalogs = this.#configuredCatalogs;
		const previousXliffCatalogs = this.#xliffCatalogs;
		try {
			await this.#reloadCatalogs();
			this.validateCatalogs();
		} catch (error) {
			this.#catalogFiles = previousFiles;
			this.#catalogs = previousCatalogs;
			this.#configuredCatalogs = previousConfiguredCatalogs;
			this.#xliffCatalogs = previousXliffCatalogs;
			throw error;
		}
	}

	/** Loads configured objects and files without publishing partially validated companions. */
	async #reloadCatalogs(): Promise<void> {
		if (!this.options.configuration) return;
		const loaded = await loadExactIntlCatalogFiles(
			path.resolve(this.options.applicationRoot ?? process.cwd()),
			this.options.configuration.catalogFiles
		);
		this.#catalogFiles = loaded.files;
		this.#configuredCatalogs = Object.freeze([
			...(this.options.configuration.catalogs ?? []),
			...loaded.catalogs
		]);
		this.#xliffCatalogs = loaded.xliff;
		this.#catalogs = this.#configuredCatalogs;
	}

	/** Discovers package publications after application catalogs establish the requested locale set. */
	async #discoverPackagePublications(): Promise<void> {
		const configuration = this.options.configuration;
		if (!configuration) return;
		const applicationRoot = path.resolve(this.options.applicationRoot ?? process.cwd());
		const locales = new Set<string>([
			this.#developmentLocale ?? this.#requiredSourceLocale(),
			...(configuration.locales ?? [])
		]);
		for (const catalog of this.#catalogs) {
			if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
				const locale = (catalog as { locale?: unknown }).locale;
				if (typeof locale === 'string') locales.add(locale);
			}
		}
		for (const catalog of this.#xliffCatalogs) locales.add(catalog.locale);
		const publications = await discoverIntlPackagePublications({
			applicationRoot,
			locales: [...locales]
		});
		this.#packagePublications = [...publications];
		for (const publication of publications)
			this.#packageFiles = [...this.#packageFiles, ...publication.files];
		this.#packageFiles = Object.freeze([
			...new Set(this.#packageFiles.map((file) => path.resolve(file)))
		]);
	}

	/** Finds the inert dependency publication that physically owns one reached source file. */
	#publicationForFile(filename: string): IntlPackagePublication | undefined {
		const candidate = path.resolve(filename);
		return this.#packagePublications.find((publication) => {
			const relative = path.relative(publication.packageRoot, candidate);
			return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
		});
	}

	/** Materializes a bounded registration companion for descriptor keys reached by package code. */
	#activatePackageForFile(filename: string, code: string): string | undefined {
		const publication = this.#publicationForFile(filename);
		if (!publication) return undefined;
		const reachableDescriptors = publication.descriptors.filter((descriptor) =>
			code.includes(descriptor.key)
		);
		if (reachableDescriptors.length === 0) return undefined;
		const moduleIdentity = `package:${publication.packageName}:${path.resolve(filename)}`;
		const moduleId = exactIntlDescriptorModuleId(moduleIdentity);
		if (!this.#activePackages.has(publication.packageName)) {
			this.#activePackages.add(publication.packageName);
			this.registerPackagePublication(publication);
		}
		if (!this.#activePackageModules.has(moduleIdentity)) {
			this.#activePackageModules.add(moduleIdentity);
			const declarations = publication.descriptors
				.filter((descriptor) => reachableDescriptors.includes(descriptor))
				.map(
					(descriptor, index) =>
						`export const __exactIntlDescriptor${index} = Object.freeze(${JSON.stringify(descriptor)});`
				)
				.join('\n');
			const companionCode = `${declarations}\nexport const descriptors = Object.freeze([${reachableDescriptors.map((_descriptor, index) => `__exactIntlDescriptor${index}`).join(',')}]);\nexport const generation = ${this.#generation};\n`;
			this.modules.set(
				resolvedExactIntlDescriptorModule(moduleId),
				relinkExactIntlDescriptorModule(
					moduleId,
					companionCode,
					reachableDescriptors,
					this.catalogs,
					this.#generation,
					publication.packageRoot
				)
			);
		}
		return `import ${JSON.stringify(moduleId)};`;
	}

	/** Plans all companion replacements before mutating the retained module map. */
	#relinkModules(): void {
		const replacements = [...this.modules].map(
			([id, module]) =>
				[
					id,
					relinkExactIntlDescriptorModule(
						id.startsWith('\0') ? id.slice(1) : id,
						module.companionCode,
						module.descriptors,
						this.catalogs,
						this.#generation,
						module.filename,
						module.clientRequirements,
						this.#clientBootstrap(module.clientRequirements)
					)
				] as const
		);
		for (const [id, module] of replacements) this.modules.set(id, module);
	}

	/** Selects target-aware provider bootstrap code for one companion's finite requirements. */
	#clientBootstrap(requirements: readonly IntlClientRequirement[]): string {
		return createIntlClientCapabilityBootstrap(
			requirements,
			this.options.configuration?.clientCapabilityProviders,
			this.options.target ?? 'client'
		);
	}

	/** Resolves explicit or inert entry-package ownership and development-locale defaults. */
	async #resolveApplicationIdentity(): Promise<void> {
		if (!this.options.configuration) return;
		const applicationRoot = path.resolve(this.options.applicationRoot ?? process.cwd());
		if (!this.#owner || !this.#sourceLocale) {
			let manifest: Record<string, unknown>;
			try {
				manifest = JSON.parse(
					await readFile(path.join(applicationRoot, 'package.json'), 'utf8')
				) as Record<string, unknown>;
			} catch (error) {
				throw new Error(
					`Intl configuration requires owner and sourceLocale when application package metadata cannot be read: ${error instanceof Error ? error.message : String(error)}`
				);
			}
			const exact = objectRecord(manifest.exact);
			const metadata = objectRecord(exact?.internationalization);
			this.#owner ??= boundedOwner(manifest.name);
			this.#sourceLocale ??= canonicalBuildLocale(metadata?.sourceLocale, 'sourceLocale');
		}
		this.#owner = boundedOwner(this.#owner);
		this.#sourceLocale = canonicalBuildLocale(this.#sourceLocale, 'sourceLocale');
		this.#developmentLocale = canonicalBuildLocale(
			this.#developmentLocale ?? this.#sourceLocale,
			'developmentLocale'
		);
	}

	/** Returns the resolved application owner after build initialization. */
	#requiredOwner(): string {
		if (!this.#owner) throw new Error('Intl build has not resolved its application owner');
		return this.#owner;
	}

	/** Returns the resolved application source locale after build initialization. */
	#requiredSourceLocale(): string {
		if (!this.#sourceLocale) throw new Error('Intl build has not resolved its source locale');
		return this.#sourceLocale;
	}
}
