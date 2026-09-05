import { createComponentRegistry, type Component } from '@exactjs/core';

const SpecializedDocsPages = createComponentRegistry(({ lazy }) => ({
	charts: lazy(() => import('./ChartsPage.jsx').then(({ ChartsPage }) => ChartsPage)),
	performance: lazy(() =>
		import('./PerformancePage.jsx').then(({ PerformancePage }) => PerformancePage)
	)
}));

/** Owns the finite lazy chart-guide selection at an ordinary native component boundary. */
export function ChartsDocsRoute(this: Component<{}>) {
	return () => <SpecializedDocsPages.charts />;
}

/** Owns the finite lazy performance-report selection at an ordinary native component boundary. */
export function PerformanceDocsRoute(this: Component<{}>) {
	return () => <SpecializedDocsPages.performance />;
}
