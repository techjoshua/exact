import type {
	ResolvedTheme,
	ThemeAppearance,
	ThemePreferences,
	ThemeScopeDefinition,
	ThemeSource,
	ThemeSystemPreferences
} from './contracts.js';
import { resolveTheme, serializeThemeVariables } from './resolver.js';
import { themeStyleAttribute } from './overrides.js';
import { selectThemeAxis, selectThemeAppearance } from './source-resolution.js';

const resolutions = new WeakMap<ThemeScopeDefinition, Map<string, ResolvedTheme>>();

/** Builds serializable ancestry without replacing system choices with a server fallback. @exact pure */
export function createThemeScopeDefinition(
	source: ThemeSource,
	parent?: ThemeScopeDefinition
): ThemeScopeDefinition {
	return Object.freeze({ source: snapshotSource(source), ...(parent ? { parent } : {}) });
}

/** Reads reactive source leaves and copies caller-owned data before identity-based caching. */
function snapshotSource<T>(value: T): T {
	if (!value || typeof value !== 'object') return value;
	return Object.freeze(
		Array.isArray(value)
			? value.map(snapshotSource)
			: Object.fromEntries(
					Object.entries(value).map(([name, child]) => [name, snapshotSource(child)])
				)
	) as T;
}

/** Resolves one scope against explicit host preferences, caching only while its definition is alive. @exact pure */
export function resolveThemeScope(
	definition: ThemeScopeDefinition,
	environment: ThemeSystemPreferences
): ResolvedTheme {
	const parent = definition.parent ? resolveThemeScope(definition.parent, environment) : undefined;
	const source = definition.source;
	const effective = {
		appearance: selectThemeAppearance(
			source.appearance,
			parent?.source.appearance,
			environment.appearance
		),
		contrast: selectThemeAxis(source.contrast, parent?.source.contrast, environment.contrast),
		motion: selectThemeAxis(source.motion, parent?.source.motion, environment.motion)
	};
	const key = `${parent?.fingerprint ?? ''}/${effective.appearance}/${effective.contrast}/${effective.motion}`;
	let cache = resolutions.get(definition);
	if (!cache) resolutions.set(definition, (cache = new Map()));
	let theme = cache.get(key);
	if (!theme) {
		theme = resolveTheme({ source, parent, environment });
		cache.set(key, theme);
	}
	return theme;
}

/** Scope-owned CSS and requested preferences; CSS selection never depends on client activation. */
export type ThemeScopePresentation = Readonly<{
	preferences: ThemePreferences;
	/** Known before activation only when appearance does not depend on browser preferences. */
	appearance: ThemeAppearance | undefined;
	id: string;
	style: string;
	css: string;
}>;

/**
 * Emits media-query branches for the three independent system axes. Constant tokens stay inline;
 * variable tokens use scope-local CSS aliases. Every combined branch corrects the preceding cascade,
 * including values that must reset to their baseline. Explicit axes naturally omit identical rules.
 * @exact pure
 */
export function createThemeScopePresentation(
	definition: ThemeScopeDefinition
): ThemeScopePresentation {
	const themes = Array.from({ length: 8 }, (_, mask) =>
		resolveThemeScope(definition, preferencesForMask(mask))
	);
	const variables = themes.map((theme) => ({
		...serializeThemeVariables(theme),
		'color-scheme': theme.source.appearance as string
	}));
	const base = variables[0]!;
	const varying = Object.keys(base).filter((name) =>
		variables.some(
			(values) => values[name as keyof typeof base] !== base[name as keyof typeof base]
		)
	) as Array<keyof typeof base>;
	// Resolved fingerprints contain only URL-safe characters, so the selector cannot contain authored CSS.
	const id = themes.map((theme) => theme.fingerprint).join('-');
	const selector = `[data-exact-theme-css="${id}"]`;
	const inline = { ...base };
	for (const name of varying) inline[name] = `var(${mediaVariable(name)})`;
	const declarations: Array<Map<string, string>> = [];
	const rules: string[] = [];
	for (let mask = 0; mask < 8; mask++) {
		const emitted = new Map<string, string>();
		for (const name of varying) {
			let previous: string | undefined;
			for (let prior = 0; prior < mask; prior++)
				if ((prior & mask) === prior && declarations[prior]!.has(name))
					previous = declarations[prior]!.get(name);
			const next = variables[mask]![name];
			if (next !== previous) emitted.set(name, next);
		}
		declarations.push(emitted);
		if (!emitted.size) continue;
		const body = `${selector}{${[...emitted].map(([name, value]) => `${mediaVariable(name)}:${value}`).join(';')}}`;
		const media = mediaForMask(mask);
		rules.push(media ? `@media ${media}{${body}}` : body);
	}
	return Object.freeze({
		preferences: requestedPreferences(definition),
		appearance:
			themes[0]!.source.appearance === themes[1]!.source.appearance
				? themes[0]!.source.appearance
				: undefined,
		id,
		style: themeStyleAttribute(inline),
		// Keep style text safe in both parsed HTML and DOM text insertion.
		css: rules.join('').replace(/</g, '\\3c ')
	});
}

function mediaVariable(name: string): string {
	return name === 'color-scheme'
		? '--exact-theme-media-color-scheme'
		: name.replace('--exact-theme-', '--exact-theme-media-');
}

function preferencesForMask(mask: number): ThemeSystemPreferences {
	return {
		appearance: mask & 1 ? 'dark' : 'light',
		contrast: mask & 2 ? 'more' : 'standard',
		motion: mask & 4 ? 'reduced' : 'full'
	};
}

function mediaForMask(mask: number): string {
	return [
		mask & 1 ? '(prefers-color-scheme: dark)' : '',
		mask & 2 ? '(prefers-contrast: more)' : '',
		mask & 4 ? '(prefers-reduced-motion: reduce)' : ''
	]
		.filter(Boolean)
		.join(' and ');
}

/** Retains inherited system choices instead of inheriting a parent's temporary resolved appearance. */
function requestedPreferences(definition: ThemeScopeDefinition): ThemePreferences {
	const parent = definition.parent ? requestedPreferences(definition.parent) : undefined;
	const choose = <T extends string>(
		value: T | 'inherit' | undefined,
		inherited: T | undefined
	): T | 'system' => (value === undefined || value === 'inherit' ? (inherited ?? 'system') : value);
	return Object.freeze({
		appearance: choose(definition.source.appearance, parent?.appearance),
		contrast: choose(definition.source.contrast, parent?.contrast),
		motion: choose(definition.source.motion, parent?.motion)
	});
}
