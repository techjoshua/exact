/** Secret-free development configuration accepted by the intl language provider. */
export interface ExactIntlLanguageConfiguration {
	readonly sourceLocale?: string;
	readonly catalogFiles?: readonly string[];
	readonly requiredLocales?: readonly string[];
	/** Emits concise inference and translation-coverage notes unless explicitly disabled. */
	readonly showInlayHints?: boolean;
	/** Reports malformed, obsolete, or structurally incompatible configured catalogs. */
	readonly catalogHygiene?: boolean;
	/** Reports literal formatter locales that contradict the authored source locale. */
	readonly localeConsistency?: boolean;
}

declare module '@exactjs/language-extension-api' {
	interface ExactLanguageProviderConfigRegistry {
		'@exactjs/intl': ExactIntlLanguageConfiguration;
	}
}
