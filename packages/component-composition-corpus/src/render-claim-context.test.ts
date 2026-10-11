import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { claimContextRoot } from './test-support/render-claim-context.fixtures.js';
import { claimContextRoot as serverRoot } from './test-support/render-claim-context.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'claims deep contextual integration children during %s',
	async (mode) => {
		const host = document.createElement('div');
		try {
			if (mode === 'hydrate') {
				const rendered = await renderToHydratableString(serverRoot('ready'));
				host.innerHTML = rendered.html;
				const retained = host.querySelector('[title]');
				hydrate(claimContextRoot('ready'), host, {
					resumptions: rendered.resumptions,
					onMismatch: 'throw'
				});
				expect(host.querySelector('[title]')).toBe(retained);
			} else render(claimContextRoot('ready'), host);
			const leaves = [...host.querySelectorAll('[title]')];
			expect(leaves).toHaveLength(2);
			for (const leaf of leaves) {
				expect(leaf.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
				expect(leaf.textContent).toBe('ready');
			}
		} finally {
			unmount(host);
		}
	}
);
