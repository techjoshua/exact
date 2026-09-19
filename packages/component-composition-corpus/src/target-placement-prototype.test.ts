import '@exactjs/dom/runtime/target';
import { createRef, type RefBinding } from '@exactjs/core';
import {
	createCompiledFragmentReceipt as fragment,
	createCompiledIntrinsicReceipt as element
} from '@exactjs/core/runtime/component-abi';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { renderToHydratableString, renderToString, renderToStream } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import {
	FragmentPresentationHosts,
	type FragmentContribution
} from '@exactjs/core/framework/render-structure';
import {
	prototypeFragmentPlacement,
	prototypeIntrinsicPlacement
} from './prototypes/supplied-target.js';
import { prototypeRoot } from './prototypes/placement.fixtures.js';
import { prototypeRoot as serverRoot } from './prototypes/placement.fixtures.js?exact-target=server';

const contribution = (props: Record<string, unknown>, tag?: string): FragmentContribution => ({
	owner: Symbol(),
	props,
	tag
});

describe('supplied target placement prototype on existing renderers', () => {
	it('keeps transparent text and contributes directly to existing intrinsics', async () => {
		const text = fragment(null, 'plain');
		expect(
			(await renderToString(prototypeFragmentPlacement(text, []), { markers: false })).html
		).toBe('plain');
		const intrinsic = prototypeIntrinsicPlacement(element('button', null, 'Save'), [
			contribution({ title: 'action' })
		]);
		expect((await renderToString(intrinsic, { markers: false })).html).toBe(
			'<button title="action">Save</button>'
		);
	});

	it('coalesces host output while retaining separately merged contributions', async () => {
		const hosts = new FragmentPresentationHosts();
		const operation = prototypeFragmentPlacement(
			fragment(null, 'hello & world'),
			hosts.reconcile([
				contribution({ className: 'outer', title: 'outer' }),
				contribution({ className: 'inner', title: 'inner' })
			])
		);
		const server = await renderToString(operation, { markers: false });
		const container = document.createElement('div');
		try {
			render(prototypeRoot(operation), container);
			expect(container.querySelectorAll('span')).toHaveLength(1);
			expect(container.firstElementChild?.classList.contains('outer')).toBe(true);
			expect(container.firstElementChild?.classList.contains('inner')).toBe(true);
			expect(container.firstElementChild?.getAttribute('title')).toBe('inner');
			expect(container.innerHTML).toBe(server.html);
		} finally {
			unmount(container);
			hosts.dispose();
		}
	});

	it('adopts the shared host and text and updates values without replacing either', async () => {
		const state = reactive({ text: 'before', tone: 'initial' });
		const hosts = new FragmentPresentationHosts();
		const operation = prototypeFragmentPlacement(
			fragment(
				null,
				computed(() => state.text)
			),
			hosts.reconcile([
				contribution({ className: computed(() => state.tone) }),
				contribution({ title: 'shared' })
			])
		);
		const rendered = await renderToHydratableString(serverRoot(operation));
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const host = container.querySelector('span')!;
		const text = [...host.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
		try {
			hydrate(prototypeRoot(operation), container, {
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			state.text = 'after';
			state.tone = 'updated';
			flushSync();
			expect(container.querySelector('span')).toBe(host);
			expect([...host.childNodes]).toContain(text);
			expect(host.textContent).toBe('after');
			expect(host.className).toBe('updated');
		} finally {
			unmount(container);
			hosts.dispose();
		}
	});

	it('produces the same span for plain and streamed SSR', async () => {
		const hosts = new FragmentPresentationHosts();
		const operation = prototypeFragmentPlacement(
			fragment(null, 'text'),
			hosts.reconcile([contribution({ lang: 'fr' })])
		);
		const result = await renderToString(operation, { markers: false });
		const stream = renderToStream(operation, { markers: false });
		const html = await new Response(stream).text();
		expect(html).toBe(result.html);
	});

	it('retains the shared host and text when a contributing owner is removed', () => {
		const hosts = new FragmentPresentationHosts();
		const first = contribution({ className: 'first' });
		const second = contribution({ title: 'survivor' });
		const text = fragment(null, 'retained');
		const container = document.createElement('div');
		try {
			render(
				prototypeRoot(prototypeFragmentPlacement(text, hosts.reconcile([first, second]))),
				container
			);
			const host = container.querySelector('span');
			const child = [...host!.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
			render(prototypeRoot(prototypeFragmentPlacement(text, hosts.reconcile([second]))), container);
			flushSync();
			expect(container.querySelector('span')).toBe(host);
			expect([...host!.childNodes]).toContain(child);
			expect(host?.className).toBe('');
			expect(host?.title).toBe('survivor');
		} finally {
			unmount(container);
			hosts.dispose();
		}
	});

	it('does not release a stable ref when only contributed props change', () => {
		const values: unknown[] = [];
		const ref: RefBinding<Element> = {
			key: createRef<Element>('prototype target'),
			owner: undefined as never,
			current: undefined,
			fulfill: (value) => values.push(value)
		};
		const owner = contribution({ ref, title: 'before' });
		const hosts = new FragmentPresentationHosts();
		const text = fragment(null, 'retained');
		const container = document.createElement('div');
		try {
			render(prototypeRoot(prototypeFragmentPlacement(text, hosts.reconcile([owner]))), container);
			const host = container.querySelector('span');
			values.length = 0;
			render(
				prototypeRoot(
					prototypeFragmentPlacement(
						text,
						hosts.reconcile([{ ...owner, props: { ref, title: 'after' } }])
					)
				),
				container
			);
			flushSync();
			expect(container.querySelector('span')).toBe(host);
			expect(values).toEqual([]);
		} finally {
			unmount(container);
			hosts.dispose();
		}
	});

	it('releases only the departing owner listener and preserves event order', () => {
		const calls: string[] = [];
		const hosts = new FragmentPresentationHosts();
		const outer = contribution({ onClick: () => calls.push('outer') });
		const inner = contribution({ onClick: () => calls.push('inner') });
		const text = fragment(null, 'events');
		const container = document.createElement('div');
		try {
			render(
				prototypeRoot(prototypeFragmentPlacement(text, hosts.reconcile([outer, inner]))),
				container
			);
			const host = container.querySelector('span')!;
			host.click();
			expect(calls).toEqual(['inner', 'outer']);
			calls.length = 0;
			const remove = vi.spyOn(host, 'removeEventListener');
			const add = vi.spyOn(host, 'addEventListener');
			render(prototypeRoot(prototypeFragmentPlacement(text, hosts.reconcile([outer]))), container);
			flushSync();
			expect(container.querySelector('span')).toBe(host);
			expect(remove).toHaveBeenCalledTimes(1);
			expect(add).not.toHaveBeenCalled();
			host.click();
			expect(calls).toEqual(['outer']);
			remove.mockRestore();
			add.mockRestore();
		} finally {
			unmount(container);
			hosts.dispose();
			vi.restoreAllMocks();
		}
	});

	it('releases each shared-host ref only with its own contribution', () => {
		const firstValues: unknown[] = [];
		const secondValues: unknown[] = [];
		const binding = (values: unknown[]): RefBinding<Element> => ({
			key: createRef<Element>('shared host owner'),
			owner: undefined as never,
			current: undefined,
			fulfill: (value) => values.push(value)
		});
		const first = contribution({ ref: binding(firstValues) });
		const second = contribution({ ref: binding(secondValues) });
		const hosts = new FragmentPresentationHosts();
		const target = fragment(null, 'owned');
		const container = document.createElement('div');
		try {
			render(
				prototypeRoot(prototypeFragmentPlacement(target, hosts.reconcile([first, second]))),
				container
			);
			expect(firstValues).toEqual([container.querySelector('span')]);
			expect(secondValues).toEqual(firstValues);
			firstValues.length = 0;
			secondValues.length = 0;
			render(
				prototypeRoot(prototypeFragmentPlacement(target, hosts.reconcile([second]))),
				container
			);
			flushSync();
			expect(firstValues).toEqual([undefined]);
			expect(secondValues).toEqual([]);
		} finally {
			unmount(container);
			hosts.dispose();
		}
		expect(firstValues).toEqual([undefined]);
		expect(secondValues).toEqual([undefined]);
	});

	it('serializes contributed fragment markup as textarea data', async () => {
		const hosts = new FragmentPresentationHosts();
		const target = prototypeFragmentPlacement(
			fragment(null, 'A & B'),
			hosts.reconcile([contribution({ lang: 'en' })])
		);
		const operation = element('textarea', null, target);
		const rendered = await renderToHydratableString(serverRoot(operation));
		const server = document.createElement('div');
		server.innerHTML = rendered.html;
		const client = document.createElement('div');
		try {
			render(prototypeRoot(operation), client);
			expect(client.querySelector('textarea')?.value).toBe('<span lang="en">A &amp; B</span>');
			expect(server.querySelector('textarea')?.value).toBe(client.querySelector('textarea')?.value);
			expect(client.querySelector('textarea span')).toBeNull();
		} finally {
			unmount(client);
			hosts.dispose();
		}
	});
});
