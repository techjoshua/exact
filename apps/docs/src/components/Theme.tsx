import { createContext, type Child, type Component } from '@exactjs/core';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextValue = {
	readonly preference: ThemePreference;
	setPreference(preference: ThemePreference): void;
};

export const ThemeContext = createContext<ThemeContextValue>('exact.docs.theme');

function isThemePreference(value: string): value is ThemePreference {
	return value === 'system' || value === 'light' || value === 'dark';
}

function persistTheme(preference: ThemePreference) {
	if (preference === 'system') {
		document.documentElement.removeAttribute('data-theme');
		localStorage.removeItem('exact-docs-theme');
		return;
	}

	document.documentElement.dataset.theme = preference;
	localStorage.setItem('exact-docs-theme', preference);
}

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

export function ThemeControl(this: Component<{}>) {
	const theme = this.getContext(ThemeContext);

	return () => (
		<label className="theme-control">
			<span>Appearance</span>
			<select
				value={theme.preference}
				onChange={(event) => {
					const preference = event.currentTarget.value;
					if (isThemePreference(preference)) theme.setPreference(preference);
				}}
			>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</label>
	);
}
