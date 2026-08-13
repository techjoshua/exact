import type { ActionFunctionArgs } from 'react-router';
import { incidentService } from '../service.server.js';

/** Restores deterministic native state between correctness and measurement scenarios. */
export async function action({ request }: ActionFunctionArgs) {
	const body = (await request.json().catch(() => ({}))) as { empty?: boolean };
	incidentService.reset({ empty: body.empty === true });
	return new Response(null, { status: 204 });
}
