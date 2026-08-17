import type { Child, Component } from '@exactjs/core';
import { _ } from '@exactjs/jsx';
import {
	isThemePreference,
	ThemeContext,
	type ThemeContextValue,
	type ThemePreference
} from './theme-context.js';

function persistTheme(preference: ThemePreference) {
	if (preference === 'system') {
		localStorage.removeItem('exact-docs-theme');
		return;
	}

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

	return () => (
		<_
			theme:scope
			theme:appearance={this.state.preference}
			theme:tonic="teal"
			theme:temperament="restrained"
		>
			{props.children}
		</_>
	);
}
