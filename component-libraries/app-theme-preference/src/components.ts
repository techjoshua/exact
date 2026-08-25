import { createContext, createVNode, type Child, type Component, type VNode } from '@exactjs/core';
import {
	parseStoredThemeAppearance,
	persistThemeAppearance,
	resolveThemeAppearance,
	themeAppearanceStorageKey,
	toggleThemeAppearance,
	type EffectiveThemeAppearance,
	type ThemeAppearancePreference
} from './preference.js';

type ThemePreferenceState = {
	preference: ThemeAppearancePreference;
	systemAppearance: EffectiveThemeAppearance;
};

/** Reactive appearance value exposed to an application-owned theme scope. */
export type ThemePreferenceContextValue = {
	readonly appearance: EffectiveThemeAppearance;
	toggleAppearance(): void;
};

/** Shared context consumed by repository application theme roots. */
export const ThemePreferenceContext = createContext<ThemePreferenceContextValue>(
	'exact.app-theme-preference'
);

/** Renders the icon representing the appearance a click will activate. */
export function ThemeModeToggle(
	this: Component<Record<string, never>>,
	props: { appearance: EffectiveThemeAppearance; onToggle(): void }
) {
	return () => renderThemeModeToggle(props);
}

/** @exact pure */
function renderThemeModeToggle(props: {
	appearance: EffectiveThemeAppearance;
	onToggle(): void;
}): VNode {
	const target = props.appearance === 'dark' ? 'light' : 'dark';
	return createVNode(
		'button',
		{
			className: 'exact-app-theme-toggle',
			type: 'button',
			'aria-label': `Switch to ${target} mode`,
			title: `Switch to ${target} mode`,
			onClick: props.onToggle
		},
		props.appearance === 'dark' ? sunIcon() : moonIcon()
	);
}

/** Owns system tracking, shared persistence, theme publication, and the repository-app toggle. */
export function ThemePreferenceProvider(
	this: Component<ThemePreferenceState>,
	props: { children?: Child | Child[] }
) {
	this.state.preference = 'system';
	this.state.systemAppearance = 'light';

	const effectiveAppearance = () =>
		resolveThemeAppearance(this.state.preference, this.state.systemAppearance);
	const applyPreference = (preference: ThemeAppearancePreference) => {
		this.state.preference = preference;
		persistThemeAppearance(preference);
	};
	const toggle = () => {
		applyPreference(toggleThemeAppearance(effectiveAppearance(), this.state.systemAppearance));
	};
	const state = this.state;
	this.setContext(ThemePreferenceContext, {
		get appearance() {
			return resolveThemeAppearance(state.preference, state.systemAppearance);
		},
		toggleAppearance: toggle
	});

	this.onMount(({ signal }) => {
		const query = matchMedia('(prefers-color-scheme: dark)');
		const syncSystem = () => {
			this.state.systemAppearance = query.matches ? 'dark' : 'light';
		};
		const syncStorage = (event: StorageEvent) => {
			if (event.key === themeAppearanceStorageKey) {
				this.state.preference = parseStoredThemeAppearance(event.newValue);
			}
		};
		syncSystem();
		this.state.preference = parseStoredThemeAppearance(
			localStorage.getItem(themeAppearanceStorageKey)
		);
		query.addEventListener('change', syncSystem, { signal });
		window.addEventListener('storage', syncStorage, { signal });
	});

	return () => createVNode('div', {}, ...childrenOf(props.children));
}

/** @exact pure */
function childrenOf(children: Child | Child[] | undefined): Child[] {
	return children === undefined ? [] : Array.isArray(children) ? children : [children];
}

/** @exact pure */
function sunIcon(): VNode {
	return createVNode(
		'svg',
		{ viewBox: '0 0 24 24', 'aria-hidden': 'true' },
		createVNode('circle', { cx: '12', cy: '12', r: '3.5' }),
		createVNode('path', {
			d: 'M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42'
		})
	);
}

/** @exact pure */
function moonIcon(): VNode {
	return createVNode(
		'svg',
		{ viewBox: '0 0 24 24', 'aria-hidden': 'true' },
		createVNode('path', { d: 'M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z' })
	);
}
