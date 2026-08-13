import { render } from '@exactjs/dom';
import { hydrateAfterNavigation } from '@exactjs/hydrate/root';
import { IncidentApp } from './IncidentApp.jsx';
import type { InitialData } from './types.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing incident application root');

const initialData = readInitialData();
const app = <IncidentApp initialData={initialData} path={window.location.pathname} />;
if (root.childNodes.length > 0) void hydrateAfterNavigation(app, root);
else render(app, root);

function readInitialData(): InitialData | undefined {
	const node = document.getElementById('comparison-data');
	return node?.textContent ? (JSON.parse(node.textContent) as InitialData) : undefined;
}
