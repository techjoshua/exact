import '@exactjs/dom/runtime/target';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { renderToString } from '@exactjs/ssr';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { describe, expect, it } from 'vitest';
import {
	conditionalPlacement,
	placementOwner,
	placementLifetime
} from './scenarios/automatic-fragment.fixtures.js';
import { conditionalPlacement as serverPlacement } from './scenarios/automatic-fragment.fixtures.js?exact-target=server';

describe('dynamic supplied placement', () => {
	it('rejects simultaneous server placements', async () => {
		await expect(renderToString(serverPlacement(true))).rejects.toThrow(
			/cannot be placed more than once/
		);
	});
	it.each(['mount', 'hydrate'])(
		'retains exclusive placement ownership after %s and rejects duplicates before mutation',
		async (mode) => {
			const container = document.createElement('div');
			const created = placementLifetime.created;
			const disposed = placementLifetime.disposed;
			try {
				if (mode === 'hydrate') {
					const rendered = await renderToHydratableString(serverPlacement());
					container.innerHTML = rendered.html;
					const serverTarget = container.querySelector('button');
					hydrate(conditionalPlacement(), container, {
						resumptions: rendered.resumptions,
						onMismatch: 'throw'
					});
					expect(container.querySelector('button')).toBe(serverTarget);
				} else render(conditionalPlacement(), container);
				const target = container.querySelector('button');
				expect(container.querySelectorAll('button')).toHaveLength(1);
				placementOwner.state.first = false;
				placementOwner.state.second = true;
				flushSync();
				expect(container.querySelectorAll('button')).toHaveLength(1);
				expect(container.querySelector('button')).toBe(target);
				expect(placementLifetime.created - created).toBe(1);
				expect(placementLifetime.disposed - disposed).toBe(0);
				placementOwner.state.first = true;
				placementOwner.state.second = false;
				flushSync();
				expect(container.querySelector('button')).toBe(target);
				placementOwner.state.second = true;
				expect(() => flushSync()).toThrow(/cannot be placed more than once/);
				expect(container.querySelectorAll('button')).toHaveLength(1);
				placementOwner.state.second = false;
				flushSync();
				expect(container.querySelector('button')).toBe(target);
				placementOwner.state.first = false;
				flushSync();
				expect(container.querySelector('button')).toBeNull();
				expect(placementLifetime.disposed - disposed).toBe(1);
			} finally {
				unmount(container);
			}
			expect(placementLifetime.disposed - disposed).toBe(1);
		}
	);
});
