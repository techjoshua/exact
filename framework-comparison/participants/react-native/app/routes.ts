import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('incidents/:incidentId', 'routes/workspace.tsx'),
	route('events', 'routes/events.ts'),
	route('__benchmark/reset', 'routes/reset.ts')
] satisfies RouteConfig;
