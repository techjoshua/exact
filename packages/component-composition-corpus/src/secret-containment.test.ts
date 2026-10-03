import {
	renderToHydratableString,
	renderToHydratableProgressiveHtmlStream,
	renderToStream
} from '@exactjs/ssr';
import type { Secret } from '@exactjs/secrets';
import { expect, it } from 'vitest';
import { secretContainmentRoot } from './test-support/secret-containment.fixtures.js?exact-target=server';

it('keeps server credentials out of buffered HTML and hydration records before client execution', async () => {
	const canary = 'PRIVATE-CREDENTIAL-buffered-8f729d';
	const rendered = await renderToHydratableString(secretContainmentRoot(canary as Secret<string>));
	expect(rendered.html).toContain('Authorized public result');
	expect(rendered.htmlWithHydration).not.toContain(canary);
	expect(rendered.hydrationScript).not.toContain(canary);
	expect(JSON.stringify(rendered.resumptions ?? [])).not.toContain(canary);
});

it.each(['stream', 'progressive'] as const)(
	'keeps server credentials out of every %s output chunk before client execution',
	async (mode) => {
		const canary = `PRIVATE-CREDENTIAL-${mode}-8f729d`;
		const root = secretContainmentRoot(canary as Secret<string>);
		const stream =
			mode === 'stream' ? renderToStream(root) : renderToHydratableProgressiveHtmlStream(root);
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let html = '';
		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				html += decoder.decode(chunk.value, { stream: true });
				expect(html).not.toContain(canary);
			}
			html += decoder.decode();
			expect(html).toContain('Authorized public result');
			expect(html).not.toContain(canary);
		} finally {
			await reader.cancel();
			reader.releaseLock();
		}
	}
);
