import { builtInTemperaments } from './resolver.js';
import { ThemeScopeEnhancement, ThemeContext } from './components.js';

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

function CustomThemeDocument(this: import('@exactjs/core').Component<{ large: boolean }>) {
	this.state.large = false;
	return () => (
		<ThemeScopeEnhancement
			scope
			background={this.state.large ? 'canvas' : 'transparent'}
			typography={{ body: '"Example Sans", sans-serif', baseSizeRem: this.state.large ? 1.125 : 1 }}
			temperament={{ ...builtInTemperaments.soft, id: 'custom-soft' }}
			neutralColor="#666677"
			canvasColor="#fafafa"
			appearance="light"
			contrast="standard"
			motion="full"
		>
			<ThemeScopeEnhancement scope typography={{ display: 'Georgia, serif' }}>
				<button
					onclick={() => {
						this.state.large = !this.state.large;
					}}
				>
					Resize
				</button>
				<input value="Preserved" />
			</ThemeScopeEnhancement>
		</ThemeScopeEnhancement>
	);
}

/** Custom source fields survive SSR, hydration, and inherited updates. */
export const customThemeDocumentRoot = () => <CustomThemeDocument />;

function AppearanceReadout(this: import('@exactjs/core').Component<{}>) {
	const theme = this.getContext(ThemeContext);
	return () => (
		<output data-appearance={theme.appearance ?? 'unknown'}>{theme.preferences.appearance}</output>
	);
}

function InverseThemeDocument(this: import('@exactjs/core').Component<{ explicit: boolean }>) {
	this.state.explicit = false;
	return () => (
		<ThemeScopeEnhancement scope appearance={this.state.explicit ? 'dark' : 'system'}>
			<AppearanceReadout />
			<ThemeScopeEnhancement scope appearance="inverse">
				<AppearanceReadout />
				<ThemeScopeEnhancement scope>
					<AppearanceReadout />
					<input value="Retained" />
				</ThemeScopeEnhancement>
			</ThemeScopeEnhancement>
			<ThemeScopeEnhancement scope appearance="inverse-system">
				<AppearanceReadout />
			</ThemeScopeEnhancement>
			<button
				onclick={() => {
					this.state.explicit = !this.state.explicit;
				}}
			>
				Switch
			</button>
		</ThemeScopeEnhancement>
	);
}

/** Relative appearance scopes preserve live context, media selection, and descendant identity. */
export const inverseThemeDocumentRoot = () => <InverseThemeDocument />;
