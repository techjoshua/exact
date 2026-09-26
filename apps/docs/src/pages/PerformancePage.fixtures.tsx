import type { Component } from '@exactjs/core';
import { Router, type RouteDefinition } from '@exactjs/router';
import { PerformancePage } from './PerformancePage.jsx';

/** Gives the performance article its navigation context. */
export function PerformancePageFixture(this: Component<{}>) {
	const routes: RouteDefinition[] = [{ path: '*', render: () => <PerformancePage /> }];
	return () => <Router routes={routes} />;
}
