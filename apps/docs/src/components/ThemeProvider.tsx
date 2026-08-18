import type { Child, Component } from '@exactjs/core';
import {
	parseStoredThemeAppearance,
	persistThemeAppearance,
	resolveThemeAppearance,
	themeAppearanceStorageKey,
	toggleThemeAppearance,
	type EffectiveThemeAppearance
} from '@exactjs/app-theme-preference';
import { _ } from '@exactjs/jsx';
import { builtInTemperaments, builtInThemeKeys } from '@exactjs/theme';
import {
	type DocsThemeSettings,
	isThemePreference,
	ThemeContext,
	type ThemeContextValue,
	type ThemeSettingName
} from './theme-context.js';

const defaultSettings: DocsThemeSettings = {
	preference: 'system',
	tonic: 'blue',
	temperament: 'balanced',
	density: 'comfortable',
	shape: 'soft',
	depth: 'elevated',
	typography: 'humanist',
	contrast: 'system',
	motion: 'system'
};

const optionValues = {
	preference: ['system', 'light', 'dark'],
	tonic: builtInThemeKeys,
	temperament: builtInTemperaments,
	density: ['compact', 'comfortable', 'spacious'],
	shape: ['square', 'soft', 'round', 'pill'],
	depth: ['flat', 'bordered', 'elevated'],
	typography: ['system', 'humanist', 'geometric', 'editorial', 'monospace'],
	contrast: ['system', 'standard', 'more'],
	motion: ['system', 'full', 'reduced']
} as const;

function persistTheme(settings: Readonly<DocsThemeSettings>) {
	localStorage.setItem(
		'exact-docs-theme-settings',
		JSON.stringify({ ...settings, preference: 'system' })
	);
	localStorage.removeItem('exact-docs-theme');
}

function parseSettings(value: string | null): DocsThemeSettings | undefined {
	if (!value) return undefined;
	try {
		const candidate: unknown = JSON.parse(value);
		if (!candidate || typeof candidate !== 'object') return undefined;
		const record = candidate as Record<string, unknown>;
		const settings = { ...defaultSettings };
		for (const name of Object.keys(optionValues) as ThemeSettingName[]) {
			const field = record[name];
			if (typeof field !== 'string' || !(optionValues[name] as readonly string[]).includes(field)) {
				return undefined;
			}
			Object.assign(settings, { [name]: field });
		}
		return settings;
	} catch {
		return undefined;
	}
}

function applyRootColorScheme(preference: DocsThemeSettings['preference']) {
	const appearance =
		preference === 'system'
			? matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
			: preference;
	document.documentElement.style.colorScheme = appearance;
}

/** Owns theme persistence and provides the reactive preference to descendants. */
export function ThemeProvider(
	this: Component<DocsThemeSettings & { systemAppearance: EffectiveThemeAppearance }>,
	props: { children?: Child | Child[] }
) {
	Object.assign(this.state, defaultSettings);
	this.state.systemAppearance = 'light';
	const state = this.state;
	const theme: ThemeContextValue = {
		get settings() {
			return state;
		},
		get effectiveAppearance() {
			return resolveThemeAppearance(state.preference, state.systemAppearance);
		},
		setSetting(name, value) {
			Object.assign(state, { [name]: value });
			persistTheme(state);
			if (name === 'preference') {
				persistThemeAppearance(state.preference);
				applyRootColorScheme(state.preference);
			}
		},
		toggleAppearance() {
			const preference = toggleThemeAppearance(
				resolveThemeAppearance(state.preference, state.systemAppearance),
				state.systemAppearance
			);
			state.preference = preference;
			persistThemeAppearance(preference);
			persistTheme(state);
			applyRootColorScheme(preference);
		}
	};
	this.setContext(ThemeContext, theme);

	this.onMount(({ signal }) => {
		const stored = parseSettings(localStorage.getItem('exact-docs-theme-settings'));
		if (stored) {
			Object.assign(state, stored);
			if (!localStorage.getItem(themeAppearanceStorageKey) && stored.preference !== 'system') {
				persistThemeAppearance(stored.preference);
			}
		} else {
			const legacyPreference = localStorage.getItem('exact-docs-theme');
			if (legacyPreference && isThemePreference(legacyPreference)) {
				state.preference = legacyPreference;
				persistThemeAppearance(legacyPreference);
				persistTheme(state);
			}
		}

		state.preference = parseStoredThemeAppearance(localStorage.getItem(themeAppearanceStorageKey));
		const systemAppearance = matchMedia('(prefers-color-scheme: dark)');
		const syncSystemAppearance = () => {
			state.systemAppearance = systemAppearance.matches ? 'dark' : 'light';
			if (state.preference === 'system') applyRootColorScheme('system');
		};
		const syncStoredAppearance = (event: StorageEvent) => {
			if (event.key !== themeAppearanceStorageKey) return;
			state.preference = parseStoredThemeAppearance(event.newValue);
			applyRootColorScheme(state.preference);
		};
		systemAppearance.addEventListener('change', syncSystemAppearance, { signal });
		window.addEventListener('storage', syncStoredAppearance, { signal });
		syncSystemAppearance();
		applyRootColorScheme(state.preference);
		signal.addEventListener(
			'abort',
			() => document.documentElement.style.removeProperty('color-scheme'),
			{ once: true }
		);
	});

	return () => (
		<_
			theme:scope
			theme:appearance={this.state.preference}
			theme:tonic={this.state.tonic}
			theme:temperament={this.state.temperament}
			theme:density={this.state.density}
			theme:shape={this.state.shape}
			theme:depth={this.state.depth}
			theme:typography={this.state.typography}
			theme:contrast={this.state.contrast}
			theme:motion={this.state.motion}
		>
			{props.children}
		</_>
	);
}
