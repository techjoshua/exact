import { createConsoleLogger } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { _ } from '@exactjs/jsx';
import { PuzzleGeneratorApp } from './PuzzleGeneratorApp.jsx';
import './styles.css';

render(
	<_ theme:scope theme:tonic="amber" theme:temperament="soft">
		<PuzzleGeneratorApp />
	</_>,
	document.getElementById('app')!,
	{
		logger: createConsoleLogger({ level: 'warn' })
	}
);
