/**
 * @vitest-environment jsdom
 */
import { exactEnhancementPassThrough } from '@exactjs/core';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import '@exactjs/dom/framework/enhancements';
import '@exactjs/dom/runtime/target';
import { renderToHydratableString } from '@exactjs/ssr';
import { TimeUpdate } from '@exactjs/time';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './enhanced.js';
import {
	clockEnhancementIdentity,
	clockRoot,
	facadeEnhancementIdentity,
	FacadeEnhancement,
	facadePageRoot,
	targetOrderRoot
} from './test-support/enhanced.fixtures.js';
import {
	clockRoot as serverClockRoot,
	facadePageRoot as serverFacadePageRoot,
	targetOrderRoot as serverTargetOrderRoot
} from './test-support/enhanced.fixtures.js?exact-target=server';
import { noopLogger } from './test-support/responses.js';

describe('enhanced hydration facade', () => {
	it('adopts a direct target intrinsic ahead of a later nested target in a fragment', () => {
		const root = document.createElement('div');
		const rendered = renderToHydratableString(serverTargetOrderRoot);
		root.innerHTML = rendered.html;
		const host = root.querySelector('#host');
		const heading = root.querySelector('h2');

		hydrate(targetOrderRoot, root, {
			logger: noopLogger,
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});

		expect(root.querySelector('#host')).toBe(host);
		expect(root.querySelector('h2')).toBe(heading);
		expect(host?.getAttribute('class')).toBe('outer');
		expect(heading?.getAttribute('class')).toBe('inner');
	});

	it('adopts the server clock text before one settled live refresh', async () => {
		let now = 100;
		vi.spyOn(Date, 'now').mockImplementation(() => now);
		const root = document.createElement('div');
		const rendered = renderToHydratableString(serverClockRoot, {
			enhancementCatalog: new Map([[clockEnhancementIdentity, exactEnhancementPassThrough]])
		});
		root.innerHTML = rendered.html;
		const adopted = root.querySelector('time');
		expect(adopted?.textContent).toBe('100');

		now = 1_000;
		registerExactEnhancement(clockEnhancementIdentity, TimeUpdate);
		const client = hydrate(clockRoot, root, {
			logger: noopLogger,
			onMismatch: 'throw',
			resumptions: rendered.resumptions,
			wallClockSnapshot: rendered.wallClockSnapshot
		});
		expect(root.querySelector('time')).toBe(adopted);
		expect(adopted?.textContent).toBe('100');

		await Promise.resolve();
		await Promise.resolve();
		expect(root.querySelector('time')).toBe(adopted);
		expect(adopted?.textContent).toBe('1000');
		client.dispose();
	});

	it('supplies the application-bundle catalog after adoption', () => {
		const root = document.createElement('div');
		const rendered = renderToHydratableString(serverFacadePageRoot, {
			enhancementCatalog: new Map([[facadeEnhancementIdentity, exactEnhancementPassThrough]])
		});
		root.innerHTML = rendered.html;
		registerExactEnhancement(facadeEnhancementIdentity, FacadeEnhancement);

		hydrate(facadePageRoot, root, {
			logger: noopLogger,
			resumptions: rendered.resumptions
		});

		expect(root.querySelector('aside')?.dataset.enhanced).toBe('true');
		expect(root.querySelector('aside > button')?.textContent).toBe('Save');
	});
});
