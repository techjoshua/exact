import { render } from '@exactjs/dom/root';
import { hydrateAfterNavigation, readPublishedRootProps } from '@exactjs/hydrate/root';
import { IncidentApp } from './IncidentApp.jsx';
import type { InitialData } from './types.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing incident application root');

const published = readPublishedRootProps<{
	initialData?: InitialData;
	path?: string;
}>(root);
const app = <IncidentApp {...published} />;
if (root.childNodes.length > 0) void hydrateAfterNavigation(app, root);
else render(app, root);
