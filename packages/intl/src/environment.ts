import { batch, reactive, type Reactive } from '@exactjs/reactive';
import type { IntlCatalogV1, IntlPatternV1, IntlRuntimeDescriptorV1 } from './contracts.js';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';
import { snapshotIntlArtifacts } from './artifacts.js';

/** Mutable locale state observed by message render plans. */
export interface IntlEnvironmentState {
	locale: string;
	generation: number;
}

/** Options used to create an isolated internationalization environment. */
export interface IntlEnvironmentOptions {
	locale: string;
	/** Application or user destination-unit overrides keyed by canonical quantity/usage. */
	unitPreferences?: Readonly<Record<string, string | readonly string[]>>;
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
	readonly unitPreferences: Readonly<Record<string, string | readonly string[]>>;
	setLocale(locale: string): void;
	setUnitPreferences(preferences: Readonly<Record<string, string | readonly string[]>>): void;
	addCatalog(catalog: unknown): void;
	find(owner: string, key: string): IntlPatternV1 | undefined;
}

/** Creates a locale environment whose updates participate in eXact reactivity. */
export function createIntlEnvironment(options: IntlEnvironmentOptions): IntlEnvironment {
	const generated = snapshotIntlArtifacts();
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
	const reportedMissing = new Set<string>();
	const manualCatalogs: unknown[] = [];
	const layerPriority = { library: 1, application: 2, override: 3 } as const;
	const catalogLayers = [...(options.catalogLayers ?? [])].sort(
		(left, right) => layerPriority[left.kind] - layerPriority[right.kind]
	);
	let unitPreferences = Object.freeze({ ...(options.unitPreferences ?? {}) });
	const replaceDescriptors = (inputs: readonly unknown[]): void => {
		descriptors.length = 0;
		descriptorByMessage.clear();
		for (const input of inputs) {
			const descriptor = validateIntlRuntimeDescriptor(input);
			const identity = messageIdentity(descriptor.owner, descriptor.key);
			const previous = descriptorByMessage.get(identity);
			if (previous && descriptorFingerprint(previous) !== descriptorFingerprint(descriptor))
				throw new Error(`Intl descriptor ${identity} disagrees across loaded artifacts`);
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
	return Object.freeze({
		state,
		get unitPreferences() {
			void state.generation;
			return unitPreferences;
		},
		setLocale(locale: string): void {
			const next = canonicalLocale(locale);
			if (next === state.locale) return;
			batch(() => {
				state.locale = next;
				state.generation++;
			});
		},
		setUnitPreferences(preferences: Readonly<Record<string, string | readonly string[]>>): void {
			batch(() => {
				unitPreferences = Object.freeze({ ...preferences });
				state.generation++;
			});
		},
		addCatalog(input: unknown): void {
			batch(() => {
				manualCatalogs.push(input);
				addCatalog(input);
				state.generation++;
			});
		},
		find(owner: string, key: string): IntlPatternV1 | undefined {
			void state.generation;
			synchronizeGeneratedArtifacts();
			for (const candidate of localeFallbackChain(state.locale)) {
				const translated = catalogs.get(catalogIdentity(candidate, owner))?.messages[key];
				if (translated) return translated;
			}
			const descriptor = descriptorByMessage.get(messageIdentity(owner, key));
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
}

function canonicalLocale(locale: string): string {
	const [canonical] = Intl.getCanonicalLocales(locale);
	if (!canonical) throw new TypeError('Intl locale must be a valid BCP 47 locale');
	return canonical;
}

function localeFallbackChain(locale: string): readonly string[] {
	const canonical = canonicalLocale(locale);
	const parsed = new Intl.Locale(canonical);
	const candidates = [canonical, parsed.baseName];
	if (parsed.script)
		candidates.push(new Intl.Locale(parsed.language, { script: parsed.script }).baseName);
	candidates.push(parsed.language);
	return [...new Set(candidates)];
}

function catalogIdentity(locale: string, owner: string): string {
	return `${locale}\u0000${owner}`;
}

function messageIdentity(owner: string, key: string): string {
	return `${owner}\u0000${key}`;
}

function descriptorFingerprint(descriptor: IntlRuntimeDescriptorV1): string {
	return JSON.stringify({ ...descriptor, occurrenceId: '' });
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
