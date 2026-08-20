import { createConsoleLogger } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { SudokuApp } from './SudokuApp.jsx';
import { AppBoundary } from './components/AppBoundary.jsx';
import { registerSudokuServiceWorker } from './pwa-registration.js';
import './styles.css';
import './accessibility.css';

const logger = createConsoleLogger({ level: 'debug' });

render(
	<AppBoundary>
		<SudokuApp />
	</AppBoundary>,
	document.getElementById('app')!,
	{ logger }
);

registerSudokuServiceWorker();
