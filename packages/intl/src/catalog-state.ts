import type {
	IntlCatalogV1,
	IntlTranslationPatternV1,
	IntlRuntimeDescriptorV1
} from './contracts.js';
import { captureArray } from './protocol-data.js';
import { projectIntlTranslationContract } from './translation-contract.js';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';

/** One owned registry revision. Class identity makes atomic replacement independent of structural equality. */
export class IntlCatalogState {
	/** Retains only captured data after complete descriptor and catalog validation. */
	constructor(
		readonly data: {
			readonly descriptors: readonly IntlRuntimeDescriptorV1[];
			readonly byMessage: ReadonlyMap<string, IntlRuntimeDescriptorV1>;
			readonly catalogs: ReadonlyMap<string, IntlCatalogV1>;
			readonly baseCatalogs: readonly IntlCatalogV1[];
			readonly layers: readonly IntlCatalogV1[];
			readonly manual: ReadonlyMap<string, IntlCatalogV1>;
			readonly revision: number;
		}
	) {}

	/** Prepares an additive manual catalog without changing the accepted revision. */
	withCatalog(input: unknown): { state: IntlCatalogState; catalog: IntlCatalogV1 } {
		const catalog = validateIntlCatalog(input, this.data.descriptors);
		const catalogs = new Map(this.data.catalogs);
		mergeCatalog(catalogs, catalog);
		const manual = new Map(this.data.manual);
		mergeCatalog(manual, catalog);
		return { state: new IntlCatalogState({ ...this.data, catalogs, manual }), catalog };
	}

	/** Looks up one captured descriptor using its compiler-owned message identity. */
	descriptor(owner: string, key: string): IntlRuntimeDescriptorV1 | undefined {
		return this.data.byMessage.get(`${owner}\u0000${key}`);
	}

	/** Reads a validated translated pattern without changing registry state. */
	pattern(locale: string, owner: string, key: string): IntlTranslationPatternV1 | undefined {
		return this.data.catalogs.get(`${locale}\u0000${owner}`)?.messages[key];
	}
}

/** Validates an entire replacement in private collections before publishing any registry state. */
export function prepareIntlCatalogState(
	descriptorInputs: readonly unknown[],
	catalogInputs: readonly unknown[],
	layerInputs: readonly unknown[],
	manualInputs: readonly unknown[],
	revision: number
): IntlCatalogState {
	const descriptors: IntlRuntimeDescriptorV1[] = [];
	const byMessage = new Map<string, IntlRuntimeDescriptorV1>();
	const byContract = new Map<string, IntlRuntimeDescriptorV1>();
	for (const input of captureArray(descriptorInputs, 'Intl environment descriptors')) {
		const validated = validateIntlRuntimeDescriptor(input);
		const shared = byContract.get(validated.contract);
		if (shared && executionFingerprint(shared) !== executionFingerprint(validated))
			throw new Error(`Intl execution contract ${validated.contract} has conflicting definitions`);
		const descriptor = shared
			? {
					...validated,
					bindings: shared.bindings,
					source: shared.source,
					capabilities: shared.capabilities
				}
			: validated;
		if (!shared) byContract.set(descriptor.contract, descriptor);
		const identity = `${descriptor.owner}\u0000${descriptor.key}`;
		const previous = byMessage.get(identity);
		if (previous && translationFingerprint(previous) !== translationFingerprint(descriptor))
			throw new Error(`Intl translation contract ${identity} disagrees across loaded artifacts`);
		if (!previous) {
			descriptors.push(descriptor);
			byMessage.set(identity, descriptor);
		}
	}
	const catalogs = new Map<string, IntlCatalogV1>();
	const capture = (inputs: readonly unknown[]) => {
		const captured = new Map<string, IntlCatalogV1>();
		for (const input of captureArray(inputs, 'Intl environment catalogs')) {
			const catalog = validateIntlCatalog(input, descriptors);
			mergeCatalog(catalogs, catalog);
			mergeCatalog(captured, catalog);
		}
		return [...captured.values()];
	};
	const base = capture(catalogInputs),
		layers = capture(layerInputs);
	const manual = new Map<string, IntlCatalogV1>();
	for (const catalog of capture(manualInputs)) mergeCatalog(manual, catalog);
	return new IntlCatalogState({
		descriptors,
		byMessage,
		catalogs,
		baseCatalogs: base,
		layers,
		manual,
		revision
	});
}

/** Layers captured messages by locale and owner, retaining existing keys absent from a later layer. */
function mergeCatalog(catalogs: Map<string, IntlCatalogV1>, catalog: IntlCatalogV1): void {
	const identity = `${catalog.locale}\u0000${catalog.owner}`;
	const previous = catalogs.get(identity);
	catalogs.set(
		identity,
		previous ? { ...catalog, messages: { ...previous.messages, ...catalog.messages } } : catalog
	);
}

/** Compares translator-visible contracts independently of execution identity. */
function translationFingerprint(descriptor: IntlRuntimeDescriptorV1): string {
	return JSON.stringify({
		sourceLocale: descriptor.sourceLocale,
		target: descriptor.target,
		name: descriptor.name,
		...projectIntlTranslationContract(descriptor.bindings, descriptor.source)
	});
}
/** Rejects conflicting executable plans under one compiler contract. */
function executionFingerprint(descriptor: IntlRuntimeDescriptorV1): string {
	return JSON.stringify({
		bindings: descriptor.bindings,
		source: descriptor.source,
		capabilities: descriptor.capabilities
	});
}
