import { createContext, peek, type Child, type Component, type ContextToken } from '@exactjs/core';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-abi';
import type {
	ResolvedTheme,
	ResolvedThemeSource,
	BuiltInTemperament,
	BuiltInThemeKey,
	ThemeAppearance,
	ThemeColor,
	ThemeContrast,
	ThemeSource,
	ThemeSurfaceBundle,
	ThemeSystemPreferences,
	ThemePreferences,
	ThemeScopeDefinition,
	TypographyPreset
} from './contracts.js';
import {
	createThemeScopeDefinition,
	createThemeScopePresentation,
	resolveThemeScope
} from './system-theme.js';

/** Getter-backed generated theme inherited by descendants. */
export type ThemeEnvironment = Readonly<{
	contract: 'exact-theme/1';
	get definition(): ThemeScopeDefinition;
	get preferences(): ThemePreferences;
	get system(): ThemeSystemPreferences | undefined;
	get source(): ResolvedThemeSource;
	get current(): ResolvedTheme;
	get revision(): number;
}>;
/** Getter-backed semantic surface depth inherited by nested surface labels. */
export type ThemeSurfaceEnvironment = Readonly<{ get bundle(): ThemeSurfaceBundle }>;

/** Global reactive context for exact-theme/1 derivation. */
export const ThemeContext: ContextToken<ThemeEnvironment> = createContext<ThemeEnvironment>(
	'@exactjs/theme',
	{ global: true, reactive: true, keep: 'shared' }
);
/** Global reactive context for semantic surface depth. */
export const ThemeSurfaceContext: ContextToken<ThemeSurfaceEnvironment> =
	createContext<ThemeSurfaceEnvironment>('@exactjs/theme.surface', {
		global: true,
		reactive: true,
		keep: 'shared'
	});

type ThemeState = {
	appearance: 'light' | 'dark';
	contrast: 'standard' | 'more';
	motion: 'full' | 'reduced';
	preferencesKnown: boolean;
};
type Children = { children?: Child | readonly Child[] };
/** Props selected by the root or nested `theme:scope` activator. */
export type ThemeScopeEnhancementProps = Children & {
	scope?: true;
	tonic?: 'inherit' | ThemeColor;
	temperament?: 'inherit' | BuiltInTemperament;
	appearance?: 'inherit' | 'system' | ThemeAppearance;
	density?: 'inherit' | 'compact' | 'comfortable' | 'spacious';
	shape?: 'inherit' | 'square' | 'soft' | 'round' | 'pill';
	depth?: 'inherit' | 'flat' | 'bordered' | 'elevated';
	typography?: 'inherit' | TypographyPreset;
	contrast?: 'inherit' | 'system' | ThemeContrast;
	motion?: 'inherit' | 'system' | 'full' | 'reduced';
	background?: 'canvas' | 'transparent';
	element?: 'div' | 'section' | 'article' | 'aside' | 'main';
};
/** Atomically publishes a reactive resolved theme through an enhancement-owned wrapper. */
export function ThemeScopeEnhancement(
	this: Component<ThemeState>,
	props: ThemeScopeEnhancementProps
) {
	const parent = this.hasContext(ThemeContext) ? this.getContext(ThemeContext) : undefined;
	// Reactive consumers begin from a deterministic reference theme. CSS independently selects the
	// browser preference before activation; system remains unknown until the client lifecycle runs.
	this.state.appearance = 'light';
	this.state.contrast = 'standard';
	this.state.motion = 'full';
	this.state.preferencesKnown = false;
	const state = this.state;
	const definition = this.reactive(() =>
		createThemeScopeDefinition(sourceFromProps(props), parent?.definition)
	);
	const presentation = this.reactive(() => createThemeScopePresentation(definition.get()));
	const resolved = this.reactive(() =>
		resolveThemeScope(definition.get(), {
			appearance: state.appearance,
			contrast: state.contrast,
			motion: state.motion
		})
	);
	const environment: ThemeEnvironment = peek(() =>
		Object.freeze({
			contract: 'exact-theme/1' as const,
			get definition() {
				return definition.get();
			},
			get preferences() {
				return presentation.get().preferences;
			},
			get system() {
				return state.preferencesKnown
					? { appearance: state.appearance, contrast: state.contrast, motion: state.motion }
					: undefined;
			},
			get source() {
				return resolved.get().source;
			},
			get current() {
				return resolved.get();
			},
			get revision() {
				return themeRevision(resolved.get().fingerprint);
			}
		})
	);
	this.setContext(ThemeContext, environment);
	this.setContext(
		ThemeSurfaceContext,
		Object.freeze({
			get bundle() {
				return 0 as const;
			}
		})
	);
	this.onMount(() => {
		const applyPreferences = (next: ThemeSystemPreferences) => {
			state.appearance = next.appearance;
			state.contrast = next.contrast;
			state.motion = next.motion;
			state.preferencesKnown = true;
		};
		applyPreferences(readSystemPreferences());
		return observeSystemPreferences(applyPreferences);
	});
	return () =>
		createCompiledIntrinsicReceipt(
			props.element ?? 'div',
			{
				'data-exact-theme': 'exact-theme/1',
				'data-exact-theme-appearance': environment.preferences.appearance,
				'data-exact-theme-contrast': environment.preferences.contrast,
				'data-exact-theme-motion': environment.preferences.motion,
				'data-exact-theme-css': presentation.get().id,
				'data-exact-theme-background': props.background ?? 'canvas',
				'data-exact-theme-fingerprint': environment.current.fingerprint,
				style: presentation.get().style
			},
			[
				createCompiledIntrinsicReceipt(
					'style',
					{ 'data-exact-theme-rules': '' },
					presentation.get().css
				),
				props.children
			]
		);
}

