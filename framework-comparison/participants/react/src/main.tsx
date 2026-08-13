import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { IncidentApp } from './IncidentApp.js';
import type { InitialData } from './types.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing incident application root');

const initialData = readInitialData();
const app = (
	<StrictMode>
		<IncidentApp initialData={initialData} path={window.location.pathname} />
	</StrictMode>
);
if (root.childNodes.length > 0) hydrateRoot(root, app);
else createRoot(root).render(app);

function readInitialData(): InitialData | undefined {
	const node = document.getElementById('comparison-data');
	return node?.textContent ? (JSON.parse(node.textContent) as InitialData) : undefined;
}
