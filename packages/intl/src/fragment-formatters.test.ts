// @vitest-environment jsdom
import '@exactjs/dom/runtime/target';
import { createEnhancementNode } from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	createCompiledFragmentReceipt,
	createCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-operations';
import { hydrate } from '@exactjs/hydrate';
import { unmount } from '@exactjs/dom';
import { renderToHydratableString, renderToStream } from '@exactjs/ssr';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import {
	IntlProvider,
	IntlLocale,
	IntlMessage,
	IntlPlural,
	IntlSelect,
	IntlCurrency,
	IntlUnit
} from './components.js';
import {
	IntlProvider as ServerProvider,
	IntlLocale as ServerLocale,
	IntlMessage as ServerMessage,
	IntlPlural as ServerPlural,
	IntlSelect as ServerSelect,
	IntlCurrency as ServerCurrency,
	IntlUnit as ServerUnit
} from './components.js?exact-target=server';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';

const base: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'fragment-formatters',
	occurrenceId: 'Message:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [{ index: 0, kind: 'value', type: 'number' }],
	source: [{ kind: 'value', binding: 0 }],
	capabilities: []
};

const cases = [
	{ kind: 'message', client: IntlMessage, server: ServerMessage, descriptor: base },
	{
		kind: 'currency',
		client: IntlCurrency,
		server: ServerCurrency,
		descriptor: {
			...base,
			source: [
				{
					kind: 'format',
					bindings: [0],
					formatter: { kind: 'currency', currency: 'USD', display: 'symbol', options: {} }
				}
			],
			capabilities: ['currency']
		} as IntlRuntimeDescriptorV1
	},
	{
		kind: 'unit',
		client: IntlUnit,
		server: ServerUnit,
		descriptor: measurementDescriptor('length', 'road', 'mile', { maximumFractionDigits: 1 })
	},
	...(['plural', 'select'] as const).map((kind) => ({
		kind,
		client: kind === 'plural' ? IntlPlural : IntlSelect,
		server: kind === 'plural' ? ServerPlural : ServerSelect,
		descriptor: {
			...base,
			bindings: [{ index: 0, kind: 'selector', type: 'number' }],
			source: [
				{
					kind: 'select',
					binding: 0,
					selection: kind === 'plural' ? 'plural-cardinal' : 'exact',
					cases: [{ key: kind === 'plural' ? '=1' : '1', value: [{ kind: 'text', value: 'one' }] }],
					fallback: [{ kind: 'value', binding: 0 }]
				}
			],
			capabilities: kind === 'plural' ? ['plural-cardinal'] : ['exact']
		} as IntlRuntimeDescriptorV1
	}))
];

describe('intl fragment formatter presentation', () => {
	it.each(cases)(
		'preserves $kind updates under a contributed host across DOM and text hosts',
		async ({ kind, client, server, descriptor }) => {
			registerDomEnhancementIntegration();
			for (const tag of ['div', 'textarea', 'title']) {
				const environment = createIntlEnvironment({ locale: 'en-US', descriptors: [descriptor] });
				const state = reactive({ value: 1 });
				const activation = computed(() => prepareIntlActivation(descriptor, [state.value]));
				const operation = (
					provider: typeof IntlProvider,
					formatter: (typeof cases)[number]['client']
				) =>
					createCompiledComponentReceipt(
						provider,
						{ environment },
						createCompiledIntrinsicReceipt(
							tag,
							null,
							createCompiledFragmentReceipt(
								{
									__exactEnhancements: createEnhancementNode([
										{ identity: 'locale', props: { locale: true } }
									])
								},
								createCompiledComponentReceipt(formatter, { [kind]: activation })
							)
						)
					);
				const options = { enhancementCatalog: new Map([['locale', ServerLocale]]) };
				const rendered = await renderToHydratableString(operation(ServerProvider, server), options);
				const streamed = await new Response(
					renderToStream(operation(ServerProvider, server), options)
				).text();
				const container = document.createElement('div');
				container.innerHTML = rendered.html;
				const streamedContainer = document.createElement('div');
				streamedContainer.innerHTML = streamed;
				expect(streamedContainer.textContent).toBe(container.textContent);
				const host = container.querySelector(tag)!;
				const span = host.querySelector('span');
				const initial = host.textContent;
				const text =
					tag === 'div'
						? [...span!.childNodes].find((node) => node.nodeType === 3)
						: host.firstChild;
				try {
					hydrate(operation(IntlProvider, client), container, {
						enhancementCatalog: new Map([['locale', IntlLocale]]),
						resumptions: rendered.resumptions,
						onMismatch: 'throw'
					});
					expect(container.querySelector(tag)).toBe(host);
					state.value = 2;
					environment.setLocale('de-DE');
					flushSync();
					const expected = renderIntlActivation(activation.get(), environment).join('');
					if (tag === 'div') {
						expect(host.querySelector('span')).toBe(span);
						expect(span?.lang).toBe('de-DE');
						expect(span?.textContent).toBe(expected);
						expect([...span!.childNodes].find((node) => node.nodeType === 3)).toBe(text);
					} else {
						expect(host.children).toHaveLength(0);
						expect(host.firstChild).toBe(text);
						expect(host.textContent).toBe(`<span lang="de-DE" dir="ltr">${expected}</span>`);
					}
					expect(host.textContent).not.toBe(initial);
				} finally {
					unmount(container);
				}
			}
		}
	);
});