/** @exact pure */
function themeRevision(fingerprint: string): number {
	let revision = 2_166_136_261;
	for (let index = 0; index < fingerprint.length; index++) {
		revision ^= fingerprint.charCodeAt(index);
		revision = Math.imul(revision, 16_777_619);
	}
	return revision >>> 0;
}

/** @exact pure */
function sourceFromProps(props: ThemeScopeEnhancementProps): ThemeSource {
	return {
		keyColor:
			props.tonic === undefined || props.tonic === 'inherit'
				? undefined
				: typeof props.tonic === 'string' && isBuiltInThemeKey(props.tonic)
					? builtInThemeKeys[props.tonic]
					: props.tonic,
		temperament: props.temperament === 'inherit' ? undefined : props.temperament,
		appearance: props.appearance,
		density: props.density,
		shape: props.shape,
		depth: props.depth,
		typography: props.typography,
		contrast: props.contrast,
		motion: props.motion
	};
}

function isBuiltInThemeKey(value: string): value is BuiltInThemeKey {
	return Object.hasOwn(builtInThemeKeys, value);
}

/** CSS color values associated with the finite declarative key choices. */
export const builtInThemeKeys: Readonly<Record<BuiltInThemeKey, string>> = Object.freeze({
	teal: '#126e75',
	blue: '#2563eb',
	violet: '#7357d9',
	amber: '#b45309',
	rose: '#be185d',
	green: '#15803d'
});
/** @exact client */
function readSystemPreferences(): ThemeSystemPreferences {
	if (typeof globalThis.matchMedia !== 'function')
		return { appearance: 'light', contrast: 'standard', motion: 'full' };
	return {
		appearance: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
		contrast: matchMedia('(prefers-contrast: more)').matches ? 'more' : 'standard',
		motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
	};
}
/** @exact client */
function observeSystemPreferences(
	publish: (preferences: ThemeSystemPreferences) => void
): () => void {
	if (typeof globalThis.matchMedia !== 'function') return () => undefined;
	const queries = [
		'(prefers-color-scheme: dark)',
		'(prefers-contrast: more)',
		'(prefers-reduced-motion: reduce)'
	].map((query) => matchMedia(query));
	const update = () =>
		publish({
			appearance: queries[0]!.matches ? 'dark' : 'light',
			contrast: queries[1]!.matches ? 'more' : 'standard',
			motion: queries[2]!.matches ? 'reduced' : 'full'
		});
	for (const query of queries) query.addEventListener('change', update);
	return () => {
		for (const query of queries) query.removeEventListener('change', update);
	};
}
