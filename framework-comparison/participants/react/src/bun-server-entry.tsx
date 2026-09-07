import { renderToReadableStream } from 'react-dom/server';
import { IncidentApp } from './IncidentApp.js';
import type { InitialData } from './types.js';

/** Streams the complete controlled document using React 19's Bun renderer. */
export async function renderParticipantBunResponse(
	initialData: InitialData,
	path: string,
	signal?: AbortSignal
) {
	const serialized = JSON.stringify(initialData).replaceAll('<', '\\u003c');
	const stream = await renderToReadableStream(
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="framework-participant" content="react" />
				<title>Incident Operations</title>
			</head>
			<body>
				<div id="app" data-render-mode="ssr">
					<IncidentApp initialData={initialData} path={path} />
				</div>
				<script
					id="comparison-data"
					type="application/json"
					dangerouslySetInnerHTML={{ __html: serialized }}
				/>
			</body>
		</html>,
		{ signal }
	);
	return new Response(stream, {
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
}
