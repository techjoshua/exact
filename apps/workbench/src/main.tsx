import { createConsoleLogger, type Component } from '@exactjs/core';
import {
	ThemeModeToggle,
	ThemePreferenceContext,
	ThemePreferenceProvider
} from '@exactjs/app-theme-preference';
import { render } from '@exactjs/dom';
import { _ } from '@exactjs/jsx';
import { AppBoundary } from './components/AppBoundary.jsx';
import { Workbench } from './components/Workbench.jsx';
import './styles.css';

const logger = createConsoleLogger({ level: 'debug' });

function ThemedApplication(this: Component<Record<string, never>>) {
	const preference = this.getContext(ThemePreferenceContext);
	return () => (
		<_
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
		</_>
	);
}

render(
	<ThemePreferenceProvider>
		<ThemedApplication />
	</ThemePreferenceProvider>,
	document.getElementById('app')!,
	{ logger }
);
