import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import {
	composableProgramRoot,
	compositionOwner,
	compositionLifetime
} from './scenarios/composable-program.fixtures.js';
import { composableProgramRoot as serverRoot } from './scenarios/composable-program.fixtures.js?exact-target=server';

it.each([false, true])(
	'preserves inspected child ownership and hydration with derivation=%s',
	async (derive) => {
		for (const mode of ['mount', 'hydrate']) {
			const container = document.createElement('div');
			const created = compositionLifetime.created;
			const disposed = compositionLifetime.disposed;
			try {
				if (mode === 'hydrate') {
					const rendered = await renderToHydratableString(serverRoot(derive));
					container.innerHTML = rendered.html;
					const existing = container.querySelector('b');
					hydrate(composableProgramRoot(derive), container, {
						resumptions: rendered.resumptions,
						onMismatch: 'throw'
					});
					expect(container.querySelector('b')).toBe(existing);
				} else render(composableProgramRoot(derive), container);
				const child = container.querySelector('b');
				expect(container.querySelector('span')?.title, `${mode}: ${container.innerHTML}`).toBe(
					'retained'
				);
				expect(compositionLifetime.created - created).toBe(1);
				compositionOwner.state.count = 4;
				flushSync();
				expect(container.querySelector('b')).toBe(child);
				expect(child?.textContent).toBe('4');
			} finally {
				unmount(container);
			}
			expect(compositionLifetime.disposed - disposed).toBe(1);
		}
	}
);
