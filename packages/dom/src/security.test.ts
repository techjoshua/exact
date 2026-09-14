/**
 * @vitest-environment jsdom
 */
import { BLOCKED_JAVASCRIPT_URL, unsafeHtml } from '@exactjs/core';
import './unsafe-html.js';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { createOperation } from './test-support/native-operations.js';
import { applyDomProp } from './props.js';
import { unmount } from './root.js';

describe('@exactjs/dom security', () => {
	it.each(['innerHTML', 'INNERHTML', 'outerHTML', 'OUTERHTML', 'onclick', 'ONCLICK', 'SRCDOC'])(
		'rejects rootless unsafe %s patches before changing DOM',
		(name) => {
			const element = document.createElement('div');
			element.textContent = 'preserved';
			expect(() => applyDomProp(element, name, '<img onerror="bad">')).toThrow();
			expect(element.textContent).toBe('preserved');
			expect(element.attributes.length).toBe(0);
		}
	);
	it.each(['onclick', 'ONCLICK', 'onClick'])('binds %s as a callback', (name) => {
		const container = document.createElement('div');
		const handler = vi.fn();
		try {
			render(createOperation('button', { [name]: handler }, 'click'), container);
			const button = container.querySelector('button')!;
			button.click();
			expect(handler).toHaveBeenCalledTimes(1);
			expect(button.hasAttribute('onclick')).toBe(false);
		} finally {
			unmount(container);
		}
	});
	it('mounts and replaces opted-in opaque unsafe HTML ranges', () => {
		const container = document.createElement('div');
		const audit = vi.fn();

		render(createOperation('section', null, unsafeHtml('<strong>first</strong>')), container, {
			allowUnsafeHtml: true,
			onUnsafeHtml: audit
		});
		expect(container.innerHTML).toContain('<strong>first</strong>');

		render(
			createOperation('section', null, unsafeHtml('<em>second</em><span>tail</span>')),
			container
		);
		expect(container.querySelector('section')?.innerHTML).toContain(
			'<em>second</em><span>tail</span>'
		);
		expect(container.querySelector('strong')).toBeNull();
		expect(audit).toHaveBeenCalledTimes(2);
	});

	it('applies the native javascript URL guard on mount and updates', () => {
		const container = document.createElement('div');
		render(createOperation('a', { href: 'java\nscript:alert(1)' }, 'blocked'), container);
		expect(container.querySelector('a')?.getAttribute('href')).toBe(BLOCKED_JAVASCRIPT_URL);

		render(createOperation('a', { href: '/safe' }, 'safe'), container);
		expect(container.querySelector('a')?.getAttribute('href')).toBe('/safe');
	});

	it('routes iframe srcdoc through the unsafe HTML capability and root audit', () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const plainContainer = document.createElement('div');
		const unconfiguredContainer = document.createElement('div');
		render(createOperation('iframe', { srcdoc: '<p>untrusted</p>' }), plainContainer);
		render(
			createOperation('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }),
			unconfiguredContainer
		);
		expect(plainContainer.querySelector('iframe')).toBeNull();
		expect(unconfiguredContainer.querySelector('iframe')).toBeNull();
		logged.mockRestore();

		const container = document.createElement('div');
		const audit = vi.fn();
		render(createOperation('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }), container, {
			allowUnsafeHtml: true,
			onUnsafeHtml: audit
		});
		expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<p>trusted</p>');
		expect(audit).toHaveBeenCalledWith({ characters: 14 });
	});

	it('creates intrinsic scripts inertly during client mounting', () => {
		const container = document.createElement('div');
		delete (globalThis as { __exactScriptRan?: boolean }).__exactScriptRan;
		render(
			createOperation(
				'script',
				{
					nonce: 'request-nonce',
					noModule: true
				},
				'globalThis.__exactScriptRan = true;'
			),
			container
		);
		const script = container.querySelector('script');
		expect(script?.textContent).toBe('globalThis.__exactScriptRan = true;');
		expect(script?.nonce).toBe('request-nonce');
		expect((globalThis as { __exactScriptRan?: boolean }).__exactScriptRan).toBeUndefined();
	});
});
