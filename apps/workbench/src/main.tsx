import { createConsoleLogger } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { AppBoundary } from './components/AppBoundary.jsx';
import { Workbench } from './components/Workbench.jsx';
import './styles.css';

const logger = createConsoleLogger({ level: 'debug' });

render(
	<AppBoundary logger={logger}>
		<Workbench logger={logger} />
	</AppBoundary>,
	document.getElementById('app')!,
	{ logger }
);
