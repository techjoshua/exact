/**
 * @vitest-environment jsdom
 */
import { createVNode, type Component } from '@exact/core';
import { flushSync, registerReactiveListKey } from '@exact/reactive';
import { renderHydrationScript, renderToHydratableString } from '@exact/ssr';
import { expect, it } from 'vitest';
import { hydrate, readExactHydrationConfig } from './index.js';

it('reports opt-in hydration timings', () => {
	function Profiled() {
		return () => createVNode('p', null, 'profiled');
	}
	const vnode = createVNode(Profiled, null);
	const container = document.createElement('div');
	container.innerHTML = renderToHydratableString(vnode).htmlWithHydration;
	const events: Array<{ subsystem: string; phase: string }> = [];

	hydrate(vnode, container, { onProfile: (event) => events.push(event) });

	expect(events).toContainEqual(
		expect.objectContaining({
			subsystem: 'hydrate',
			phase: 'hydrate'
		})
	);
});

it('adopts a complete authored document while retaining framework-owned body augmentation', () => {
	function DocumentApp(this: Component<{ count: number }>) {
		this.state.count = 1;
		return () =>
			createVNode(
				'html',
				{ lang: 'en' },
				createVNode('head', null, createVNode('title', null, `Count ${this.state.count}`)),
				createVNode(
					'body',
					null,
					createVNode(
						'button',
						{
							onClick: () => {
								this.state.count++;
							}
						},
						`Count ${this.state.count}`
					)
				)
			);
	}

	const rendered = renderToHydratableString(createVNode(DocumentApp, null), {
		endpoint: '/__exact'
	});
	document.open();
	document.write(rendered.htmlWithHydration);
	document.close();
	const originalHtml = document.documentElement;
	const frameworkScript = document.getElementById('__exact_hydration');

	const client = hydrate(createVNode(DocumentApp, null), document, { onMismatch: 'throw' });

	expect(document.documentElement).toBe(originalHtml);
	expect(document.getElementById('__exact_hydration')).toBe(frameworkScript);
	const button = document.querySelector('button')!;
	button.click();
	flushSync();
	expect(button.textContent).toBe('Count 2');
	expect(document.title).toBe('Count 2');
	expect(frameworkScript?.previousSibling).toBeInstanceOf(Comment);
	expect((frameworkScript?.previousSibling as Comment).data).toBe('exact:framework-body:start');
	client.dispose();
	document.open();
	document.write('<!doctype html><html><head></head><body></body></html>');
	document.close();
});

it('decodes keyed hydration collection envelopes into ordinary arrays', () => {
	const records = [
		{ id: 'a', title: 'A' },
		{ id: 'b', title: 'B' }
	];
	registerReactiveListKey(
		records,
		(item) => (item as { id: string }).id,
		'hydrate config test',
		'member:id'
	);
	const root = document.createElement('div');
	root.innerHTML = renderHydrationScript({ state: { records } });
	const config = readExactHydrationConfig(root);
	expect((config.state as any).records).toEqual(records);
	expect(Array.isArray((config.state as any).records)).toBe(true);
	expect(Object.keys((config.state as any).records)).toEqual(['0', '1']);
});
