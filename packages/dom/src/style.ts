import { computed, unwrap, type ReactiveValue } from '@exactjs/reactive';

/** Defines the css value type contract. */
export type CssValue = string | number | ReactiveValue<string>;

type CssInput = unknown;

/** Provides the canonical px value. */
export const px = unit('px');
/** Provides the canonical rem value. */
export const rem = unit('rem');
/** Provides the canonical em value. */
export const em = unit('em');
/** Provides the canonical percent value. */
export const percent = unit('%');
/** Provides the canonical vh value. */
export const vh = unit('vh');
/** Provides the canonical vw value. */
export const vw = unit('vw');
/** Provides the canonical vmin value. */
export const vmin = unit('vmin');
/** Provides the canonical vmax value. */
export const vmax = unit('vmax');
/** Provides the canonical fr value. */
export const fr = unit('fr');
/** Provides the canonical ms value. */
export const ms = unit('ms');
/** Provides the canonical s value. */
export const s = unit('s');
/** Provides the canonical deg value. */
export const deg = unit('deg');
/** Provides the canonical rad value. */
export const rad = unit('rad');
/** Provides the canonical turn value. */
export const turn = unit('turn');

/** Creates a reactive CSS unit helper such as px(2) or rem(count). */
export function unit(suffix: string): (value: CssInput) => ReactiveValue<string> {
	return (value: CssInput) => computed(() => `${unwrap(value) ?? ''}${suffix}`);
}

/** Converts a camelCase style property name to its CSS property spelling. */
export function toCssProperty(name: string): string {
	return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
