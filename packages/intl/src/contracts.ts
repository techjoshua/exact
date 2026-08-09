import type { Child } from '@exactjs/core';

/** Primitive values accepted by protocol-1 formatter option records. */
export type IntlFiniteValueV1 = string | number | boolean | null | readonly IntlFiniteValueV1[];

/** Data-only formatter options after analyzer normalization. */
export type IntlFiniteOptionsV1 = Readonly<Record<string, IntlFiniteValueV1>>;

/** Runtime value categories understood by protocol-1 message plans. */
export type IntlBindingTypeV1 =
	| 'string'
	| 'number'
	| 'bigint'
	| 'boolean'
	| 'temporal-date'
	| 'temporal-time'
	| 'temporal-date-time'
	| 'temporal-instant'
	| 'temporal-zoned-date-time'
	| 'temporal-duration'
	| 'monetary'
	| 'measurement'
	| 'structure'
	| 'opaque-structure';

/** Declares one position in a prepared activation's binding vector. */
export interface IntlBindingDescriptorV1 {
	readonly index: number;
	readonly kind: 'value' | 'selector' | 'element' | 'opaque';
	readonly type: IntlBindingTypeV1;
	readonly name?: string;
	readonly exactlyOnce?: true;
}

/** Formatter projections supported by the first protocol version. */
export type IntlFormatterV1 =
	| Readonly<{ kind: 'number'; options: IntlFiniteOptionsV1 }>
	| Readonly<{
			kind: 'currency';
			currency: string;
			display: 'symbol' | 'narrowSymbol' | 'code' | 'name';
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{
			kind: 'unit';
			quantity: string;
			usage: string;
			sourceUnit: string;
			convertTo?: string;
			precision?: 'source';
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{
			kind: 'date-time';
			temporalKind: IntlBindingTypeV1;
			range?: true;
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{ kind: 'duration'; purpose?: string; options: IntlFiniteOptionsV1 }>
	| Readonly<{ kind: 'relative-time'; unitBinding: number; options: IntlFiniteOptionsV1 }>
	| Readonly<{
			kind: 'relative-duration';
			fields: readonly IntlRelativeDurationField[];
			zero: string;
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{ kind: 'display-name'; domain: string; options: IntlFiniteOptionsV1 }>
	| Readonly<{ kind: 'list'; options: IntlFiniteOptionsV1 }>;

/** Temporal.Duration fields supported by finite relative-duration projections. */
export type IntlRelativeDurationField =
	| 'years'
	| 'months'
	| 'weeks'
	| 'days'
	| 'hours'
	| 'minutes'
	| 'seconds';

/** Optional client platform features required by analyzed message fallbacks. */
export type IntlClientRequirement = 'temporal' | 'intl-duration-format';

/** Ordered message plan rendered as the source fallback or a validated translation. */
export type IntlPatternV1 = readonly IntlPatternNodeV1[];

/** Translator-authored pattern containing only stable, generic placeholder references. */
export type IntlTranslationPatternV1 = readonly IntlTranslationPatternNodeV1[];

/** One translator-visible operation, intentionally free of eXact execution metadata. */
export type IntlTranslationPatternNodeV1 =
	| Readonly<{ kind: 'text'; value: string }>
	| Readonly<{ kind: 'placeholder'; id: string }>
	| Readonly<{ kind: 'element'; id: string; value: IntlTranslationPatternV1 }>
	| Readonly<{
			kind: 'select';
			id: string;
			cases: readonly Readonly<{ key: string; value: IntlTranslationPatternV1 }>[];
			fallback: IntlTranslationPatternV1;
	  }>;

/** Translator-facing description for one generic placeholder identifier. */
export interface IntlTranslationPlaceholderV1 {
	readonly id: string;
	readonly kind: 'value' | 'format' | 'select' | 'element' | 'opaque';
	readonly role: string;
	readonly name: string;
	readonly canCopy: boolean;
	readonly canDelete: boolean;
}

/** Finite branch selectors supported by protocol-1 message plans. */
export type IntlSelectionV1 =
	| 'boolean'
	| 'exact'
	| 'plural-cardinal'
	| 'plural-ordinal'
	| 'plural-range-cardinal'
	| 'plural-range-ordinal';

/** One executable-data-free operation in a protocol-1 message pattern. */
export type IntlPatternNodeV1 =
	| Readonly<{ kind: 'text'; value: string }>
	| Readonly<{ kind: 'value'; binding: number }>
	| Readonly<{ kind: 'format'; bindings: readonly number[]; formatter: IntlFormatterV1 }>
	| Readonly<{
			kind: 'select';
			binding: number;
			/** Second numeric selector used only by native plural-range selection. */
			rangeBinding?: number;
			selection: IntlSelectionV1;
			cases: readonly Readonly<{ key: string; value: IntlPatternV1 }>[];
			fallback: IntlPatternV1;
	  }>
	| Readonly<{ kind: 'element'; binding: number; value: IntlPatternV1 }>
	| Readonly<{ kind: 'opaque'; binding: number; name: string }>;

/** Allowlisted intrinsic-property targets in protocol-1 descriptors. */
export type IntlPropertyName =
	| 'alt'
	| 'title'
	| 'placeholder'
	| 'aria-label'
	| 'aria-description'
	| 'aria-roledescription'
	| 'aria-valuetext';

/** Build-produced runtime descriptor retained by one reachable artifact. */
export interface IntlRuntimeDescriptorV1 {
	readonly protocol: 1;
	readonly owner: string;
	readonly occurrenceId: string;
	/** Hash of the reusable eXact execution contract, independent from translation identity. */
	readonly contract: string;
	readonly key: string;
	/** Optional authored semantic name used as the readable key prefix and translator context. */
	readonly name?: string;
	readonly sourceLocale: string;
	readonly target:
		| Readonly<{ kind: 'content' }>
		| Readonly<{ kind: 'property'; name: IntlPropertyName }>;
	readonly bindings: readonly IntlBindingDescriptorV1[];
	readonly source: IntlPatternV1;
	readonly capabilities: readonly string[];
}

/** Analyzer-only descriptor with source ownership and diagnostic provenance. */
export interface AnalyzedMessageDescriptorV1 extends IntlRuntimeDescriptorV1 {
	readonly ownerComponentId: string;
	readonly canonicalTranslation: string;
	readonly sourceRange: Readonly<{
		readonly file: string;
		readonly start: number;
		readonly length: number;
	}>;
}

/** One package-owned, locale-specific protocol-1 catalog. */
export interface IntlCatalogV1 {
	readonly protocol: 1;
	readonly locale: string;
	readonly owner: string;
	readonly messages: Readonly<Record<string, IntlTranslationPatternV1>>;
}

/** Static package.json declaration for published protocol-1 message contracts and catalogs. */
export interface IntlPackageMetadataV1 {
	readonly protocol: 1;
	readonly sourceLocale: string;
	readonly sourceUnits?: Readonly<Record<string, string>>;
	readonly messages: string;
	readonly catalogs?: Readonly<Record<string, string>>;
}

/** Published package-owned descriptor set loaded without executing package code. */
export interface IntlPublishedMessagesV1 {
	readonly protocol: 1;
	readonly owner: string;
	readonly sourceLocale: string;
	readonly descriptors: readonly IntlRuntimeDescriptorV1[];
}

/** Factory for one translator-movable direct intrinsic structure. */
export type IntlElementFactory = (children: readonly Child[], values: readonly unknown[]) => Child;

/** Factory for one named opaque structure that translators may move but not modify. */
export type IntlOpaqueFactory = (values: readonly unknown[]) => Child;

/** Structure factories supplied beside evaluated scalar values. */
export type IntlStructureFactory = IntlElementFactory | IntlOpaqueFactory;

/** Author-facing optional message name shorthand. */
export type IntlMessageActivation = true | string;

/** Author-facing property-message activation and optional finite formatter shorthand. */
export type IntlPropertyActivation = true | string | Readonly<{ format?: string; name?: string }>;

/** Author-facing cardinal plural activation. */
export type IntlPluralActivation =
	| number
	| Readonly<{
			value: number;
			name?: string;
	  }>;

/** Values accepted by exact message selection. */
export type IntlExactSelector = string | number | boolean;

/** Author-facing exact selection activation. */
export type IntlSelectActivation<Value extends IntlExactSelector = IntlExactSelector> =
	| Value
	| Readonly<{ value: Value; name?: string }>;

/** Currency display forms preserved as semantic formatter policy. */
export type IntlCurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name';

/** Author-facing currency activation before analyzer preparation. */
export type IntlCurrencyActivation =
	| true
	| string
	| Readonly<{ currency?: string; display?: IntlCurrencyDisplay; name?: string }>;

/** Author-facing semantic-unit activation before analyzer preparation. */
export type IntlUnitActivation =
	| string
	| Readonly<{
			unit: string;
			sourceUnit?: string;
			convertTo?: string;
			name?: string;
	  }>;
