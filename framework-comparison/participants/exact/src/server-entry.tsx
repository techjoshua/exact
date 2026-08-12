import { renderToHydratableString } from '@exactjs/ssr';
import { IncidentApp } from './IncidentApp.jsx';
import type { InitialData } from './types.js';

/** Server-renders the eXact participant from one authoritative controlled-service snapshot. */
export function renderParticipant(initialData: InitialData, path: string) {
	const rendered = renderToHydratableString(<IncidentApp initialData={initialData} path={path} />);
	return rendered.htmlWithHydration;
}
