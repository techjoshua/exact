import { createContext, type Component } from '@exactjs/core';
import type { ThemeAppearancePreference } from '@exactjs/theme';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The compiler consumes the attributed JSX namespace.
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };

type AppearanceControl = {
	readonly appearance: ThemeAppearancePreference;
	choose(value: ThemeAppearancePreference): void;
};
const AppearanceContext = createContext<AppearanceControl>('app.appearance');

/** Owns the scope preference and shares descendant controls without mutating resolved theme data. */
export function AppTheme(this: Component<{ appearance: ThemeAppearancePreference }>) {
	this.state.appearance = 'system';
	const owner = this;
	this.setContext(AppearanceContext, {
		get appearance() {
			return owner.state.appearance;
		},
		choose: (value) => {
			owner.state.appearance = value;
		}
	});
	return () => (
		<main theme:scope theme:appearance={this.state.appearance}>
			<AppearanceButtons />
		</main>
	);
}

function AppearanceButtons(this: Component<{}>) {
	const preference = this.getContext(AppearanceContext);
	return () => (
		<>
			<button
				type="button"
				aria-pressed={preference.appearance === 'light'}
				onClick={() => preference.choose('light')}
			>
				Light
			</button>
			<button
				type="button"
				aria-pressed={preference.appearance === 'dark'}
				onClick={() => preference.choose('dark')}
			>
				Dark
			</button>
		</>
	);
}
