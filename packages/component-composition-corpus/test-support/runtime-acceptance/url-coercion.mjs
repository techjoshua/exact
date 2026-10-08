import { changingUrl } from '../url-coercion.ts';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString, renderToHydratableProgressiveHtmlStream } from '@exactjs/ssr';

/** Publishes the checked conversion through the same native receipt in both rendering modes. */
export async function urlCoercionJourney() {
	const results = [];
	for (const method of ['primitive', 'string']) {
		for (const first of ['/safe?first=1&second=2', 'javascript:probe']) {
			for (const streaming of [false, true]) {
				const fixture = changingUrl(first, 'javascript:unchecked', method);
				const receipt = createCompiledIntrinsicReceipt('a', { href: fixture.value }, 'Link');
				const html = streaming
					? await new Response(
							renderToHydratableProgressiveHtmlStream(receipt, { markers: false })
						).text()
					: (await renderToString(receipt, { markers: false })).html;
				results.push({ first, method, streaming, html, calls: fixture.calls() });
			}
		}
	}
	return results;
}
