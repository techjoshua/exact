import type { Component } from '@exactjs/core';
import { isThemePreference, ThemeContext } from './theme-context.js';

/** Renders the theme selector backed by the nearest documentation theme provider. */
export function ThemeControl(this: Component<{}>) {
	const theme = this.getContext(ThemeContext);

	return () => (
		<label className="theme-control">
			<span theme:text="supporting">Appearance</span>
			<select
				theme:field="subtle"
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
