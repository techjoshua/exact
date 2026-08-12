import { renderToString } from 'react-dom/server';
import { IncidentApp } from './IncidentApp.js';
import type { InitialData } from './types.js';

/** Server-renders the React participant from one authoritative controlled-service snapshot. */
export function renderParticipant(initialData: InitialData, path: string) {
	return renderToString(<IncidentApp initialData={initialData} path={path} />);
}
