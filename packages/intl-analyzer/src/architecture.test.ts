/**
 * @vitest-environment jsdom
 */
import { createExpression } from '@exactjs/core/runtime/render';
import { hydrate } from '@exactjs/hydrate/enhanced';
import {
	createIntlEnvironment,
	type IntlCatalogV1,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { prepareIntlActivation } from '../../intl/src/internal.js';
import { flushSync, reactive } from '@exactjs/reactive';
import { renderToStringAsync } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import {
	attributesRoot,
	CompiledIntlAttributes,
	CompiledIntlLocale,
	CompiledIntlMessage,
	inboxStructure,
	localeRoot,
	messageRoot,
	paragraphTarget
} from './architecture.fixtures.js';
import {
	serverAttributesRoot,
	ServerIntlAttributes,
	ServerIntlLocale,
	ServerIntlMessage,
	serverInboxStructure,
	serverLocaleRoot,
	serverMessageRoot,
	serverParagraphTarget
} from './architecture.server.fixtures.js?exact-target=server';
import { analyzeIntlSource } from './index.js';

describe('intl architecture fixture', () => {
	it('projects reactive lang and dir metadata through the locale enhancement', async () => {
		const environment = createIntlEnvironment({ locale: 'ar-EG', descriptors: [], catalogs: [] });
		const enhancementIdentity = '@exactjs/intl/enhancements#locale';
		const enhancementCatalog = new Map([[enhancementIdentity, CompiledIntlLocale]]);
		const serverEnhancementCatalog = new Map([[enhancementIdentity, ServerIntlLocale]]);
		const server = (
			await renderToStringAsync(serverLocaleRoot(environment), {
				enhancementCatalog: serverEnhancementCatalog
			})
		).html;
		expect(server).toContain('lang="ar-EG"');
		expect(server).toContain('dir="rtl"');
		const root = document.createElement('div');
		root.innerHTML = server;
		hydrate(localeRoot(environment), root, { onMismatch: 'throw', enhancementCatalog });
		const localized = root.querySelector('#localized')!;

		environment.setLocale('en-US');
		flushSync();
		expect(localized.getAttribute('lang')).toBe('en-US');
		expect(localized.getAttribute('dir')).toBe('ltr');
	});

	it('shares plural, structure, fallback, SSR, hydration, updates, and locale semantics', async () => {
		const analysis = analyzeIntlSource(
			`const View = ({ count }) => <p intl:message>You have {count} new {count === 1 ? 'message' : 'messages'}. Read <a href="/messages">your inbox</a>.</p>;`,
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const analyzed = analysis.descriptors[0]!;
		const descriptor: IntlRuntimeDescriptorV1 = {
			protocol: analyzed.protocol,
			owner: analyzed.owner,
			occurrenceId: analyzed.occurrenceId,
			contract: analyzed.contract,
			key: analyzed.key,
			...(analyzed.name ? { name: analyzed.name } : {}),
			sourceLocale: analyzed.sourceLocale,
			target: analyzed.target,
			bindings: analyzed.bindings,
			source: analyzed.source,
			capabilities: analyzed.capabilities
		};
		const french: IntlCatalogV1 = {
			protocol: 1,
			locale: 'fr-FR',
			owner: descriptor.owner,
			messages: {
				[descriptor.key]: [
					{ kind: 'text', value: 'Vous avez ' },
					{ kind: 'placeholder', id: 'n1' },
					{ kind: 'text', value: ' ' },
					{
						kind: 'select',
						id: 'n3',
						cases: [{ key: 'one', value: [{ kind: 'text', value: 'nouveau message' }] }],
						fallback: [{ kind: 'text', value: 'nouveaux messages' }]
					},
					{ kind: 'text', value: '. Consultez ' },
					{ kind: 'element', id: 'n5', value: [{ kind: 'text', value: 'votre boîte' }] },
					{ kind: 'text', value: '.' }
				]
			}
		};
		const environment = createIntlEnvironment({
			locale: 'fr-FR',
			descriptors: [descriptor],
			catalogs: [french]
		});
		const state = reactive({ count: 1 });
		const message = createExpression(() =>
			prepareIntlActivation(descriptor, [state.count], [inboxStructure], paragraphTarget)
		);
		const enhancementIdentity = '@exactjs/intl/enhancements#default';
		const enhancementCatalog = new Map([[enhancementIdentity, CompiledIntlMessage]]);
		const serverEnhancementCatalog = new Map([[enhancementIdentity, ServerIntlMessage]]);
		const serverMessage = createExpression(() =>
			prepareIntlActivation(
				descriptor,
				[state.count],
				[serverInboxStructure],
				serverParagraphTarget
			)
		);

		const server = (
			await renderToStringAsync(serverMessageRoot(environment, serverMessage), {
				enhancementCatalog: serverEnhancementCatalog
			})
		).html;
		expect(server).toContain('Vous avez 1 nouveau message. Consultez');
		expect(server).toContain('<a href="/messages">votre boîte</a>');

		const root = document.createElement('div');
		root.innerHTML = server;
		hydrate(messageRoot(environment, message), root, { onMismatch: 'throw', enhancementCatalog });
		const anchor = root.querySelector('a');
		expect(anchor).not.toBeNull();

		state.count = 2;
		flushSync();
		expect(root.textContent).toBe('Vous avez 2 nouveaux messages. Consultez votre boîte.');
		expect(root.querySelector('a')).toBe(anchor);

		environment.setLocale('en-US');
		flushSync();
		expect(root.textContent).toBe('You have 2 new messages. Read your inbox.');
		expect(root.querySelector('a')).toBe(anchor);
	});

	it('projects translated intrinsic properties across SSR, hydration, and reactive updates', async () => {
		const analysis = analyzeIntlSource(
			'export function Search({ query }) { return () => <input placeholder={`Search ${query}`} intl:placeholder />; }',
			{ filename: '/src/Search.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const analyzed = analysis.descriptors[0]!;
		const descriptor: IntlRuntimeDescriptorV1 = {
			protocol: analyzed.protocol,
			owner: analyzed.owner,
			occurrenceId: analyzed.occurrenceId,
			contract: analyzed.contract,
			key: analyzed.key,
			...(analyzed.name ? { name: analyzed.name } : {}),
			sourceLocale: analyzed.sourceLocale,
			target: analyzed.target,
			bindings: analyzed.bindings,
			source: analyzed.source,
			capabilities: analyzed.capabilities
		};
		const french: IntlCatalogV1 = {
			protocol: 1,
			locale: 'fr-FR',
			owner: descriptor.owner,
			messages: {
				[descriptor.key]: [
					{ kind: 'text', value: 'Rechercher ' },
					{ kind: 'placeholder', id: 'n1' }
				]
			}
		};
		const environment = createIntlEnvironment({
			locale: 'fr-FR',
			descriptors: [descriptor],
			catalogs: [french]
		});
		const state = reactive({ query: 'messages' });
		const placeholder = createExpression(() => prepareIntlActivation(descriptor, [state.query]));
		const enhancementIdentity = '@exactjs/intl/enhancements#alt';
		const enhancementCatalog = new Map([[enhancementIdentity, CompiledIntlAttributes]]);
		const serverEnhancementCatalog = new Map([[enhancementIdentity, ServerIntlAttributes]]);
		const server = (
			await renderToStringAsync(serverAttributesRoot(environment, placeholder), {
				enhancementCatalog: serverEnhancementCatalog
			})
		).html;
		expect(server).toContain('placeholder="Rechercher messages"');
		const root = document.createElement('div');
		root.innerHTML = server;
		hydrate(attributesRoot(environment, placeholder), root, {
			onMismatch: 'throw',
			enhancementCatalog
		});
		const input = root.querySelector('input')!;
		state.query = 'contacts';
		flushSync();
		expect(input.placeholder).toBe('Rechercher contacts');
		environment.setLocale('en-US');
		flushSync();
		expect(input.placeholder).toBe('Search contacts');
		expect(root.querySelector('input')).toBe(input);
	});
});
