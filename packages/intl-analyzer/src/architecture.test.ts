/**
 * @vitest-environment jsdom
 */
import { createEnhancementMarker, createExpression, createVNode, type Child } from '@exactjs/core';
import { hydrate } from '@exactjs/hydrate';
import {
	createIntlEnvironment,
	IntlAttributes,
	IntlMessage,
	IntlProvider,
	type IntlCatalogV1,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { prepareIntlActivation } from '@exactjs/intl/internal';
import { flushSync, reactive } from '@exactjs/reactive';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { analyzeIntlSource } from './index.js';

describe('intl architecture fixture', () => {
	it('shares plural, structure, fallback, SSR, hydration, updates, and locale semantics', () => {
		const analysis = analyzeIntlSource(
			`const View = ({ count }) => <p intl:message>You have {count} new {count === 1 ? 'message' : 'messages'}. Read <a href="/messages">your inbox</a>.</p>;`,
			{ filename: '/src/View.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const analyzed = analysis.descriptors[0]!;
		const descriptor: IntlRuntimeDescriptorV1 = {
			protocol: analyzed.protocol,
			owner: analyzed.owner,
			occurrenceId: analyzed.occurrenceId,
			key: analyzed.key,
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
					{ kind: 'value', binding: 0 },
					{ kind: 'text', value: ' ' },
					{
						kind: 'select',
						binding: 0,
						selection: 'plural-cardinal',
						cases: [{ key: 'one', value: [{ kind: 'text', value: 'nouveau message' }] }],
						fallback: [{ kind: 'text', value: 'nouveaux messages' }]
					},
					{ kind: 'text', value: '. Consultez ' },
					{ kind: 'element', binding: 1, value: [{ kind: 'text', value: 'votre boîte' }] },
					{ kind: 'text', value: '.' }
				]
			}
		};
		const environment = createIntlEnvironment({
			locale: 'fr-FR',
			descriptors: [descriptor],
			catalogs: [french]
		});
		const structure = (children: readonly Child[]) =>
			createVNode('a', { href: '/messages', key: 'inbox' }, ...children);
		const target = (children: readonly Child[]) => createVNode('p', null, ...children);
		const state = reactive({ count: 1 });
		const message = createExpression(() =>
			prepareIntlActivation(descriptor, [state.count], [structure], target)
		);
		const enhancementIdentity = '@exactjs/intl/enhancements#default';
		const enhancementCatalog = new Map([[enhancementIdentity, IntlMessage]]);

		const app = () =>
			createVNode(
				IntlProvider,
				{ environment },
				createVNode('p', {
					__exactEnhancements: createEnhancementMarker([
						{ identity: enhancementIdentity, props: { message } }
					])
				})
			);

		const server = renderToString(app(), { enhancementCatalog }).html;
		expect(server).toContain('Vous avez 1 nouveau message. Consultez');
		expect(server).toContain('<a href="/messages">votre boîte</a>');

		const root = document.createElement('div');
		root.innerHTML = server;
		hydrate(app(), root, { onMismatch: 'throw', enhancementCatalog });
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

	it('projects translated intrinsic properties across SSR, hydration, and reactive updates', () => {
		const analysis = analyzeIntlSource(
			'export function Search({ query }) { return () => <input placeholder={`Search ${query}`} intl:placeholder />; }',
			{ filename: '/src/Search.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const analyzed = analysis.descriptors[0]!;
		const descriptor: IntlRuntimeDescriptorV1 = {
			protocol: analyzed.protocol,
			owner: analyzed.owner,
			occurrenceId: analyzed.occurrenceId,
			key: analyzed.key,
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
					{ kind: 'value', binding: 0 }
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
		const fallback = createExpression(() => `Search ${state.query}`);
		const enhancementIdentity = '@exactjs/intl/enhancements#attributes';
		const enhancementCatalog = new Map([[enhancementIdentity, IntlAttributes]]);
		const app = () =>
			createVNode(
				IntlProvider,
				{ environment },
				createVNode('input', {
					placeholder: fallback,
					id: 'search',
					__exactEnhancements: createEnhancementMarker([
						{ identity: enhancementIdentity, props: { placeholder } }
					])
				})
			);

		const server = renderToString(app(), { enhancementCatalog }).html;
		expect(server).toContain('placeholder="Rechercher messages"');
		const root = document.createElement('div');
		root.innerHTML = server;
		hydrate(app(), root, { onMismatch: 'throw', enhancementCatalog });
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
