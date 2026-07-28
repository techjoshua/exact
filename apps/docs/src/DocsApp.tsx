import type { Component } from '@exactjs/core';
import { Route, Router, type LocationSource } from '@exactjs/router';
import { DocsLayout } from './components/DocsLayout.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import { docPages } from './docs-manifest.js';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

type DocsAppProps = { source?: LocationSource };

/** Composes theme, router, shared layout, and manifest-driven documentation routes. */
export function DocsApp(this: Component<{}>, props: DocsAppProps = {}) {
	return () => (
		<ThemeProvider>
			<Router mode="hash" source={props.source}>
				<Route component={DocsLayout}>
					{docPages.map((page) =>
						page.path === '/' ? (
							<Route index component={page.component} />
						) : (
							<Route path={page.path.slice(1)} component={page.component} />
						)
					)}
					<Route path="*" component={NotFoundPage} />
				</Route>
			</Router>
		</ThemeProvider>
	);
}
