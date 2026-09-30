import type { Child } from '@exactjs/core';
import { documentOutput } from '@exactjs/core/document';
import type { DocumentAssets } from '@exactjs/ssr';

/** Trusted build-generated asset tags used by the application document. */
export type DocumentOptions = { clientTags?: string };

/** Server document renders build assets around the requested application. */
export function Document(props: DocumentOptions & { children?: Child }) {
	return () => (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta name="framework-participant" content="exact" />
				<title>Incident Operations</title>
				{documentOutput.styles}
			</head>
			<body>
				<div id="app" data-render-mode="ssr">
					{props.children}
				</div>
				{documentOutput.hydrationData}
				{documentOutput.bootstrap}
			</body>
		</html>
	);
}

function scriptSources(tags = ''): string[] {
	return Array.from(tags.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), (match) => match[1]!);
}

function stylesheetSources(tags = ''): string[] {
	return Array.from(tags.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g), (match) => match[1]!);
}

/** Supplies build-owned assets through the shared SSR loading policy. */
export function documentAssets(tags?: string): DocumentAssets {
	return {
		styles: stylesheetSources(tags),
		bootstrap: scriptSources(tags).map((src) => ({ src }))
	};
}
