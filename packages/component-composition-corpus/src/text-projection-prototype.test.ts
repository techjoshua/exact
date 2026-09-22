import '@exactjs/dom/runtime/target';
import { createRef, unsafeHtml, type RefBinding } from '@exactjs/core';
import {
	createCompiledFragmentReceipt as fragment,
	createCompiledIntrinsicReceipt as element
} from '@exactjs/core/runtime/component-abi';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { renderToHydratableString, renderToString, renderToStream } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { FragmentPresentationHosts } from '@exactjs/core/framework/render-structure';
import { prototypeFragmentPlacement } from './prototypes/supplied-target.js';
import {
	prototypeRoot,
	prototypeTextarea,
	prototypeAuthoredTextarea
} from './prototypes/placement.fixtures.js';
import { prototypeRoot as serverRoot } from './prototypes/placement.fixtures.js?exact-target=server';
import { prototypeTextarea as serverTextarea } from './prototypes/placement.fixtures.js?exact-target=server';
import { prototypeAuthoredTextarea as serverAuthoredTextarea } from './prototypes/placement.fixtures.js?exact-target=server';

describe('prepared target text projection', () => {
	it('preserves authored line endings when hydrating a transparent textarea fragment', async () => {
		const operation = element('textarea', null, fragment(null, '\nfirst\r\nsecond\rthird'));
		const output = await renderToHydratableString(serverRoot(operation));
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const host = container.querySelector('textarea')!;
		expect(host.textContent).toBe('\nfirst\r\nsecond\rthird');
		try {
			hydrate(prototypeRoot(operation), container, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('textarea')).toBe(host);
			expect(host.textContent).toBe('\nfirst\r\nsecond\rthird');
		} finally {
			unmount(container);
		}
	});
	it('serializes nested authored JSX and updates its props without replacing the textarea', async () => {
		const output = await renderToHydratableString(serverAuthoredTextarea('first & <value>'));
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const host = container.querySelector('textarea')!;
		try {
			hydrate(prototypeAuthoredTextarea('first & <value>'), container, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('textarea')).toBe(host);
			expect(host.value).toBe('<span lang="en">first &amp; &lt;value&gt;</span>');
			render(prototypeAuthoredTextarea('second'), container);
			flushSync();
			expect(container.querySelector('textarea')).toBe(host);
			expect(host.value).toBe('<span lang="en">second</span>');
		} finally {
			unmount(container);
		}
	});
	it('projects a supplied operation through a compiler-authored textarea', async () => {
		const target = element('span', { lang: 'en' }, 'prepared');
		const output = await renderToHydratableString(serverTextarea(target));
		const container = document.createElement('div');
		container.innerHTML = output.html;
		const host = container.querySelector('textarea')!;
		try {
			hydrate(prototypeTextarea(target), container, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('textarea')).toBe(host);
			expect(host.value).toBe('<span lang="en">prepared</span>');
		} finally {
			unmount(container);
		}
	});
	it('hydrates an empty fragment and later introduces text without a host', async () => {
		const state = reactive({ text: '' });
		const operation = element(
			'textarea',
			null,
			fragment(
				null,
				computed(() => state.text)
			)
		);
		const output = await renderToHydratableString(serverRoot(operation));
		const container = document.createElement('div');
		container.innerHTML = output.html;
		try {
			hydrate(prototypeRoot(operation), container, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			const host = container.querySelector('textarea')!;
			state.text = 'introduced';
			flushSync();
			expect(host.value).toBe('introduced');
			expect(host.children).toHaveLength(0);
			state.text = '';
			flushSync();
			expect(host.value).toBe('');
		} finally {
			unmount(container);
		}
	});

	it('retains the root unsafe HTML capability when projecting srcdoc', async () => {
		const operation = element(
			'textarea',
			null,
			element('iframe', { srcdoc: unsafeHtml('<p>safe & literal</p>') })
		);
		await expect(renderToString(operation)).rejects.toThrow('allowUnsafeHtml');
		const audit = vi.fn();
		const output = await renderToString(operation, {
			allowUnsafeHtml: true,
			onUnsafeHtml: audit,
			markers: false
		});
		const server = document.createElement('div');
		server.innerHTML = output.html;
		const client = document.createElement('div');
		try {
			render(prototypeRoot(operation), client, { allowUnsafeHtml: true });
			expect(client.querySelector('textarea')?.value).toBe(server.querySelector('textarea')?.value);
			expect(client.querySelector('iframe')).toBeNull();
			expect(audit).toHaveBeenCalledWith({ characters: '<p>safe & literal</p>'.length });
		} finally {
			unmount(client);
		}
	});

	it.each(['title', 'textarea'])(
		'adopts %s text and retains its node through reactive markup updates',
		async (tag) => {
			const state = reactive({ text: 'A & <B>', lang: 'en' });
			const hosts = new FragmentPresentationHosts();
			const calls = vi.fn();
			const fulfilled = vi.fn();
			const ref: RefBinding<Element> = {
				key: createRef<Element>('inert host'),
				owner: undefined as never,
				current: undefined,
				fulfill: fulfilled
			};
			const target = prototypeFragmentPlacement(
				fragment(
					null,
					computed(() => state.text)
				),
				hosts.reconcile([
					{ owner: Symbol(), props: { lang: computed(() => state.lang), ref, onClick: calls } }
				])
			);
			const operation = element(tag, null, 'prefix ', target, ' suffix');
			const server = await renderToHydratableString(serverRoot(operation));
			const container = document.createElement('div');
			container.innerHTML = server.html;
			const host = container.querySelector(tag)!;
			const text = host.firstChild;
			try {
				hydrate(prototypeRoot(operation), container, {
					resumptions: server.resumptions,
					onMismatch: 'throw'
				});
				expect(host.textContent).toBe('prefix <span lang="en">A &amp; &lt;B&gt;</span> suffix');
				expect(host.firstChild).toBe(text);
				state.text = '</textarea> & "next"';
				state.lang = 'fr';
				flushSync();
				expect(host.firstChild).toBe(text);
				expect(host.textContent).toBe(
					'prefix <span lang="fr">&lt;/textarea&gt; &amp; "next"</span> suffix'
				);
				expect(host.children).toHaveLength(0);
				host.dispatchEvent(new MouseEvent('click'));
				expect(calls).not.toHaveBeenCalled();
				expect(fulfilled).not.toHaveBeenCalled();
			} finally {
				unmount(container);
				hosts.dispose();
			}
			expect(fulfilled).not.toHaveBeenCalled();
		}
	);

	it('updates textarea default text without overwriting a dirty value', () => {
		const state = reactive({ text: 'initial' });
		const operation = element(
			'textarea',
			null,
			element(
				'span',
				null,
				computed(() => state.text)
			)
		);
		const container = document.createElement('div');
		try {
			render(prototypeRoot(operation), container);
			const host = container.querySelector('textarea')!;
			host.value = 'user input';
			state.text = 'changed';
			flushSync();
			expect(host.value).toBe('user input');
			expect(host.defaultValue).toBe('<span>changed</span>');
		} finally {
			unmount(container);
		}
	});

	it('keeps an authored reactive textarea value authoritative', () => {
		const state = reactive({ text: 'initial', value: 'bound' });
		const operation = element(
			'textarea',
			{ value: computed(() => state.value) },
			element(
				'span',
				null,
				computed(() => state.text)
			)
		);
		const container = document.createElement('div');
		try {
			render(prototypeRoot(operation), container);
			const host = container.querySelector('textarea')!;
			state.text = 'changed';
			flushSync();
			expect(host.value).toBe('bound');
			state.value = 'next bound';
			flushSync();
			expect(host.value).toBe('next bound');
		} finally {
			unmount(container);
		}
	});

	it('agrees with native markup for merged props and streamed output', async () => {
		const hosts = new FragmentPresentationHosts();
		const target = prototypeFragmentPlacement(
			fragment(null, 'safe < & text'),
			hosts.reconcile([
				{
					owner: Symbol(),
					props: {
						title: 'a "quote" & <tag>',
						className: 'outer',
						style: { color: 'red' },
						'aria-describedby': 'first'
					}
				},
				{
					owner: Symbol(),
					props: { className: 'inner', style: { fontWeight: 700 }, 'aria-describedby': 'second' }
				}
			])
		);
		try {
			const markup = (await renderToString(target, { markers: false })).html;
			const operation = element('textarea', null, target);
			const output = await renderToString(operation, { markers: false });
			const streamed = await new Response(renderToStream(operation, { markers: false })).text();
			expect(streamed).toBe(output.html);
			const container = document.createElement('div');
			container.innerHTML = output.html;
			expect(container.querySelector('textarea')?.value).toBe(markup);
		} finally {
			hosts.dispose();
		}
	});
});
