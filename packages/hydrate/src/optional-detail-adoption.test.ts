/**
 * @vitest-environment jsdom
 */
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { hydrate } from './index.js';
import { optionalDetailRoot as serverRoot } from '../../dom/src/test-support/components/optional-detail.fixtures.js?exact-target=server';
import {
	optionalDetailRoot,
	optionalDetailOwnerInstance
} from '../../dom/src/test-support/components/optional-detail.fixtures.js';

it('retires hydrated detail bindings when their selected resource disappears', async () => {
	const container = document.createElement('div');
	container.innerHTML = (await renderToHydratableString(serverRoot)).htmlWithHydration;
	const client = hydrate(optionalDetailRoot, container, { onMismatch: 'throw' });
	try {
		expect(container.textContent).toContain('selectedready');
		optionalDetailOwnerInstance().state.entries = [];
		flushSync();
		expect(container.querySelector('section')?.textContent).toBe('empty');
	} finally {
		client.dispose();
	}
});
