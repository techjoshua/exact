import {
	attachExactObservationOwner,
	readExactObservationOwner
} from '@exactjs/core/framework/inspection-transport';
import {
	exactResponseToFetchResponse,
	type ExactRequestLike,
	type ExactResponseLike
} from '@exactjs/server';
import type { FetchLike } from '@exactjs/hydrate';
/** Connects the in-memory server and client, retaining an optional recorder owner without adding wire fields. */
export function createClientServerTransport(
	handle: (request: ExactRequestLike) => ExactResponseLike | Promise<ExactResponseLike>
): FetchLike {
	return async (url, init) => {
		let body: unknown;
		try {
			body = JSON.parse(init.body);
		} catch {
			body = init.body;
		}
		const request = attachExactObservationOwner(
			{
				method: init.method,
				url,
				headers: init.headers,
				body,
				text: async () => init.body,
				json: async () => body,
				signal: init.signal
			},
			readExactObservationOwner(init)
		);
		return exactResponseToFetchResponse(await handle(request));
	};
}
