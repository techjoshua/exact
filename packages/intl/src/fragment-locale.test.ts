import { IntlLocale as ServerLocale } from './components.js?exact-target=server';
import { renderToHydratableString, renderToStream } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { unmount } from '@exactjs/dom';
import { preparedIntlFragmentRoot } from './test-support/preparation.fixtures.js';
import { preparedIntlFragmentRoot as serverRoot } from './test-support/preparation.fixtures.js?exact-target=server';
// @vitest-environment jsdom
import '@exactjs/dom/runtime/target';
import { createEnhancementNode, readExactEnhancementContexts } from '@exactjs/core';
import { createCompiledFragmentReceipt } from '@exactjs/core/runtime/component-operations';
import { describe, expect, it } from 'vitest';
import { IntlLocale } from './components.js';
import { createRendererRoot } from '../../dom/src/renderer/root-construction.js';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';
import { mountDetachedOperation } from '../../dom/src/renderer/mounting/children.js';
import { placeMountedBefore } from '../../dom/src/placement.js';
import { disposeMounted } from '../../dom/src/renderer/teardown.js';

describe('automatic intl fragment locale contribution', () => {
	it('uses the same contributed locale host in SSR, streaming, and hydration', async () => {
		registerDomEnhancementIntegration();
		const operation = createCompiledFragmentReceipt(
			{
				__exactEnhancements: createEnhancementNode([
					{ identity: 'locale', props: { locale: 'fr-FR' } }
				])
			},
			'Hello'
		);
		const options = { enhancementCatalog: new Map([['locale', ServerLocale]]) };
		const result = await renderToHydratableString(serverRoot(operation), options);
		const streamed = await new Response(renderToStream(serverRoot(operation), options)).text();
		expect(streamed).toContain('lang="fr-FR"');
		const container = document.createElement('div');
		container.innerHTML = result.html;
		const span = container.querySelector('span');
		try {
			hydrate(preparedIntlFragmentRoot(operation), container, {
				enhancementCatalog: new Map([['locale', IntlLocale]]),
				resumptions: result.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelectorAll('span')).toHaveLength(1);
			expect(container.textContent).toBe('Hello');
		} finally {
			unmount(container);
		}
	});

	it('uses the ordinary locale helper and wraps its complete fragment', () => {
		registerDomEnhancementIntegration();
		expect(readExactEnhancementContexts(IntlLocale)?.transparentTarget).toBe(true);
		const operation = createCompiledFragmentReceipt(
			{
				__exactEnhancements: createEnhancementNode([
					{ identity: 'locale', props: { locale: 'fr-FR' } }
				])
			},
			'Hello'
		);
		const container = document.createElement('div');
		const root = createRendererRoot(
			container,
			operation,
			{ enhancementCatalog: new Map([['locale', IntlLocale]]) },
			{ version: 1 }
		);
		const mounted = mountDetachedOperation(root, operation, undefined, undefined, container);
		try {
			placeMountedBefore(root, container, mounted);
			expect(container.querySelector('span')?.lang).toBe('fr-FR');
			expect(container.querySelector('span')?.dir).toBe('ltr');
			expect(container.textContent).toBe('Hello');
		} finally {
			disposeMounted(container, mounted);
		}
	});
});
