import { batch, reactive, type Reactive } from '@exactjs/reactive';
import { intl } from '@exactjs/core';
import type { IntlCatalogV1, IntlPatternV1, IntlRuntimeDescriptorV1 } from './contracts.js';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';
import { snapshotIntlArtifacts } from './artifacts.js';
import {
	materializeIntlTranslation,
	projectIntlTranslationContract
} from './translation-contract.js';
import type { IntlUnitForDimension } from './unit-definitions.js';
import type { IntlLocaleString } from './cldr-locale-types.js';

type Unit<Dimension extends string> = IntlUnitForDimension<Dimension>;

/** Finite application overrides for semantic unit preferences. */
export interface IntlUnitPreferences {
	readonly 'length/road'?: Unit<'length'>;
	readonly 'length/person-height'?: Unit<'length'> | readonly [Unit<'length'>, Unit<'length'>];
	readonly 'area/floor'?: Unit<'area'>;
	readonly 'area/land'?: Unit<'area'>;
	readonly 'mass/person'?: Unit<'mass'>;
	readonly 'volume/liquid'?: Unit<'volume'>;
	readonly 'speed/road'?: Unit<'speed'>;
	readonly 'pressure/weather'?: Unit<'pressure'>;
	readonly 'energy/electricity'?: Unit<'energy'>;
	readonly 'energy/food'?: Unit<'energy'>;
	readonly 'power/engine'?: Unit<'power'>;
	readonly 'fuel-economy/road'?: Unit<'fuel-economy'>;
	readonly 'digital/storage'?: Unit<'digital'>;
	readonly 'temperature/weather'?: Unit<'temperature'>;
}

/** Mutable locale state observed by message render plans. */
export interface IntlEnvironmentState {
	locale: IntlLocaleString;
	generation: number;
}

/** Options used to create an isolated internationalization environment. */
export interface IntlEnvironmentOptions {
	locale: IntlLocaleString;
	/** Locale used by authored source and fallback expressions. Defaults to `locale`. */
	sourceLocale?: IntlLocaleString;
	/** Application or user destination-unit overrides keyed by canonical quantity/usage. */
	unitPreferences?: IntlUnitPreferences;
	descriptors?: readonly unknown[];
	catalogs?: readonly unknown[];
	/** Catalogs with deterministic library < application < override precedence. */
	catalogLayers?: readonly IntlCatalogLayer[];
	/** Receives each missing target message at most once for one environment. */
	onMissingMessage?: (message: IntlMissingMessage) => void;
}

/** One catalog input and its deterministic merge authority. */
export interface IntlCatalogLayer {
	readonly kind: 'library' | 'application' | 'override';
	readonly catalog: unknown;
}

/** Diagnostic emitted when a requested target locale falls back to its source plan. */
export interface IntlMissingMessage {
	readonly locale: string;
	readonly owner: string;
	readonly key: string;
	readonly sourceLocale: string;
}

/** Runtime locale and validated catalogs owned by one application provider. */
export interface IntlEnvironment {
	readonly state: Reactive<IntlEnvironmentState>;
	readonly sourceLocale: IntlLocaleString;
	readonly unitPreferences: IntlUnitPreferences;
	setLocale(locale: IntlLocaleString): void;
	setUnitPreferences(preferences: IntlUnitPreferences): void;
	/** Returns this environment for the active locale or a catalog-sharing locale scope. */
	forLocale(locale: IntlLocaleString): IntlEnvironment;
	addCatalog(catalog: unknown): void;
	find(owner: string, key: string, descriptor?: IntlRuntimeDescriptorV1): IntlPatternV1 | undefined;
}

