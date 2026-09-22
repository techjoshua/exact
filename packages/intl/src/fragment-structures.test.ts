// @vitest-environment jsdom
import '@exactjs/dom/runtime/target';
import { createEnhancementNode, type Child } from '@exactjs/core';
import {
	createCompiledComponentReceipt as component,
	createCompiledFragmentReceipt as fragment,
	createCompiledIntrinsicReceipt as intrinsic
} from '@exactjs/core/runtime/component-operations';
import { hydrate } from '@exactjs/hydrate';
import { unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { IntlProvider, IntlMessage, IntlLocale, IntlAttributes } from './components.js';
import {
	IntlProvider as ServerProvider,
	IntlMessage as ServerMessage,
	IntlLocale as ServerLocale,
	IntlAttributes as ServerAttributes
} from './components.js?exact-target=server';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';

const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'fragment-structures',
	occurrenceId: 'Rich:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [
		{ index: 0, kind: 'element', type: 'structure', name: 'strong', exactlyOnce: true },
		{ index: 1, kind: 'opaque', type: 'opaque-structure', name: 'control', exactlyOnce: true }
	],
	source: [
		{ kind: 'element', binding: 0, value: [{ kind: 'text', value: 'Hello' }] },
		{ kind: 'opaque', binding: 1, name: 'control' }
	],
	capabilities: ['element', 'opaque']
};

it('retains rich and opaque slots while locale and translated attributes share a fragment host', async () => {
	registerDomEnhancementIntegration();
	const title: IntlRuntimeDescriptorV1 = {
		...descriptor,
		contract: descriptor.key,
		occurrenceId: 'Title:0',
		key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
		target: { kind: 'property', name: 'title' },
		bindings: [],
		source: [{ kind: 'text', value: 'Greeting' }],
		capabilities: []
	};
	const environment = createIntlEnvironment({
		locale: 'en-US',
		descriptors: [descriptor, title],
		catalogs: [
			{
				protocol: 1,
				owner: descriptor.owner,
				locale: 'fr-FR',
				messages: {
					[descriptor.key]: [
						{ kind: 'element', id: 'n0', value: [{ kind: 'text', value: 'Bonjour' }] },
						{ kind: 'placeholder', id: 'n1' }
					],
					[title.key]: [{ kind: 'text', value: 'Salutation' }]
				}
			}
		]
	});
	const button = intrinsic('button', { type: 'button' }, 'fixed');
	const message = prepareIntlActivation(
		descriptor,
		[],
		[(children: readonly Child[]) => intrinsic('strong', null, ...children), () => button]
	);
	const property = prepareIntlActivation(title, []);
	const tree = (provider: typeof IntlProvider, formatter: typeof IntlMessage) =>
		component(
			provider,
			{ environment },
			intrinsic(
				'div',
				null,
				fragment(
					{
						__exactEnhancements: createEnhancementNode([
							{ identity: 'locale', props: { locale: true } },
							{ identity: 'attributes', props: { title: property } }
						])
					},
					component(formatter, { message })
				)
			)
		);
	const rendered = await renderToHydratableString(tree(ServerProvider, ServerMessage), {
		enhancementCatalog: new Map([
			['locale', ServerLocale],
			['attributes', ServerAttributes]
		])
	});
	const container = document.createElement('div');
	container.innerHTML = rendered.html;
	const host = container.querySelector('span')!;
	const strong = container.querySelector('strong');
	const control = container.querySelector('button');
	try {
		hydrate(tree(IntlProvider, IntlMessage), container, {
			enhancementCatalog: new Map([
				['locale', IntlLocale],
				['attributes', IntlAttributes]
			]),
			resumptions: rendered.resumptions,
			onMismatch: 'throw'
		});
		expect(container.querySelectorAll('span')).toHaveLength(1);
		expect(container.querySelector('strong')).toBe(strong);
		expect(container.querySelector('button')).toBe(control);
		expect(host.title).toBe('Greeting');
		environment.setLocale('fr-FR');
		flushSync();
		expect(container.querySelector('span')).toBe(host);
		expect(host.lang).toBe('fr-FR');
		expect(host.title).toBe('Salutation');
		expect(container.querySelector('strong')).toBe(strong);
		expect(strong?.textContent).toBe('Bonjour');
		expect(container.querySelector('button')).toBe(control);
	} finally {
		unmount(container);
	}
});

it.each(['div', 'title', 'textarea'])(
	'keeps a nested explicit locale independent inside %s',
	async (tag) => {
		registerDomEnhancementIntegration();
		const messageDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			bindings: [],
			source: [{ kind: 'text', value: 'Hello' }],
			capabilities: []
		};
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [messageDescriptor],
			catalogs: [
				{
					protocol: 1,
					owner: descriptor.owner,
					locale: 'fr-FR',
					messages: { [descriptor.key]: [{ kind: 'text', value: 'Bonjour' }] }
				},
				{
					protocol: 1,
					owner: descriptor.owner,
					locale: 'de-DE',
					messages: { [descriptor.key]: [{ kind: 'text', value: 'Hallo' }] }
				}
			]
		});
		const message = prepareIntlActivation(messageDescriptor, []);
		const tree = (provider: typeof IntlProvider, formatter: typeof IntlMessage) =>
			component(
				provider,
				{ environment },
				intrinsic(
					tag,
					null,
					fragment(
						{
							__exactEnhancements: createEnhancementNode([
								{ identity: 'locale', props: { locale: 'fr-FR' } }
							])
						},
						fragment(
							{
								__exactEnhancements: createEnhancementNode([
									{ identity: 'locale', props: { locale: true } }
								])
							},
							component(formatter, { message })
						)
					),
					' / ',
					component(formatter, { message })
				)
			);
		const rendered = await renderToHydratableString(tree(ServerProvider, ServerMessage), {
			enhancementCatalog: new Map([['locale', ServerLocale]])
		});
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const host = container.querySelector(tag)!;
		const nodes = [...host.childNodes];
		try {
			hydrate(tree(IntlProvider, IntlMessage), container, {
				enhancementCatalog: new Map([['locale', IntlLocale]]),
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			environment.setLocale('de-DE');
			flushSync();
			expect([...host.childNodes]).toEqual(nodes);
			if (tag === 'div') {
				expect(host.textContent).toBe('Bonjour / Hallo');
				expect([...host.querySelectorAll('span')].map((node) => node.lang)).toEqual([
					'fr-FR',
					'fr-FR'
				]);
			} else {
				expect(host.children).toHaveLength(0);
				expect(host.textContent).toBe(
					'<span lang="fr-FR" dir="ltr"><span lang="fr-FR" dir="ltr">Bonjour</span></span> / Hallo'
				);
			}
		} finally {
			unmount(container);
		}
	}
);
