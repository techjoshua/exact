import {
	type ExactInspectionRequest,
	type ExactInspectionResponse
} from '@exactjs/devtools-protocol';
import type { ExactClientQueryServiceOptions } from '../query-service.js';
import { CLIENT_HOST, joinHostCursors, splitHostCursors } from './hosts.js';
import { successfulInspectionResponse } from './response.js';

/** Pages the browser-owned timeline that already aggregates client and per-response server events. */
export async function mergedTimeline(
	request: ExactInspectionRequest,
	options: ExactClientQueryServiceOptions,
	maximum: number,
	errorsOnly = false
): Promise<ExactInspectionResponse> {
	const cursors = splitHostCursors(request.params?.page?.cursor);
	const filter = errorsOnly
		? { ...request.params?.filter, kinds: ['error'] }
		: request.params?.filter;
	const events = options.events.query(cursors.get(CLIENT_HOST), filter);
	const limit = Math.min(request.params?.page?.limit ?? 100, maximum);
	const selected = events.slice(0, limit);
	const last = selected.at(-1);
	if (last) cursors.set(CLIENT_HOST, last.cursor);
	const nextCursor =
		selected.length || events.length > selected.length
			? joinHostCursors(cursors)
			: request.params?.page?.cursor;
	return successfulInspectionResponse(request, options.sessionId, selected, nextCursor);
}
