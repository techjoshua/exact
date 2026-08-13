import { createReadableStreamFromReadable } from '@react-router/node';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter, type AppLoadContext, type EntryContext } from 'react-router';

/** Streams the native React Router document from the shared Node runtime. */
export default function handleRequest(
	request: Request,
	status: number,
	headers: Headers,
	context: EntryContext,
	_loadContext: AppLoadContext
): Promise<Response> | Response {
	if (request.method.toUpperCase() === 'HEAD') return new Response(null, { status, headers });
	return new Promise((resolve, reject) => {
		let rendered = false;
		const timeout = setTimeout(() => abort(), 6_000);
		const { pipe, abort } = renderToPipeableStream(
			<ServerRouter context={context} url={request.url} />,
			{
				onShellReady() {
					rendered = true;
					headers.set('content-type', 'text/html; charset=utf-8');
					headers.set('x-comparison-render', 'ssr');
					const body = new PassThrough({
						final(callback) {
							clearTimeout(timeout);
							callback();
						}
					});
					pipe(body);
					resolve(
						new Response(createReadableStreamFromReadable(body), {
							status,
							headers
						})
					);
				},
				onShellError: reject,
				onError(caught) {
					status = 500;
					if (rendered) console.error(caught);
				}
			}
		);
	});
}
