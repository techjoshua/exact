import { exactResponseToFetchResponse } from '@exactjs/server';
import {
	createCompiledDocumentReceipt as composeDocument,
	createCompiledIntrinsicReceipt as element
} from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString, renderToHydratableProgressiveHtmlResponse } from '@exactjs/ssr';

/** Serves the same bootstrap loading contract from each native runtime adapter. */
export async function bootstrapLoadingResponse(request) {
	const url = new URL(request.url);
	if (url.pathname === '/bootstrap-code.js') {
		const code = bootstrapCode(url.searchParams.get('part'));
		return new Response(code, { headers: { 'content-type': 'text/javascript' } });
	}
	if (url.pathname !== '/bootstrap-page') return;
	const loading = url.searchParams.get('loading');
	const integrity = loading?.startsWith('integrity')
		? 'sha256-' +
			btoa(
				String.fromCharCode(
					...new Uint8Array(
						await crypto.subtle.digest(
							'SHA-256',
							new TextEncoder().encode(
								loading === 'integrity' ? bootstrapCode('first') : 'incorrect'
							)
						)
					)
				)
			)
		: undefined;
	const options = {
		documentAssets: {
			nonce: 'acceptance',
			bootstrapLoading: url.searchParams.get('loading') === 'normal' ? 'normal' : 'after-load',
			bootstrap: [
				{
					src: '/bootstrap-code.js?part=first',
					...(integrity ? { integrity, crossOrigin: 'use-credentials' } : {})
				},
				{ src: '/bootstrap-code.js?part=second', type: 'classic' }
			]
		}
	};
	if (loading === 'single') options.documentAssets.bootstrap.pop();
	const operation = composeDocument(null, element('main', null, 'Server content'));
	const headers = {
		'content-type': 'text/html',
		'content-security-policy': "default-src 'self'; script-src 'nonce-acceptance' 'strict-dynamic'"
	};
	if (url.searchParams.has('stream'))
		return exactResponseToFetchResponse(
			await renderToHydratableProgressiveHtmlResponse(operation, { ...options, headers })
		);
	return new Response((await renderToHydratableString(operation, options)).htmlWithHydration, {
		headers
	});
}

/** Identical asset bytes are used for the response and the integrity digest. */
function bootstrapCode(part) {
	return `window.bootstrapEvents??=[];window.bootstrapEvents.push({part:${JSON.stringify(part)},state:document.readyState});`;
}
