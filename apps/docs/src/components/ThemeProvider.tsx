import type { Child, Component } from '@exactjs/core';
import {
	isThemePreference,
	ThemeContext,
	type ThemeContextValue,
	type ThemePreference
} from './theme-context.js';

function persistTheme(preference: ThemePreference) {
	if (preference === 'system') {
		document.documentElement.removeAttribute('data-theme');
		localStorage.removeItem('exact-docs-theme');
		return;
	}

	document.documentElement.dataset.theme = preference;
	localStorage.setItem('exact-docs-theme', preference);
}

/** Owns theme persistence and provides the reactive preference to descendants. */
export function ThemeProvider(
	this: Component<{ preference: ThemePreference }>,
	props: { children?: Child | Child[] }
) {
	this.state.preference = 'system';
	const state = this.state;
	const theme: ThemeContextValue = {
		get preference() {
			return state.preference;
		},
		setPreference(preference) {
			state.preference = preference;
			persistTheme(preference);
		}
	};
	this.setContext(ThemeContext, theme);

	this.onMount(() => {
		const stored = localStorage.getItem('exact-docs-theme');
		if (stored && isThemePreference(stored)) theme.setPreference(stored);
	});

	return () => props.children;
}
