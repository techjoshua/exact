import { renderToHydratableString } from '@exactjs/ssr';
import { renderCompilerClosedToHydratableSink } from '@exactjs/ssr/runtime/compiler-closed';
import { IncidentApp } from './IncidentApp.jsx';
import type { InitialData } from './types.js';

/** Server-renders the eXact participant from one authoritative controlled-service snapshot. */
export function renderParticipant(initialData: InitialData, path: string) {
	return renderParticipantResult(initialData, path).htmlWithHydration;
}

/** Writes the compiler-closed root into an environment-owned response adapter. */
export function renderParticipantToSink(
	initialData: InitialData,
	path: string,
	write: (value: string) => void
): number {
	return renderCompilerClosedToHydratableSink(
		<IncidentApp initialData={initialData} path={path} />,
		write,
		{ publishRootProps: true }
	);
}

function renderParticipantResult(initialData: InitialData, path: string) {
	const rendered = renderToHydratableString(<IncidentApp initialData={initialData} path={path} />, {
		publishRootProps: true
	});
	return rendered;
}
