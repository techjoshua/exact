import type { Component } from '@exactjs/core';
import { Router, type LocationSource, type RouteDefinition } from '@exactjs/router';
import { DocsLayout } from './components/DocsLayout.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import { docPages } from './docs-manifest.js';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

type DocsAppProps = { source?: LocationSource };

/** Composes theme, router, shared layout, and manifest-driven documentation routes. */
export function DocsApp(this: Component<{}>, props: DocsAppProps = {}) {
	const pageRoutes: RouteDefinition[] = docPages.map((page) => {
		const Page = page.component;
		return {
			...(page.path === '/' ? { index: true } : { path: page.path.slice(1) }),
			render: () => <Page />
		};
	});
	const routes: RouteDefinition[] = [
		{
			render: (outlet) => <DocsLayout>{outlet}</DocsLayout>,
			children: [...pageRoutes, { path: '*', render: () => <NotFoundPage /> }]
		}
	];
	return () => (
		<ThemeProvider>
			<Router mode="hash" source={props.source} routes={routes} />
		</ThemeProvider>
	);
}
