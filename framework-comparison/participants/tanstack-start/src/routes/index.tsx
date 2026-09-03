import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: EmptyRoute });

/** Leaves rendering to the route-stable root workspace. */
function EmptyRoute() {
	return null;
}
