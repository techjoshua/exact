import type {
	ThemeColorTokenName,
	ThemeDimensionTokenName,
	ThemeDurationTokenName,
	ThemeEasingTokenName,
	ThemeFontTokenName,
	ThemeNumberTokenName,
	ThemeShadowTokenName,
	ThemeTokenDescriptor,
	ThemeTokenKind,
	ThemeTokenName
} from './contracts.js';

const surfaceBundles = [0, 1, 2, 3, 'sunken', 'overlay'] as const;
const surfaceColorRoles = [
	'background',
	'foreground',
	'foreground-muted',
	'border',
	'border-strong'
] as const;
const tones = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;
const toneRoles = [
	'subtle',
	'subtle-hover',
	'subtle-active',
	'surface',
	'border',
	'text',
	'solid',
	'solid-hover',
	'solid-active',
	'on-solid',
	'focus'
] as const;

/** Stable ordered surface names used throughout exact-theme/1. */
export const themeSurfaceBundles = Object.freeze(surfaceBundles);
/** Stable ordered semantic tones used throughout exact-theme/1. */
export const themeTones = Object.freeze(tones);
/** Stable ordered roles carried by each semantic tone. */
export const themeToneRoles = Object.freeze(toneRoles);

function names(): Array<readonly [ThemeTokenName, ThemeTokenKind, number?, number?]> {
	const result: Array<readonly [ThemeTokenName, ThemeTokenKind, number?, number?]> = [];
	for (const bundle of surfaceBundles) {
		for (const role of surfaceColorRoles)
			result.push([`surface-${String(bundle)}-${role}` as ThemeColorTokenName, 'color']);
		result.push([`surface-${String(bundle)}-shadow` as ThemeShadowTokenName, 'shadow']);
	}
	for (const role of surfaceColorRoles)
		result.push([`surface-${role}` as ThemeColorTokenName, 'color']);
	result.push(['surface-shadow', 'shadow']);
	for (const name of [
		'canvas',
		'on-canvas',
		'on-canvas-muted',
		'disabled-background',
		'disabled-foreground',
		'disabled-border'
	] as const)
		result.push([name, 'color']);
	for (const tone of tones)
		for (const role of toneRoles) result.push([`${tone}-${role}` as ThemeColorTokenName, 'color']);
	for (const name of ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const)
		result.push([`font-size-${name}` as ThemeDimensionTokenName, 'dimension', 0]);
	for (const name of ['tight', 'normal', 'wide'] as const)
		result.push([`letter-spacing-${name}` as ThemeDimensionTokenName, 'dimension']);
	for (let index = 0; index <= 8; index++)
		result.push([`space-${index}` as ThemeDimensionTokenName, 'dimension', 0]);
	for (const name of ['sm', 'md', 'lg'] as const)
		result.push([`control-height-${name}` as ThemeDimensionTokenName, 'dimension', 0]);
	for (const name of ['sm', 'md', 'lg'] as const)
		result.push([`control-padding-inline-${name}` as ThemeDimensionTokenName, 'dimension', 0]);
	result.push(['control-gap', 'dimension', 0]);
	for (const name of ['sm', 'md', 'lg', 'pill'] as const)
		result.push([`radius-${name}` as ThemeDimensionTokenName, 'dimension', 0]);
	for (const name of ['border-width', 'focus-width'] as const) result.push([name, 'dimension', 0]);
	result.push(['focus-offset', 'dimension']);
	for (const name of ['tight', 'body', 'loose'] as const)
		result.push([`line-height-${name}` as ThemeNumberTokenName, 'number', 1, 2]);
	for (const name of ['regular', 'medium', 'strong'] as const)
		result.push([`font-weight-${name}` as ThemeNumberTokenName, 'number', 1, 1000]);
	for (const name of ['body', 'display', 'code'] as const)
		result.push([`font-${name}` as ThemeFontTokenName, 'font-family']);
	for (const name of ['sm', 'md', 'lg'] as const)
		result.push([`shadow-${name}` as ThemeShadowTokenName, 'shadow']);
	for (const name of ['fast', 'base', 'slow'] as const)
		result.push([`duration-${name}` as ThemeDurationTokenName, 'duration', 0, 10000]);
	for (const name of ['standard', 'emphasized'] as const)
		result.push([`easing-${name}` as ThemeEasingTokenName, 'easing']);
	return result;
}

const descriptors = Object.create(null) as Record<ThemeTokenName, ThemeTokenDescriptor>;
for (const [name, kind, minimum, maximum] of names()) {
	descriptors[name] = Object.freeze({
		cssName: `--exact-theme-${name}`,
		kind,
		description: `exact-theme/1 ${name} token`,
		...(minimum === undefined ? {} : { minimum }),
		...(maximum === undefined ? {} : { maximum })
	}) as ThemeTokenDescriptor;
}

/** Machine-readable exact-theme/1 CSS custom-property contract. */
export const exactThemeContract = Object.freeze({
	version: 'exact-theme/1' as const,
	prefix: '--exact-theme-' as const,
	tokens: Object.freeze(descriptors)
});
