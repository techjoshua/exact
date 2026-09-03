import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRoute,
	useRouterState
} from '@tanstack/react-router';
import { IncidentApp } from '../IncidentApp.js';
import { loadIncidentData } from '../service-client.js';
import '../styles.css';

export const Route = createRootRoute({
	loader: () => loadIncidentData(),
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
			{ name: 'framework-participant', content: 'tanstack-start' },
			{ title: 'Signal Desk · TanStack Start' }
		]
	}),
	component: RootDocument
});

/** Owns the complete Start document and its route-stable incident workspace. */
function RootDocument() {
	const initialData = Route.useLoaderData();
	const path = useRouterState({ select: (state) => state.location.pathname });
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<IncidentApp initialData={initialData} path={path} />
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
}
