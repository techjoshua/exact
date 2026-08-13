/** Locale policy exposed by a localization provider without coupling core to a plugin runtime. */
export interface LocalizationContextValue {
	/** Active canonical BCP 47 locale. Reading it may establish a reactive dependency. */
	readonly locale: string;
	/** Canonical locale used by authored fallback expressions. */
	readonly sourceLocale?: string;
}

/** Minimal formatter returned when Intl.DurationFormat is supplied natively or by a polyfill. */
export interface IntlDurationFormatter {
	format(value: unknown): string;
	formatToParts?(value: unknown): readonly unknown[];
}

/** Public cache-backed view of the realm's effective Intl implementation. */
export interface IntlFacade {
	/** Formats a numeric primitive through the shared NumberFormat pool. */
	formatNumber(
		value: number | bigint,
		locales?: Intl.LocalesArgument,
		options?: Intl.NumberFormatOptions
	): string;
	/** Preserves the three native Date locale-string projections through the shared pool. */
	formatDate(
		value: Date,
		projection: 'date-time' | 'date' | 'time',
		locales?: Intl.LocalesArgument,
		options?: Intl.DateTimeFormatOptions
	): string;
	NumberFormat(
		locales?: Intl.LocalesArgument,
		options?: Intl.NumberFormatOptions
	): Intl.NumberFormat;
	DateTimeFormat(
		locales?: Intl.LocalesArgument,
		options?: Intl.DateTimeFormatOptions
	): Intl.DateTimeFormat;
	PluralRules(locales?: Intl.LocalesArgument, options?: Intl.PluralRulesOptions): Intl.PluralRules;
	RelativeTimeFormat(
		locales?: Intl.LocalesArgument,
		options?: Intl.RelativeTimeFormatOptions
	): Intl.RelativeTimeFormat;
	DisplayNames(locales: Intl.LocalesArgument, options: Intl.DisplayNamesOptions): Intl.DisplayNames;
	ListFormat(locales?: Intl.LocalesArgument, options?: Intl.ListFormatOptions): Intl.ListFormat;
	Collator(locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): Intl.Collator;
	Segmenter(locales?: Intl.LocalesArgument, options?: Intl.SegmenterOptions): Intl.Segmenter;
	/** Returns undefined until a native implementation or capability polyfill is installed. */
	DurationFormat(
		locales?: Intl.LocalesArgument,
		options?: Readonly<Record<string, unknown>>
	): IntlDurationFormatter | undefined;
	Locale(tag: string | Intl.Locale, options?: Intl.LocaleOptions): Intl.Locale;
	getCanonicalLocales(locales: Intl.LocalesArgument): string[];
	supportedValuesOf(key: string): string[];
}