/** Creates a locale environment whose updates participate in eXact reactivity. */
export function createIntlEnvironment(options: IntlEnvironmentOptions): IntlEnvironment {
	const generated = snapshotIntlArtifacts();
	const sourceLocale = canonicalLocale(options.sourceLocale ?? options.locale);
	const state = reactive<IntlEnvironmentState>({
		locale: canonicalLocale(options.locale),
		generation: 0
	});
	const catalogs = new Map<string, IntlCatalogV1>();
	const generatedDescriptors = options.descriptors === undefined;
	const generatedCatalogs = options.catalogs === undefined;
	let generatedRevision = generated.revision;
	const descriptors: IntlRuntimeDescriptorV1[] = [];
	const descriptorByMessage = new Map<string, IntlRuntimeDescriptorV1>();
	const descriptorByContract = new Map<string, IntlRuntimeDescriptorV1>();
	const materialized = new WeakMap<object, Map<string, IntlPatternV1>>();
	const reportedMissing = new Set<string>();
	const localeScopes = new Map<string, IntlEnvironment>();
	const manualCatalogs: unknown[] = [];
	const layerPriority = { library: 1, application: 2, override: 3 } as const;
	const catalogLayers = [...(options.catalogLayers ?? [])].sort(
		(left, right) => layerPriority[left.kind] - layerPriority[right.kind]
	);
	let unitPreferences = Object.freeze({ ...(options.unitPreferences ?? {}) });
	const replaceDescriptors = (inputs: readonly unknown[]): void => {
		descriptors.length = 0;
		descriptorByMessage.clear();
		descriptorByContract.clear();
		for (const input of inputs) {
			const validated = validateIntlRuntimeDescriptor(input);
			const shared = descriptorByContract.get(validated.contract);
			if (shared && executionFingerprint(shared) !== executionFingerprint(validated))
				throw new Error(
					`Intl execution contract ${validated.contract} has conflicting definitions`
				);
			const descriptor = shared
				? Object.freeze({
						...validated,
						bindings: shared.bindings,
						source: shared.source,
						capabilities: shared.capabilities
					})
				: validated;
			if (!shared) descriptorByContract.set(descriptor.contract, descriptor);
			const identity = messageIdentity(descriptor.owner, descriptor.key);
			const previous = descriptorByMessage.get(identity);
			if (previous && translationFingerprint(previous) !== translationFingerprint(descriptor))
				throw new Error(`Intl translation contract ${identity} disagrees across loaded artifacts`);
			if (!previous) {
				descriptors.push(descriptor);
				descriptorByMessage.set(identity, descriptor);
			}
		}
	};
	const addCatalog = (input: unknown): void => {
		const catalog = validateIntlCatalog(input, descriptors);
		const identity = catalogIdentity(catalog.locale, catalog.owner);
		const previous = catalogs.get(identity);
		catalogs.set(
			identity,
			previous
				? Object.freeze({
						...catalog,
						messages: Object.freeze({ ...previous.messages, ...catalog.messages })
					})
				: catalog
		);
	};
	const replaceCatalogs = (inputs: readonly unknown[]): void => {
		catalogs.clear();
		for (const catalog of inputs) addCatalog(catalog);
		for (const layer of catalogLayers) addCatalog(layer.catalog);
		for (const catalog of manualCatalogs) addCatalog(catalog);
	};
	replaceDescriptors(options.descriptors ?? generated.descriptors);
	replaceCatalogs(options.catalogs ?? generated.catalogs);
	const synchronizeGeneratedArtifacts = (): void => {
		if (!generatedDescriptors && !generatedCatalogs) return;
		const snapshot = snapshotIntlArtifacts();
		if (snapshot.revision === generatedRevision) return;
		if (generatedDescriptors) replaceDescriptors(snapshot.descriptors);
		if (generatedCatalogs) replaceCatalogs(snapshot.catalogs);
		generatedRevision = snapshot.revision;
	};
	const environment: IntlEnvironment = Object.freeze({
		state,
		sourceLocale,
		get unitPreferences() {
			void state.generation;
			return unitPreferences;
		},
		setLocale(locale: IntlLocaleString): void {
			const next = canonicalLocale(locale);
			if (next === state.locale) return;
			batch(() => {
				state.locale = next;
				state.generation++;
			});
		},
		setUnitPreferences(preferences: IntlUnitPreferences): void {
			batch(() => {
				unitPreferences = Object.freeze({ ...preferences });
				state.generation++;
			});
			for (const scope of localeScopes.values()) scope.setUnitPreferences(preferences);
		},
		forLocale(locale: IntlLocaleString): IntlEnvironment {
			const next = canonicalLocale(locale);
			if (next === state.locale) return environment;
			let scoped = localeScopes.get(next);
			if (scoped) return scoped;
			scoped = createIntlEnvironment({
				locale: next,
				sourceLocale,
				descriptors,
				catalogs: [...catalogs.values()],
				unitPreferences,
				onMissingMessage: options.onMissingMessage
			});
			localeScopes.set(next, scoped);
			return scoped;
		},
		addCatalog(input: unknown): void {
			batch(() => {
				manualCatalogs.push(input);
				addCatalog(input);
				state.generation++;
			});
			for (const scope of localeScopes.values()) scope.addCatalog(input);
		},
		find(
			owner: string,
			key: string,
			descriptorInput?: IntlRuntimeDescriptorV1
		): IntlPatternV1 | undefined {
			void state.generation;
			synchronizeGeneratedArtifacts();
			const descriptor = descriptorInput ?? descriptorByMessage.get(messageIdentity(owner, key));
			for (const candidate of localeFallbackChain(state.locale)) {
				const translated = catalogs.get(catalogIdentity(candidate, owner))?.messages[key];
				if (translated && descriptor) {
					let byContract = materialized.get(translated as object);
					if (!byContract) materialized.set(translated as object, (byContract = new Map()));
					const cached = byContract.get(descriptor.contract);
					if (cached) return cached;
					const pattern = materializeIntlTranslation(translated, descriptor);
					byContract.set(descriptor.contract, pattern);
					return pattern;
				}
			}
			if (!descriptor) return undefined;
			const pseudo = pseudoLocaleKind(state.locale);
			if (pseudo) return pseudoPattern(descriptor.source, pseudo);
			if (state.locale !== descriptor.sourceLocale && options.onMissingMessage) {
				const identity = `${state.locale}\u0000${owner}\u0000${key}`;
				if (!reportedMissing.has(identity)) {
					reportedMissing.add(identity);
					options.onMissingMessage({
						locale: state.locale,
						owner,
						key,
						sourceLocale: descriptor.sourceLocale
					});
				}
			}
			return undefined;
		}
	});
	return environment;
}

