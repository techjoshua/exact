import { createConsoleLogger, type Component } from '@exactjs/core';
import {
	ThemeModeToggle,
	ThemePreferenceContext,
	ThemePreferenceProvider
} from '@exactjs/app-theme-preference';
import { render } from '@exactjs/dom';
import { AppBoundary } from './components/AppBoundary.jsx';
import { Workbench } from './components/Workbench.jsx';
import './styles.css';

const logger = createConsoleLogger({ level: 'debug' });

function ThemedApplication(this: Component<Record<string, never>>) {
	const preference = this.getContext(ThemePreferenceContext);
	return () => (
		<div
			className="app-theme"
			theme:scope
			theme:appearance={preference.appearance}
			theme:tonic="blue"
			theme:temperament="restrained"
			theme:density="compact"
		>
			<ThemeModeToggle
				appearance={preference.appearance}
				onToggle={() => preference.toggleAppearance()}
			/>
			<AppBoundary logger={logger}>
				<Workbench logger={logger} />
			</AppBoundary>
		</div>
	);
}

render(
	<ThemePreferenceProvider>
		<ThemedApplication />
	</ThemePreferenceProvider>,
	document.getElementById('app')!,
	{ logger }
);
