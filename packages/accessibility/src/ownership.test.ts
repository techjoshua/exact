/** @vitest-environment jsdom */
import '../../../packages/dom/src/framework/enhancements.js';
import '@exactjs/core/runtime/refs';
import { flushSync } from '@exactjs/reactive';
import { unmount } from '@exactjs/dom';
import { expect, it, onTestFinished } from 'vitest';
import { Accessibility } from './components.js';
import {
	mountAccessibilityOwnership,
	accessibilityOwner,
	accessibilityRoot,
	accessibilityReleased
} from '../../component-composition-corpus/test-support/accessibility/ownership.fixtures.js';
const enhancementCatalog = new Map([
	['@exactjs/accessibility/enhancements#activeDescendant', Accessibility]
]);
function ownedHost() {
	const host = document.createElement('div');
	document.body.append(host);
	onTestFinished(() => {
		unmount(host);
		host.remove();
	});
	return host;
}
it('retains compiled intrinsic/relationship/focus ownership and releases the published owner', () => {
	const host = ownedHost(),
		opener = document.createElement('button');
	document.body.append(opener);
	onTestFinished(() => opener.remove());
	opener.focus();
	const reports: unknown[] = [];
	const options = {
		enhancementCatalog,
		onErrorReport: (r: { error: unknown }) => reports.push(r.error)
	};
	mountAccessibilityOwnership(host, true, options);
	flushSync();
	const owner = accessibilityOwner!,
		root = owner.refs.get(accessibilityRoot),
		button = host.querySelector('button')!,
		help = host.querySelector('span')!,
		input = host.querySelector('input')!;
	expect(button.getAttribute('aria-describedby')).toBe(help.id);
	expect(button.getAttribute('aria-controls')).toBe('authored-controls');
	expect(document.activeElement).toBe(input);
	mountAccessibilityOwnership(host, false, options);
	flushSync();
	expect(accessibilityOwner).toBe(owner);
	expect(owner.refs.get(accessibilityRoot)).toBe(root);
	expect(host.querySelector('button')).toBe(button);
	expect(button.hasAttribute('aria-describedby')).toBe(false);
	mountAccessibilityOwnership(host, true, options);
	flushSync();
	expect(button.getAttribute('aria-describedby')).toBe(help.id);
	unmount(host);
	expect(owner.refs.get(accessibilityRoot)).toBeUndefined();
	expect(accessibilityReleased.filter((x) => x === owner)).toHaveLength(1);
	expect(document.activeElement).toBe(opener);
	mountAccessibilityOwnership(host, true, options);
	flushSync();
	expect(accessibilityOwner).not.toBe(owner);
	unmount(host);
	expect(reports).toEqual([]);
});
it('keeps an inner composite boundary key local without stopping unhandled bubbling', () => {
	const host = ownedHost();
	mountAccessibilityOwnership(host, true, { enhancementCatalog });
	flushSync();
	const outer = host.querySelector('[aria-label="Outer"]')!,
		inner = host.querySelector('[aria-label="Inner"]')!,
		first = inner.firstElementChild as HTMLElement,
		last = inner.lastElementChild as HTMLElement;
	const bubbled: KeyboardEvent[] = [];
	outer.addEventListener('keydown', (e) => bubbled.push(e as KeyboardEvent));
	first.focus();
	first.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
	);
	expect(document.activeElement).toBe(last);
	const boundary = new KeyboardEvent('keydown', {
		key: 'ArrowDown',
		bubbles: true,
		cancelable: true
	});
	last.dispatchEvent(boundary);
	expect(document.activeElement).toBe(last);
	expect(boundary.defaultPrevented).toBe(false);
	expect(bubbled).toContain(boundary);
	const untouched = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
	last.dispatchEvent(untouched);
	expect(untouched.defaultPrevented).toBe(false);
	expect(bubbled).toContain(untouched);
	unmount(host);
	const released = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
	last.dispatchEvent(released);
	expect(released.defaultPrevented).toBe(false);
});
