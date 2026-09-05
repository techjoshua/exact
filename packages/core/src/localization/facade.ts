import type { ComponentLocalizationOwner } from '../component/localization-capability.js';
import { LocalizationContext } from './context.js';
import type { IntlFacade, LocalizationContextValue } from './contracts.js';
import { cachedDurationFormatter, cachedIntlFormatter } from './formatter-pool.js';

type LocalizationResolver = () => LocalizationContextValue | undefined;

/** Realm-wide cache-backed Intl facade for helpers without a component owner. */
export const intl: IntlFacade = /* @__PURE__ */ createIntlFacade(() => undefined);

/** Creates a stable facade whose implicit source policy resolves through the nearest provider. */
export function createComponentIntlFacade(owner: ComponentLocalizationOwner): IntlFacade {
	return createIntlFacade(() => componentLocalization(owner));
}

function componentLocalization(
	owner: ComponentLocalizationOwner
): LocalizationContextValue | undefined {
	if (!owner.hasContext(LocalizationContext)) return undefined;
	return owner.getContext(LocalizationContext);
}

function createIntlFacade(resolveLocalization: LocalizationResolver): IntlFacade {
	const locales = (
		requested: Intl.LocalesArgument | undefined
	): Intl.LocalesArgument | undefined => {
		const localization = resolveLocalization();
		if (!localization) return requested;
		if (requested === undefined) return localization.locale;
		if (
			localization.sourceLocale !== undefined &&
			typeof requested === 'string' &&
			globalThis.Intl.getCanonicalLocales(requested)[0] === localization.sourceLocale
		)
			return localization.locale;
		return requested;
	};
	const facade: IntlFacade = {
		formatNumber(value, requested, options) {
			return facade.NumberFormat(requested, options).format(value);
		},
		formatDate(value, projection, requested, options) {
			if (Number.isNaN(value.getTime())) return 'Invalid Date';
			return facade
				.DateTimeFormat(requested, dateProjectionOptions(projection, options))
				.format(value);
		},
		NumberFormat(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'number',
				effective,
				options,
				() => new globalThis.Intl.NumberFormat(effective, options)
			);
		},
		DateTimeFormat(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'date-time',
				effective,
				options,
				() => new globalThis.Intl.DateTimeFormat(effective, options)
			);
		},
		PluralRules(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'plural-rules',
				effective,
				options,
				() => new globalThis.Intl.PluralRules(effective, options)
			);
		},
		RelativeTimeFormat(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'relative-time',
				effective,
				options,
				() => new globalThis.Intl.RelativeTimeFormat(effective, options)
			);
		},
		DisplayNames(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'display-names',
				effective,
				options,
				() => new globalThis.Intl.DisplayNames(effective!, options)
			);
		},
		ListFormat(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'list',
				effective,
				options,
				() => new globalThis.Intl.ListFormat(effective, options)
			);
		},
		Collator(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'collator',
				effective,
				options,
				() => new globalThis.Intl.Collator(effective, options)
			);
		},
		Segmenter(requested, options) {
			const effective = locales(requested);
			return cachedIntlFormatter(
				'segmenter',
				effective,
				options,
				() => new globalThis.Intl.Segmenter(effective, options)
			);
		},
		DurationFormat(requested, options) {
			return cachedDurationFormatter(locales(requested), options);
		},
		Locale(tag, options) {
			if (typeof tag !== 'string') return new globalThis.Intl.Locale(tag, options);
			const localeTag = tag;
			return cachedIntlFormatter(
				'locale',
				localeTag,
				options,
				() => new globalThis.Intl.Locale(tag, options)
			);
		},
		getCanonicalLocales(requested) {
			return globalThis.Intl.getCanonicalLocales(requested as string | readonly string[]);
		},
		supportedValuesOf(key) {
			return globalThis.Intl.supportedValuesOf(key as never);
		}
	};
	return Object.freeze(facade);
}

function dateProjectionOptions(
	projection: 'date-time' | 'date' | 'time',
	options: Intl.DateTimeFormatOptions | undefined
): Intl.DateTimeFormatOptions {
	if (options && hasDateTimeProjection(options)) return options;
	const date =
		projection !== 'time' ? ({ year: 'numeric', month: 'numeric', day: 'numeric' } as const) : {};
	const time =
		projection !== 'date'
			? ({ hour: 'numeric', minute: 'numeric', second: 'numeric' } as const)
			: {};
	return { ...(options ?? {}), ...date, ...time };
}

function hasDateTimeProjection(options: Intl.DateTimeFormatOptions): boolean {
	return [
		'weekday',
		'era',
		'year',
		'month',
		'day',
		'dayPeriod',
		'hour',
		'minute',
		'second',
		'fractionalSecondDigits',
		'timeZoneName',
		'dateStyle',
		'timeStyle'
	].some((name) => options[name as keyof Intl.DateTimeFormatOptions] !== undefined);
}
