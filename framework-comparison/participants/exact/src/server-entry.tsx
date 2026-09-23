import { createExactBufferedResponse } from '@exactjs/server';
import {
	renderToHydratableString,
	renderToHydratableProgressiveHtmlStream,
	renderToHydratableProgressiveHtmlResponse,
	type RenderToStringOptions
} from '@exactjs/ssr';
import { Document, type DocumentOptions } from './Document.jsx';
import { IncidentApp } from './IncidentApp.jsx';
import type { InitialData } from './types.js';

/** Keeps host scheduling outside the authored document's serializable props. */
export type ParticipantRenderOptions = DocumentOptions &
	Pick<RenderToStringOptions, 'scheduleRender' | 'signal'>;

/** Uses the public progressive HTML API with the same authored document and root props. */
export function renderParticipantStream(
	initialData: InitialData,
	path: string,
	options?: ParticipantRenderOptions,
	signal?: AbortSignal
) {
	return renderToHydratableProgressiveHtmlStream(
		<IncidentApp initialData={initialData} path={path} />,
		{
			publishRootProps: true,
			signal,
			scheduleRender: options?.scheduleRender,
			documentShell: (application) => (
				<Document clientTags={options?.clientTags}>{application}</Document>
			)
		}
	);
}

/** Renders the authored document through eXact's normalization and hydration publication. */
export async function renderParticipant(
	initialData: InitialData,
	path: string,
	options?: ParticipantRenderOptions
) {
	return (await renderParticipantDocument(initialData, path, options)).htmlWithHydration;
}

/** Shares the statically analyzed SSR call without another promise just to extract its HTML. */
function renderParticipantDocument(
	initialData: InitialData,
	path: string,
	options?: ParticipantRenderOptions
) {
	return renderToHydratableString(<IncidentApp initialData={initialData} path={path} />, {
		publishRootProps: true,
		signal: options?.signal,
		scheduleRender: options?.scheduleRender,
		documentShell: (application) => (
			<Document clientTags={options?.clientTags}>{application}</Document>
		)
	});
}

/** Selects the public response API while keeping the authored component identical in both modes. */
export function renderParticipantResponse(
	initialData: InitialData,
	path: string,
	options?: ParticipantRenderOptions,
	mode: 'string' | 'stream' = 'string'
) {
	const headers = { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' };
	if (mode === 'stream')
		return renderToHydratableProgressiveHtmlResponse(
			<IncidentApp initialData={initialData} path={path} />,
			{
				publishRootProps: true,
				signal: options?.signal,
				scheduleRender: options?.scheduleRender,
				documentShell: (application) => (
					<Document clientTags={options?.clientTags}>{application}</Document>
				),
				headers
			}
		);
	return renderParticipantDocument(initialData, path, options).then((rendered) =>
		createExactBufferedResponse(200, headers, rendered.htmlWithHydration)
	);
}
