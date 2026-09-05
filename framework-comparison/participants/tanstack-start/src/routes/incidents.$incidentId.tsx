import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/incidents/$incidentId')({ component: EmptyRoute });

/** Leaves rendering to the route-stable root workspace. */
function EmptyRoute() {
	return null;
}