/** Canonical language and writing direction projected onto a localized intrinsic. */
export interface IntlLocaleMetadata {
	readonly lang: string;
	readonly dir: 'ltr' | 'rtl';
}

/** Resolves document-safe language metadata through native Intl.Locale with a script fallback. */
export function intlLocaleMetadata(locale: IntlLocaleString): IntlLocaleMetadata {
	const parsed = intl.Locale(canonicalLocale(locale));
	const capable = parsed as Intl.Locale & {
		getTextInfo?: () => Readonly<{ direction?: string }>;
		readonly textInfo?: Readonly<{ direction?: string }>;
	};
	const nativeDirection = capable.getTextInfo?.().direction ?? capable.textInfo?.direction;
	const script = parsed.maximize().script;
	const direction =
		nativeDirection === 'rtl' ||
		(!nativeDirection && script !== undefined && rightToLeftScripts.has(script))
			? 'rtl'
			: 'ltr';
	return Object.freeze({ lang: parsed.baseName, dir: direction });
}

/** Creates the zero-configuration locale scope used when no provider is available. */
export function createDefaultIntlEnvironment(locale?: IntlLocaleString): IntlEnvironment {
	const generated = snapshotIntlArtifacts();
	const sourceLocales = [
		...new Set(generated.descriptors.map((descriptor) => descriptor.sourceLocale))
	];
	const sourceLocale =
		sourceLocales.length === 1
			? canonicalLocale(sourceLocales[0]!)
			: canonicalLocale(locale ?? 'en');
	return createIntlEnvironment({ locale: locale ?? sourceLocale, sourceLocale });
}

