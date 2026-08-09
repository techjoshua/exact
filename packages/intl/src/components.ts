import {
	createCompiledTarget,
	createContext,
	markExactComponent,
	markExactEnhancementContexts,
	TargetOverrides,
	unwrap,
	type Child,
	type Component
} from '@exactjs/core';
import type { IntlPropertyActivation, IntlPropertyName } from './contracts.js';
import type { IntlEnvironment } from './environment.js';
import { isPreparedIntlActivation, type PreparedIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';

/** Shared application context used by intl enhancement components. */
export const IntlEnvironmentContext = createContext<IntlEnvironment>('@exactjs/intl.environment', {
	global: true,
	reactive: false,
	keep: 'shared'
});

/** Props accepted by the application-level internationalization provider. */
export interface IntlProviderProps {
	environment: IntlEnvironment;
	children?: Child | Child[];
}

/** Publishes an internationalization environment to descendant enhancement components. */
export function IntlProvider(this: Component<{}>, props: IntlProviderProps) {
	this.setContext(IntlEnvironmentContext, unwrap(props.environment));
	return () => props.children;
}

/** Internal enhancement props after generated source instrumentation. */
export interface IntlPreparedMessageProps {
	context?: string;
	message?: true | string | PreparedIntlActivation;
	plural?: number | object | PreparedIntlActivation;
	select?: string | number | boolean | object | PreparedIntlActivation;
	unit?: string | object | PreparedIntlActivation;
	cldr?: string | PreparedIntlActivation;
	currency?: true | string | object | PreparedIntlActivation;
	children?: Child | Child[];
}

/** Explicit plural-message props; native analysis prepares the plural activation in source. */
export type IntlPluralProps = IntlPreparedMessageProps;

/** Explicit selection-message props; native analysis prepares the selection activation in source. */
export type IntlSelectProps = IntlPreparedMessageProps;

/** Explicit currency-message props; native analysis prepares the currency projection in source. */
export type IntlCurrencyProps = IntlPreparedMessageProps;

/** Explicit semantic-unit props; native analysis prepares the unit projection in source. */
export type IntlUnitProps = IntlPreparedMessageProps & {
	cldr?: string;
	sourceUnit?: string;
	convertTo?: string;
};

/** Prepared allowlisted intrinsic-property messages grouped into one enhancement instance. */
export interface IntlPreparedAttributesProps {
	alt?: IntlPropertyActivation | PreparedIntlActivation;
	title?: IntlPropertyActivation | PreparedIntlActivation;
	placeholder?: IntlPropertyActivation | PreparedIntlActivation;
	'aria-label'?: IntlPropertyActivation | PreparedIntlActivation;
	'aria-description'?: IntlPropertyActivation | PreparedIntlActivation;
	'aria-roledescription'?: IntlPropertyActivation | PreparedIntlActivation;
	'aria-valuetext'?: IntlPropertyActivation | PreparedIntlActivation;
	children?: Child | Child[];
}

/** Renders generated prepared message plans while preserving unprepared source children. */
export function IntlMessage(this: Component<{}>, props: IntlPreparedMessageProps) {
	const environment = this.hasContext(IntlEnvironmentContext)
		? this.getContext(IntlEnvironmentContext)
		: undefined;
	return () => {
		const prepared = findPreparedActivation(props);
		if (!prepared) return props.children;
		if (!environment) throw new Error('Prepared intl messages require an ancestor IntlProvider');
		const content = renderIntlActivation(prepared, environment);
		return prepared.target ? prepared.target(content, prepared.values) : content;
	};
}

/** Explicit plural component backed by the shared prepared-message renderer. */
export function IntlPlural(this: Component<{}>, props: IntlPluralProps) {
	return IntlMessage.call(this, props);
}

/** Explicit exact-selection component backed by the shared prepared-message renderer. */
export function IntlSelect(this: Component<{}>, props: IntlSelectProps) {
	return IntlMessage.call(this, props);
}

/** Explicit currency component backed by the shared prepared-message renderer. */
export function IntlCurrency(this: Component<{}>, props: IntlCurrencyProps) {
	return IntlMessage.call(this, props);
}

/** Explicit semantic-unit component backed by the shared prepared-message renderer. */
export function IntlUnit(this: Component<{}>, props: IntlUnitProps) {
	return IntlMessage.call(this, props);
}

const intlPropertyNames = Object.freeze([
	'alt',
	'title',
	'placeholder',
	'aria-label',
	'aria-description',
	'aria-roledescription',
	'aria-valuetext'
] as const satisfies readonly IntlPropertyName[]);

/** Contributes translated scalar properties to the authored intrinsic through `_target`. */
export function IntlAttributes(this: Component<{}>, props: IntlPreparedAttributesProps) {
	const environment = this.hasContext(IntlEnvironmentContext)
		? this.getContext(IntlEnvironmentContext)
		: undefined;
	return () => {
		const contributions: Record<string, unknown> = {};
		for (const name of intlPropertyNames) {
			const candidate = unwrap(props[name]);
			if (!isPreparedIntlActivation(candidate)) continue;
			if (!environment)
				throw new Error('Prepared intl properties require an ancestor IntlProvider');
			if (
				candidate.descriptor.target.kind !== 'property' ||
				candidate.descriptor.target.name !== name
			)
				throw new TypeError(`Prepared intl property ${name} has a mismatched descriptor target`);
			contributions[name] = renderIntlActivation(candidate, environment)
				.map((value) => String(value ?? ''))
				.join('');
		}
		return createCompiledTarget(
			{ ...contributions, [TargetOverrides]: Object.keys(contributions) },
			props.children
		);
	};
}

markExactComponent(IntlProvider, '@exactjs/intl:IntlProvider');
markExactComponent(IntlMessage, '@exactjs/intl:IntlMessage');
markExactComponent(IntlPlural, '@exactjs/intl:IntlPlural');
markExactComponent(IntlSelect, '@exactjs/intl:IntlSelect');
markExactComponent(IntlCurrency, '@exactjs/intl:IntlCurrency');
markExactComponent(IntlUnit, '@exactjs/intl:IntlUnit');
markExactComponent(IntlAttributes, '@exactjs/intl:IntlAttributes');
markExactEnhancementContexts(IntlProvider, { provides: [IntlEnvironmentContext] });
markExactEnhancementContexts(IntlMessage, { requires: [IntlEnvironmentContext] });
markExactEnhancementContexts(IntlPlural, { requires: [IntlEnvironmentContext] });
markExactEnhancementContexts(IntlSelect, { requires: [IntlEnvironmentContext] });
markExactEnhancementContexts(IntlCurrency, { requires: [IntlEnvironmentContext] });
markExactEnhancementContexts(IntlUnit, { requires: [IntlEnvironmentContext] });
markExactEnhancementContexts(IntlAttributes, { requires: [IntlEnvironmentContext] });

function findPreparedActivation(
	props: IntlPreparedMessageProps
): PreparedIntlActivation | undefined {
	for (const candidate of [
		props.message,
		props.plural,
		props.select,
		props.unit,
		props.cldr,
		props.currency
	]) {
		const value = unwrap(candidate);
		if (isPreparedIntlActivation(value)) return value;
	}
	return undefined;
}
