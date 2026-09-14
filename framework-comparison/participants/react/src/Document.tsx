import { IncidentApp } from './IncidentApp.js';
import type { InitialData } from './types.js';

/** Trusted build-generated asset tags inserted into this application's document head. */
export type DocumentOptions = { clientTags?: string };

/** Owns the complete React document on Node and Bun, including initial client data. */
export function Document({
	initialData,
	path,
	clientTags = ''
}: DocumentOptions & { initialData: InitialData; path: string }) {
	const serialized = JSON.stringify(initialData).replaceAll('<', '\\u003c');
	return (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta name="framework-participant" content="react" />
				<title>Incident Operations</title>
				{Array.from(clientTags.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), (match) => (
					<script key={match[1]} type="module" src={match[1]} />
				))}
				{Array.from(clientTags.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g), (match) => (
					<link key={match[1]} rel="stylesheet" href={match[1]} />
				))}
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
		</html>
	);
}
