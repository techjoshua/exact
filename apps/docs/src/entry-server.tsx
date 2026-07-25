import { createMemoryLocationSource } from '@exactjs/router';
import { renderToHydratableString } from '@exactjs/ssr';
import { DocsApp } from './DocsApp.jsx';
import { docPages } from './docs-manifest.js';

/** Renders the documentation root with hydration metadata for the standalone build. */
export function renderStatic(): string {
	const source = createMemoryLocationSource('https://exact.local/#/');
	return renderToHydratableString(<DocsApp source={source} />).htmlWithHydration;
}

/** Renders every configured documentation route so the standalone build catches broken route collection. */
export function renderStaticPages(): { path: string; html: string }[] {
	return docPages.map((page) => {
		const source = createMemoryLocationSource(`https://exact.local/#${page.path}`);
		return {
			path: page.path,
			html: renderToHydratableString(<DocsApp source={source} />).htmlWithHydration
		};
	});
}
