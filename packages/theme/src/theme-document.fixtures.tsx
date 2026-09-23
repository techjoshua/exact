import { ThemeScopeEnhancement } from './components.js';

function ThemeDocument(props: { text: string }) {
	return () => (
		<ThemeScopeEnhancement scope tonic="teal" appearance="light">
			<div>
				<p>{props.text}</p>
			</div>
		</ThemeScopeEnhancement>
	);
}

/** Same-source fixture compiled independently for the client and server targets. */
export const themeDocumentRoot = (text: string) => <ThemeDocument text={text} />;

function SystemThemeDocument(
	this: import('@exactjs/core').Component<{ appearance: 'system' | 'light' }>
) {
	this.state.appearance = 'system';
	return () => (
		<ThemeScopeEnhancement scope appearance={this.state.appearance}>
			<button
				onclick={() => {
					this.state.appearance = this.state.appearance === 'system' ? 'light' : 'system';
				}}
			>
				Switch
			</button>
			<input value="Preserved" />
		</ThemeScopeEnhancement>
	);
}

/** Exercises system CSS through hydration and explicit runtime preference changes. */
export const systemThemeDocumentRoot = () => <SystemThemeDocument />;
