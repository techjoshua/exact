import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

/** Creates one request- or browser-owned router for the Start application. */
export function getRouter() {
	return createRouter({ routeTree, scrollRestoration: true });
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
