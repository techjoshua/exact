import {
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactRuntimeInspectionEvent
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
	const hosts: Array<Readonly<{ key: string; events: readonly ExactRuntimeInspectionEvent[] }>> = [
		{ key: CLIENT_HOST, events: options.events.query(cursors.get(CLIENT_HOST), filter) }
	];
	const limit = Math.min(request.params?.page?.limit ?? 100, maximum);
	const selected: ExactRuntimeInspectionEvent[] = [];
	const indexes = new Map(hosts.map((host) => [host.key, 0]));
	while (selected.length < limit) {
		let progressed = false;
		for (const host of hosts) {
			const index = indexes.get(host.key) ?? 0;
			const event = host.events[index];
			if (!event || selected.length >= limit) continue;
			selected.push(event);
			indexes.set(host.key, index + 1);
			cursors.set(host.key, event.cursor);
			progressed = true;
		}
		if (!progressed) break;
	}
	const hasMore = hosts.some((host) => (indexes.get(host.key) ?? 0) < host.events.length);
	const nextCursor =
		selected.length || hasMore ? joinHostCursors(cursors) : request.params?.page?.cursor;
	return successfulInspectionResponse(
		request,
		options.sessionId,
		Object.freeze(selected),
		nextCursor
	);
}
