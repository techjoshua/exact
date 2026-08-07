import { createConsoleLogger } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { PuzzleGeneratorApp } from './PuzzleGeneratorApp.jsx';
import './styles.css';

render(<PuzzleGeneratorApp />, document.getElementById('app')!, {
	logger: createConsoleLogger({ level: 'warn' })
});
