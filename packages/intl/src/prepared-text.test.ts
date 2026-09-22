import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import {
	IntlProvider as ServerProvider,
	IntlMessage as ServerMessage
} from './components.js?exact-target=server';
// @vitest-environment jsdom
import '@exactjs/dom/runtime/target';
import {
	createCompiledIntrinsicReceipt,
	createCompiledComponentReceipt,
	readCompiledComponentReceipt
} from '@exactjs/core/runtime/component-operations';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createRendererRoot } from '../../dom/src/renderer/root-construction.js';
import { prepareComponentReceipt } from '../../dom/src/renderer/prepare-component-receipt.js';
import { PreparedComponentTextTarget } from '../../dom/src/renderer/prepared-component-text.js';
import { placeMountedBefore } from '../../dom/src/placement.js';
import { disposeMounted } from '../../dom/src/renderer/teardown.js';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import {
	preparedIntlTextTree,
	preparedIntlTextHost,
	preparedIntlLocale,
	preparedIntlMessage,
	preparedIntlProvider
} from './test-support/preparation.fixtures.js';

const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'prepared-text',
	occurrenceId: 'Greeting:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [],
	source: [{ kind: 'text', value: 'Hello' }],
	capabilities: []
};

describe('prepared intl text presentation', () => {
	it('mounts and hydrates nested messages in an authored textarea', async () => {
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [descriptor],
			catalogs: [
				{
					protocol: 1,
					owner: descriptor.owner,
					locale: 'fr-FR',
					messages: { [descriptor.key]: [{ kind: 'text', value: 'Bonjour' }] }
				}
			]
		});
		const message = prepareIntlActivation(descriptor, []);
		const output = await renderToHydratableString(
			createCompiledComponentReceipt(
				ServerProvider,
				{ environment },
				createCompiledIntrinsicReceipt(
					'textarea',
					null,
					createCompiledComponentReceipt(ServerMessage, { message }),
					' / ',
					createCompiledComponentReceipt(ServerMessage, { message })
				)
			)
		);
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const textarea = container.querySelector('textarea')!;
		const text = textarea.firstChild;
		try {
			hydrate(preparedIntlTextHost(environment, message), container, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('textarea')).toBe(textarea);
			expect(textarea.firstChild).toBe(text);
			expect(textarea.value).toBe('Hello / Hello');
			textarea.value = 'edited';
			environment.setLocale('fr-FR');
			flushSync();
			expect(textarea.firstChild).toBe(text);
			expect(textarea.textContent).toBe('Bonjour / Bonjour');
			expect(textarea.value).toBe('edited');
		} finally {
			unmount(container);
		}
		render(preparedIntlTextHost(environment, message), container);
		try {
			expect(container.querySelector('textarea')?.value).toBe('Bonjour / Bonjour');
		} finally {
			unmount(container);
		}
	});
	it('retains nested component owners while coalescing their reactive output', () => {
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [descriptor],
			catalogs: [
				{
					protocol: 1,
					owner: descriptor.owner,
					locale: 'fr-FR',
					messages: { [descriptor.key]: [{ kind: 'text', value: 'Bonjour' }] }
				}
			]
		});
		const receipt = preparedIntlTextTree(environment, prepareIntlActivation(descriptor, []));
		const container = document.createElement('textarea');
		const root = createRendererRoot(container, receipt, {}, { version: 1 });
		const prepared = prepareComponentReceipt(root, readCompiledComponentReceipt(receipt)!);
		try {
			const mounted = prepared.commit(new PreparedComponentTextTarget(root));
			try {
				placeMountedBefore(root, container, mounted);
				const text = container.firstChild;
				const owners = mounted.children.map((child) => child.instance);
				expect(owners).toHaveLength(2);
				expect(container.textContent).toBe('Hello / Hello');
				environment.setLocale('fr-FR');
				flushSync();
				expect(container.firstChild).toBe(text);
				expect(container.textContent).toBe('Bonjour / Bonjour');
				expect(mounted.children.map((child) => child.instance)).toEqual(owners);
				expect(container.children).toHaveLength(0);
			} finally {
				disposeMounted(container, mounted);
			}
		} finally {
			prepared.abort();
		}
	});
	it.each(['message', 'locale'] as const)(
		'retains provider context and reactive %s output on one Text node',
		(kind) => {
			const environment = createIntlEnvironment({
				locale: 'en-US',
				descriptors: [descriptor],
				catalogs: [
					{
						protocol: 1,
						owner: descriptor.owner,
						locale: 'fr-FR',
						messages: {
							[descriptor.key]: [{ kind: 'text', value: 'Bonjour' }]
						}
					}
				]
			});
			const container = document.createElement('textarea');
			const providerReceipt = preparedIntlProvider(environment);
			const root = createRendererRoot(container, providerReceipt, {}, { version: 1 });
			const providerPreparation = prepareComponentReceipt(
				root,
				readCompiledComponentReceipt(providerReceipt)!
			);
			const provider = providerPreparation.commit();
			try {
				const receipt =
					kind === 'message'
						? preparedIntlMessage(prepareIntlActivation(descriptor, []))
						: preparedIntlLocale(createCompiledIntrinsicReceipt('span', null, 'Hello'));
				const prepared = prepareComponentReceipt(
					root,
					readCompiledComponentReceipt(receipt)!,
					provider.instance,
					provider.scope,
					container
				);
				try {
					const mounted = prepared.commit(new PreparedComponentTextTarget(root));
					const text = mounted.dom;
					try {
						placeMountedBefore(root, container, mounted);
						expect(container.firstChild).toBe(text);
						expect(text.nodeType).toBe(Node.TEXT_NODE);
						expect(text.textContent).toBe(
							kind === 'message' ? 'Hello' : '<span lang="en-US" dir="ltr">Hello</span>'
						);
						container.value = 'edited';
						environment.setLocale('fr-FR');
						flushSync();
						expect(container.firstChild).toBe(text);
						expect(text.textContent).toBe(
							kind === 'message' ? 'Bonjour' : '<span lang="fr-FR" dir="ltr">Hello</span>'
						);
						expect(container.value).toBe('edited');
						expect(container.children).toHaveLength(0);
					} finally {
						disposeMounted(container, mounted);
					}
					environment.setLocale('en-US');
					flushSync();
					expect(container.childNodes).toHaveLength(0);
					expect(text.textContent).toBe(
						kind === 'message' ? 'Bonjour' : '<span lang="fr-FR" dir="ltr">Hello</span>'
					);
				} finally {
					prepared.abort();
				}
			} finally {
				disposeMounted(container, provider);
				providerPreparation.abort();
			}
		}
	);
});
