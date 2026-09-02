import { render } from '@exactjs/dom/root';
import { hydrateAfterNavigation, readPublishedRootProps } from '@exactjs/hydrate/root';
import { IncidentApp } from './IncidentApp.jsx';
import type { InitialData } from './types.js';
import './styles.css';

const profileEvents: Window['__exactComparisonProfileEvents'] = __EXACT_COMPARISON_PROFILE__
	? []
	: undefined;
if (profileEvents) window.__exactComparisonProfileEvents = profileEvents;
const profileOptions = profileEvents
	? { onProfile: (event: (typeof profileEvents)[number]) => profileEvents.push(event) }
	: undefined;

const root = document.getElementById('app');
if (!root) throw new Error('Missing incident application root');

const published = readPublishedRootProps<{
	initialData?: InitialData;
	path?: string;
}>(IncidentApp, root);
const app = <IncidentApp {...published} />;
if (root.childNodes.length > 0) void hydrateAfterNavigation(app, root, profileOptions);
else render(app, root, profileOptions);