const rightToLeftScripts = new Set([
	'Adlm',
	'Arab',
	'Hebr',
	'Mand',
	'Mend',
	'Nkoo',
	'Rohg',
	'Samr',
	'Syrc',
	'Thaa'
]);

/** Validates and narrows a dynamic string to a canonical locale identifier. */
export function defineIntlLocale(locale: string): IntlLocaleString {
	return canonicalLocale(locale);
}

function canonicalLocale(locale: string): IntlLocaleString {
	let canonical: string | undefined;
	try {
		[canonical] = intl.getCanonicalLocales(locale);
	} catch {
		throw new TypeError('Intl locale must be a valid BCP 47 locale');
	}
	if (!canonical) throw new TypeError('Intl locale must be a valid BCP 47 locale');
	return canonical as IntlLocaleString;
}

function localeFallbackChain(locale: string): readonly string[] {
	const canonical = canonicalLocale(locale);
	const parsed = intl.Locale(canonical);
	const candidates = [canonical, parsed.baseName];
	if (parsed.script)
		candidates.push(intl.Locale(parsed.language, { script: parsed.script }).baseName);
	candidates.push(parsed.language);
	return [...new Set(candidates)];
}

function catalogIdentity(locale: string, owner: string): string {
	return `${locale}\u0000${owner}`;
}

function messageIdentity(owner: string, key: string): string {
	return `${owner}\u0000${key}`;
}

function translationFingerprint(descriptor: IntlRuntimeDescriptorV1): string {
	return JSON.stringify({
		sourceLocale: descriptor.sourceLocale,
		target: descriptor.target,
		name: descriptor.name,
		...projectIntlTranslationContract(descriptor.bindings, descriptor.source)
	});
}

function executionFingerprint(descriptor: IntlRuntimeDescriptorV1): string {
	return JSON.stringify({
		bindings: descriptor.bindings,
		source: descriptor.source,
		capabilities: descriptor.capabilities
	});
}

type PseudoLocaleKind = 'accented' | 'bidi';

function pseudoLocaleKind(locale: string): PseudoLocaleKind | undefined {
	if (locale.toLowerCase() === 'en-xa') return 'accented';
	if (locale.toLowerCase() === 'ar-xb') return 'bidi';
	return undefined;
}

function pseudoPattern(pattern: IntlPatternV1, kind: PseudoLocaleKind): IntlPatternV1 {
	return Object.freeze(
		pattern.map((node) => {
			if (node.kind === 'text')
				return Object.freeze({ ...node, value: pseudoText(node.value, kind) });
			if (node.kind === 'element')
				return Object.freeze({ ...node, value: pseudoPattern(node.value, kind) });
			if (node.kind === 'select')
				return Object.freeze({
					...node,
					cases: Object.freeze(
						node.cases.map((candidate) =>
							Object.freeze({ ...candidate, value: pseudoPattern(candidate.value, kind) })
						)
					),
					fallback: pseudoPattern(node.fallback, kind)
				});
			return node;
		})
	);
}

function pseudoText(value: string, kind: PseudoLocaleKind): string {
	if (kind === 'bidi') return `\u2067${[...value].reverse().join('')}\u2069`;
	const accented = value.replace(
		/[A-Za-z]/gu,
		(character) => accentedCharacters[character] ?? character
	);
	return `[${accented}${'~'.repeat(Math.max(1, Math.ceil(value.length / 3)))}]`;
}

const accentedCharacters: Readonly<Record<string, string>> = Object.freeze({
	a: 'á',
	e: 'ë',
	i: 'ï',
	o: 'ö',
	u: 'ü',
	A: 'Á',
	E: 'Ë',
	I: 'Ï',
	O: 'Ö',
	U: 'Ü',
	c: 'ç',
	C: 'Ç',
	n: 'ñ',
	N: 'Ñ'
});
