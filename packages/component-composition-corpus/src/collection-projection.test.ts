import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import { verifyCollectionProjection } from '../test-support/collection-projection-journey.mjs';
import { collectionProjectionRoot } from './test-support/collection-projection.fixtures.js';
import { collectionProjectionRoot as serverRoot } from './test-support/collection-projection.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`preserves collection projection contracts through ${mode}`, async () => {
		const container = document.createElement('div');
		document.body.append(container);
		onTestFinished(() => {
			dispose(container, true);
			container.remove();
		});
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(serverRoot());
			container.innerHTML = output.html;
			const original = [...container.querySelectorAll('li')];
			hydrate(collectionProjectionRoot(), container, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect([...container.querySelectorAll('li')]).toEqual(original);
		} else render(collectionProjectionRoot(), container);
		await verifyCollectionProjection(container);
	});
