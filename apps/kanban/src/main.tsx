import { createConsoleLogger } from '@exact/core';
import { render } from '@exact/dom';
import { AppBoundary } from './components/AppBoundary.jsx';
import { Board } from './components/Board.jsx';
import './styles.css';

const logger = createConsoleLogger({ level: 'debug' });

render(
	<AppBoundary logger={logger}>
		<Board logger={logger} />
	</AppBoundary>,
	document.getElementById('app')!,
	{ logger }
);
