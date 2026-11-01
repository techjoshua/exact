/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { intrinsicChildContainer } from './renderer/intrinsic-child-container.js';
import { unmount } from './public.js';
import {
	mountTemplateText,
	mountForeignTemplateText
} from './test-support/roots/mount-work.fixtures.js';

it('mounts and updates native template content while retaining its host and text identity', () => {
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
	mountTemplateText(host, 'first', options);
	const template = host.querySelector('template')!;
	const text = template.content.firstChild;
	expect(template.childNodes).toHaveLength(0);
	expect(template.content.textContent).toBe('first');
	mountTemplateText(host, 'next', options);
	expect(host.querySelector('template')).toBe(template);
	expect(template.content.firstChild).toBe(text);
	expect(template.content.textContent).toBe('next');
	unmount(host);
	expect(host.childNodes).toHaveLength(0);
	expect(template.isConnected).toBe(false);
	expect(template.content.textContent).toBe('next');
	mountTemplateText(host, 'following', options);
	expect(host.querySelector('template')!.content.textContent).toBe('following');
	expect(reports).toEqual([]);
});

it('keeps foreign template children in their SVG element through mount and update', () => {
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
	mountForeignTemplateText(host, 'first', options);
	const template = host.querySelector('template')!;
	expect(template.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(template.textContent).toBe('first');
	mountForeignTemplateText(host, 'next', options);
	expect(host.querySelector('template')).toBe(template);
	expect(template.textContent).toBe('next');
	unmount(host);
	expect(host.childNodes).toHaveLength(0);
	expect(reports).toEqual([]);
});

it('selects the native HTML content capability across realms without changing other containers', () => {
	const frame = document.createElement('iframe');
	document.body.append(frame);
	onTestFinished(() => frame.remove());
	const template = frame.contentDocument!.createElement('template');
	expect(template instanceof HTMLTemplateElement).toBe(false);
	expect(intrinsicChildContainer(template)).toBe(template.content);
	const detachedDocument = document.implementation.createHTMLDocument();
	const detachedTemplate = detachedDocument.createElement('template');
	expect(intrinsicChildContainer(detachedTemplate)).toBe(detachedTemplate.content);
	const element = document.createElement('section');
	expect(intrinsicChildContainer(element)).toBe(element);
	const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'template');
	expect(intrinsicChildContainer(foreign)).toBe(foreign);
	const fragment = document.createDocumentFragment();
	expect(intrinsicChildContainer(fragment)).toBe(fragment);
});
