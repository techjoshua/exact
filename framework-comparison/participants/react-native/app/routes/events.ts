import type { LoaderFunctionArgs } from 'react-router';
import { incidentService } from '../service.server.js';

/** Streams domain transitions through a native React Router resource route. */
export function loader({ request }: LoaderFunctionArgs) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(': connected\n\n'));
			const release = incidentService.subscribe((event) => {
				controller.enqueue(
					encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.value)}\n\n`)
				);
			});
			request.signal.addEventListener(
				'abort',
				() => {
					release();
					controller.close();
				},
				{ once: true }
			);
		}
	});
	return new Response(stream, {
		headers: {
			'cache-control': 'no-cache, no-transform',
			'content-type': 'text/event-stream; charset=utf-8'
		}
	});
}
