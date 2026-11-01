import { ThemeResolutionError } from './errors.js';
import { copyThemeData } from './observations.js';
import type {
	ResolvedTheme,
	ThemeAppearance,
	ThemePreferences,
	ThemeScopeDefinition,
	ThemeSource,
	ThemeSystemPreferences
} from './contracts.js';
import { resolveThemeData, serializeThemeVariables } from './resolver.js';
import { themeStyleAttribute } from './overrides.js';
import { observeResolvedTheme, resolvedThemeReuseIdentity } from './resolution-cache.js';

const presentations: Array<{
	identities: readonly symbol[];
	presentation: ThemeScopePresentation;
}> = [];

/** Builds serializable ancestry without replacing system choices with a server fallback. @exact pure */
export function createThemeScopeDefinition(
	source: ThemeSource,
	parent?: ThemeScopeDefinition
): ThemeScopeDefinition {
	return { source: copyThemeData(source), ...(parent ? { parent } : {}) };
}

/** Resolves explicit host preferences with scope-owned lookup and bounded reuse of private palette data. @exact pure */
export function resolveThemeScope(
	definition: ThemeScopeDefinition,
	environment: ThemeSystemPreferences
): ResolvedTheme {
	return observeResolvedTheme(resolveThemeScopeData(scopeAncestry(definition), environment));
}

/** Captures ancestry once, rejecting cycles before any palette resolution or publication. */
function scopeAncestry(definition: ThemeScopeDefinition): ThemeScopeDefinition[] {
	const ancestry: ThemeScopeDefinition[] = [];
	const seen = new Set<ThemeScopeDefinition>();
	for (
		let current: ThemeScopeDefinition | undefined = definition;
		current;
		current = current.parent
	) {
		if (seen.has(current))
			throw new ThemeResolutionError(
				'invalid-source',
				'scope.parent',
				'Cyclic theme scope ancestry'
			);
		seen.add(current);
		ancestry.push(current);
	}
	if (!ancestry.length)
		throw new ThemeResolutionError(
			'invalid-source',
			'scope',
			'A theme scope definition is required'
		);
	return ancestry;
}

/** Reads validated private palettes without allocating public graphs for each CSS branch. */
function resolveThemeScopeData(
	ancestry: readonly ThemeScopeDefinition[],
	environment: ThemeSystemPreferences
): ResolvedTheme {
	let parent: ResolvedTheme | undefined;
	for (let index = ancestry.length - 1; index >= 0; index--)
		parent = resolveThemeData({ source: ancestry[index]!.source, parent, environment });
	return parent!;
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
	const ancestry = scopeAncestry(definition);
	const themes = Array.from({ length: 8 }, (_, mask) =>
		resolveThemeScopeData(ancestry, preferencesForMask(mask))
	);
	const preferences = requestedPreferences(ancestry);
	const identities = themes.map(resolvedThemeReuseIdentity);
	// Shared results contain no definition or component references. Compare all eight exact
	// resolutions and requested preferences, since relative and explicit choices can render the
	// same colors while exposing different context preferences. Keep at most 32 presentations.
	const cachedIndex = presentations.findIndex(
		(entry) =>
			entry.identities.every((identity, index) => identity === identities[index]) &&
			entry.presentation.preferences.appearance === preferences.appearance &&
			entry.presentation.preferences.contrast === preferences.contrast &&
			entry.presentation.preferences.motion === preferences.motion
	);
	if (cachedIndex >= 0) {
		const [entry] = presentations.splice(cachedIndex, 1);
		presentations.push(entry!);
		return copyThemeData(entry!.presentation);
	}
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
	const presentation = {
		preferences,
		appearance:
			themes[0]!.source.appearance === themes[1]!.source.appearance
				? themes[0]!.source.appearance
				: undefined,
		id,
		style: themeStyleAttribute(inline),
		// Keep style text safe in both parsed HTML and DOM text insertion.
		css: rules.join('').replace(/</g, '\\3c ')
	};
	if (identities.every((identity) => identity !== undefined)) {
		if (presentations.length === 32) presentations.shift();
		presentations.push({ identities, presentation: copyThemeData(presentation) });
	}
	return presentation;
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
function requestedPreferences(ancestry: readonly ThemeScopeDefinition[]): ThemePreferences {
	let preferences: ThemePreferences | undefined;
	const choose = <T extends string>(
		value: T | 'inherit' | undefined,
		inherited: T | undefined
	): T | 'system' => (value === undefined || value === 'inherit' ? (inherited ?? 'system') : value);
	for (let index = ancestry.length - 1; index >= 0; index--) {
		const source = ancestry[index]!.source;
		preferences = {
			appearance: choose(source.appearance, preferences?.appearance),
			contrast: choose(source.contrast, preferences?.contrast),
			motion: choose(source.motion, preferences?.motion)
		};
	}
	return preferences!;
}
