/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import {
	composedDocument as serverDocument,
	explicitSlotsDocument as serverSlots
} from './test-support/document-composition.fixtures.js?exact-target=server';
import {
	composedDocument as clientDocument,
	explicitSlotsDocument as clientSlots
} from './test-support/document-composition.fixtures.js';

it.each([
	['composed shell', serverDocument, clientDocument, 'about:legacy-compat'],
	['explicit slots', serverSlots, clientSlots, '']
] as const)(
	'adopts %s and preserves reactive document fields and assets',
	async (_name, server, browser, systemId) => {
		const rendered = await renderToHydratableString(server, {
			documentAssets: { styles: ['/app.css'], bootstrap: [{ src: '/app.js' }] }
		});
		document.open();
		document.write(rendered.htmlWithHydration);
		document.close();
		const button = document.querySelector('button')!;
		const title = document.querySelector('title');
		const stylesheet = document.querySelector('link');
		const declaration = document.doctype;
		const client = hydrate(browser, document, { onMismatch: 'throw' });
		try {
			expect(document.doctype?.name).toBe('html');
			expect(document.doctype?.systemId).toBe(systemId);
			expect(document.doctype).toBe(declaration);
			expect(document.querySelector('button')).toBe(button);
			button.click();
			flushSync();
			expect(document.title).toBe('Count 2');
			expect(document.querySelector('title')).toBe(title);
			expect(document.documentElement.lang).toBe('fr');
			expect(document.body.classList.contains('dark')).toBe(true);
			expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
				'black'
			);
			expect(document.querySelector('link')).toBe(stylesheet);
			expect(document.querySelectorAll('script[src="/app.js"]')).toHaveLength(1);
		} finally {
			client.dispose();
			document.open();
			document.write('<!doctype html><html><head></head><body></body></html>');
			document.close();
		}
	}
);
