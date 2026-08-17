import { createConsoleLogger } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { _ } from '@exactjs/jsx';
import { AppBoundary } from './components/AppBoundary.jsx';
import { Workbench } from './components/Workbench.jsx';
import './styles.css';

const logger = createConsoleLogger({ level: 'debug' });

render(
	<_ theme:scope theme:tonic="blue" theme:temperament="restrained" theme:density="compact">
		<AppBoundary logger={logger}>
			<Workbench logger={logger} />
		</AppBoundary>
	</_>,
	document.getElementById('app')!,
	{ logger }
);
