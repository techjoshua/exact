import { copyIntlProtocolData } from './protocol-data.js';
import { prepareIntlCatalogState } from './catalog-state.js';
import { copyIntlUnitPreferences } from './environment-policy.js';
import { batch, reactive, unwrap, type Reactive } from '@exactjs/reactive';
import { intl } from '@exactjs/core';
import type { IntlPatternV1, IntlRuntimeDescriptorV1 } from './contracts.js';
import { currentIntlArtifactRevision, snapshotIntlArtifacts } from './artifacts.js';
import { materializeIntlTranslation } from './translation-contract.js';
import type { IntlUnitForDimension } from './unit-definitions.js';
import type { IntlLocaleString } from './cldr-locale-types.js';
import { canonicalLocale, localeFallbackChain } from './locale-resolution.js';

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
	/** Independent policy observation. Update provider and locale scopes through setUnitPreferences. */
	readonly unitPreferences: IntlUnitPreferences;
	setLocale(locale: IntlLocaleString): void;
	/** Captures policy once and publishes one rollback-capable update across existing locale scopes. */
	setUnitPreferences(preferences: IntlUnitPreferences): void;
	/** Returns this environment for the active locale or a catalog-sharing locale scope. */
	forLocale(locale: IntlLocaleString): IntlEnvironment;
	addCatalog(catalog: unknown): void;
	/** Returns an independent message plan, or undefined when authored source fallback should apply. */
	find(owner: string, key: string, descriptor?: IntlRuntimeDescriptorV1): IntlPatternV1 | undefined;
}

/** Creates a locale environment whose updates participate in eXact reactivity. */
export function createIntlEnvironment(options: IntlEnvironmentOptions): IntlEnvironment {
	return initializeIntlEnvironment(options, snapshotIntlArtifacts());
}

/** Builds an isolated environment from a captured artifact revision. */
function initializeIntlEnvironment(
	options: IntlEnvironmentOptions,
	generated: ReturnType<typeof snapshotIntlArtifacts>
): IntlEnvironment {
	const sourceLocale = canonicalLocale(options.sourceLocale ?? options.locale);
	const state = reactive<IntlEnvironmentState>({
		locale: canonicalLocale(options.locale),
		generation: 0
	});
	const generatedDescriptors = options.descriptors === undefined;
	const generatedCatalogs = options.catalogs === undefined;
	const materialized = new WeakMap<object, Map<string, IntlPatternV1>>();
	const reportedMissing = new Set<string>();
	const localeScopes = new Map<string, IntlEnvironment>();
	let fallbackLocale: string | undefined;
	let fallbackCandidates: readonly string[] = [];
	const layerPriority = { library: 1, application: 2, override: 3 } as const;
	const catalogLayers = [...(options.catalogLayers ?? [])].sort(
		(left, right) => layerPriority[left.kind] - layerPriority[right.kind]
	);
	const policy = reactive({ preferences: copyIntlUnitPreferences(options.unitPreferences ?? {}) });
	const registry = reactive({
		current: prepareIntlCatalogState(
			options.descriptors ?? generated.descriptors,
			options.catalogs ?? generated.catalogs,
			catalogLayers.map((layer) => layer.catalog),
			[],
			generated.revision
		)
	});
	const synchronizeGeneratedArtifacts = () => {
		const previous = registry.current;
		if (!generatedDescriptors && !generatedCatalogs) return previous;
		if (currentIntlArtifactRevision() === previous.data.revision) return previous;
		const snapshot = snapshotIntlArtifacts();
		const next = prepareIntlCatalogState(
			generatedDescriptors ? snapshot.descriptors : previous.data.descriptors,
			generatedCatalogs ? snapshot.catalogs : previous.data.baseCatalogs,
			previous.data.layers,
			[...previous.data.manual.values()],
			snapshot.revision
		);
		registry.current = next;
		return next;
	};
	const environment: IntlEnvironment = {
		state,
		sourceLocale,
		get unitPreferences() {
			void state.generation;
			return copyIntlUnitPreferences(policy.preferences);
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
			const captured = copyIntlUnitPreferences(preferences);
			batch(() => {
				policy.preferences = captured;
				const accepted = unwrap(policy.preferences);
				state.generation++;
				for (const scope of localeScopes.values()) {
					if (unwrap(policy.preferences) !== accepted) break;
					scope.setUnitPreferences(copyIntlUnitPreferences(captured));
				}
			});
		},
		forLocale(locale: IntlLocaleString): IntlEnvironment {
			const next = canonicalLocale(locale);
			if (next === state.locale) return environment;
			let scoped = localeScopes.get(next);
			if (scoped) return scoped;
			scoped = createIntlEnvironment({
				locale: next,
				sourceLocale,
				...(generatedDescriptors ? {} : { descriptors: registry.current.data.descriptors }),
				...(generatedCatalogs ? {} : { catalogs: registry.current.data.baseCatalogs }),
				catalogLayers: [
					...registry.current.data.layers,
					...registry.current.data.manual.values()
				].map((catalog) => ({ kind: 'override' as const, catalog })),
				unitPreferences: copyIntlUnitPreferences(policy.preferences),
				onMissingMessage: options.onMissingMessage
			});
			localeScopes.set(next, scoped);
			return scoped;
		},
		addCatalog(input: unknown): void {
			const previous = registry.current;
			const prepared = previous.withCatalog(input);
			const catalog = prepared.catalog;
			const next =
				registry.current === previous
					? prepared.state
					: registry.current.withCatalog(catalog).state;
			batch(() => {
				registry.current = next;
				state.generation++;
				for (const scope of localeScopes.values()) {
					if (registry.current !== next) break;
					scope.addCatalog(catalog);
				}
			});
		},
		find(
			owner: string,
			key: string,
			descriptorInput?: IntlRuntimeDescriptorV1
		): IntlPatternV1 | undefined {
			void state.generation;
			const current = synchronizeGeneratedArtifacts();
			const descriptor = descriptorInput ?? current.descriptor(owner, key);
			// Every reader must observe locale even when another message populated the cache.
			// Keep only the current locale's chain; catalogs and message results remain live.
			const locale = state.locale;
			if (fallbackLocale !== locale) {
				const candidates = localeFallbackChain(locale);
				fallbackCandidates = candidates;
				fallbackLocale = locale;
			}
			for (const candidate of fallbackCandidates) {
				const translated = current.pattern(candidate, owner, key);
				if (translated && descriptor) {
					let byContract = materialized.get(translated as object);
					if (!byContract) materialized.set(translated as object, (byContract = new Map()));
					const cached = byContract.get(descriptor.contract);
					if (cached) return copyIntlProtocolData(cached);
					const pattern = materializeIntlTranslation(translated, descriptor);
					byContract.set(descriptor.contract, pattern);
					return copyIntlProtocolData(pattern);
				}
			}
			if (!descriptor) return undefined;
			const pseudo = pseudoLocaleKind(state.locale);
			if (pseudo) return copyIntlProtocolData(pseudoPattern(descriptor.source, pseudo));
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
	};
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
	return { lang: parsed.baseName, dir: direction };
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
	// Canonicalization can reenter registration through the public Intl facade.
	return initializeIntlEnvironment(
		{ locale: locale ?? sourceLocale, sourceLocale },
		currentIntlArtifactRevision() === generated.revision ? generated : snapshotIntlArtifacts()
	);
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
