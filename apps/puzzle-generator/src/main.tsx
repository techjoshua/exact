import { createConsoleLogger, type Component } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { ThemePreferenceContext, ThemePreferenceProvider } from '@exactjs/app-theme-preference';
import { PuzzleGeneratorApp } from './PuzzleGeneratorApp.jsx';
import './styles.css';

function ThemedPuzzleFoundry(this: Component<Record<string, never>>) {
	const preference = this.getContext(ThemePreferenceContext);
	return () => (
		<div
			className="app-theme"
			theme:scope
			theme:appearance={preference.appearance}
			theme:tonic={preference.appearance === 'light' ? 'blue' : 'amber'}
			theme:temperament={preference.appearance === 'light' ? 'balanced' : 'soft'}
			theme:depth="elevated"
			theme:typography="humanist"
		>
			<PuzzleGeneratorApp />
		</div>
	);
}

render(
	<ThemePreferenceProvider>
		<ThemedPuzzleFoundry />
	</ThemePreferenceProvider>,
	document.getElementById('app')!,
	{
		logger: createConsoleLogger({ level: 'warn' })
	}
);
