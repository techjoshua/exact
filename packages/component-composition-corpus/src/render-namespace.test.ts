/** @vitest-environment jsdom */
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import { namespaceProbeRoot } from './test-support/render-namespace.fixtures.js';
import { namespaceProbeRoot as serverRoot } from './test-support/render-namespace.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'])(
	'retains the parent around a client-only namespace child (%s)',
	async (mode) => {
		const host = document.createElement('div');
		document.body.append(host);
		onTestFinished(() => {
			dispose(host, true);
			host.remove();
		});
		let retained: HTMLInputElement | undefined;
		if (mode === 'hydrate') {
			const rendered = await renderToHydratableString(serverRoot());
			host.innerHTML = rendered.html;
			retained = host.querySelector('input')!;
			retained.value = 'unsaved';
			retained.focus();
			retained.setSelectionRange(2, 5);
			hydrate(namespaceProbeRoot(), host, {
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			expect(host.querySelector('input')).toBe(retained);
			expect(document.activeElement).toBe(retained);
			expect(retained.value).toBe('unsaved');
			expect([retained.selectionStart, retained.selectionEnd]).toEqual([2, 5]);
		} else render(namespaceProbeRoot(), host);
		const targets = [...host.querySelectorAll('[data-namespace-target]')];
		expect(targets).toHaveLength(4);
		expect(targets[0].namespaceURI).toBe('http://www.w3.org/2000/svg');
		for (const target of targets.slice(1))
			expect(target.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
		for (let count = 1; count <= 2; count++) {
			targets[count - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();
			for (const [index, target] of targets.entries()) {
				expect(host.querySelectorAll('[data-namespace-target]')[index]).toBe(target);
				expect(target.getAttribute('data-count')).toBe(String(count));
			}
		}
		for (const [name, namespace] of [
			['Show MathML child', 'http://www.w3.org/1998/Math/MathML'],
			['Show HTML child', 'http://www.w3.org/1999/xhtml']
		]) {
			[...host.querySelectorAll('button')].find((button) => button.textContent === name)!.click();
			flushSync();
			expect(host.querySelector('[data-namespace-range]')?.namespaceURI).toBe(namespace);
			const required = host.querySelector('[data-foreign-required]');
			expect(required?.namespaceURI).toBe(namespace);
			expect(required?.getAttribute('required')).toBe('');
			expect(required?.getAttribute('title')).toBe('line\nbreak');
			expect(required?.getAttribute('maxLength')).toBe('4');
			[...host.querySelectorAll('button')]
				.find((button) => button.textContent === 'Hide namespace child')!
				.click();
			flushSync();
			expect(host.querySelector('[data-namespace-range]')).toBeNull();
		}

		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
	}
);

it('rejects a client-only placeholder whose compiler identity differs', async () => {
	const host = document.createElement('div');
	onTestFinished(() => {
		dispose(host, true);
	});
	const rendered = await renderToHydratableString(serverRoot());
	const identity = /<!--exact:client-boundary:[^:]+:[^:]+:([^>]+)-->/u.exec(rendered.html)![1];
	host.innerHTML = rendered.html.replaceAll(identity, 'wrong-compiler-identity');
	expect(() =>
		hydrate(namespaceProbeRoot(), host, { resumptions: rendered.resumptions, onMismatch: 'throw' })
	).toThrow();
});
