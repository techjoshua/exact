import { unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import {
	mountAccessibilityOwnership,
	accessibilityOwner,
	accessibilityRoot,
	accessibilityReleased
} from './ownership.fixtures.js';

/** Executes the same compiled public enhancement contract in each adapter's native browser bundle. */
export function verifyAccessibilityOwnership() {
	const host = document.createElement('div'),
		opener = document.createElement('button');
	document.body.append(opener, host);
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
	try {
		opener.focus();
		mountAccessibilityOwnership(host, true, options);
		flushSync();
		const owner = accessibilityOwner!,
			root = owner.refs.get(accessibilityRoot),
			button = host.querySelector('button')!,
			help = host.querySelector('span')!,
			input = host.querySelector('input')!;
		if (!button || !help || !input)
			throw new Error(JSON.stringify({ html: host.innerHTML, reports: reports.map(String) }));
		const initial =
			button.getAttribute('aria-describedby') === help.id &&
			button.getAttribute('aria-controls') === 'authored-controls' &&
			document.activeElement === input;
		mountAccessibilityOwnership(host, false, options);
		flushSync();
		const retained =
			accessibilityOwner === owner &&
			owner.refs.get(accessibilityRoot) === root &&
			host.querySelector('button') === button &&
			!button.hasAttribute('aria-describedby');
		mountAccessibilityOwnership(host, true, options);
		flushSync();
		const restored = button.getAttribute('aria-describedby') === help.id;
		unmount(host);
		const disposed =
			!owner.refs.get(accessibilityRoot) &&
			accessibilityReleased.filter((x) => x === owner).length === 1 &&
			document.activeElement === opener;
		mountAccessibilityOwnership(host, true, options);
		flushSync();
		const outer = host.querySelector('[aria-label="Outer"]')!,
			inner = host.querySelector('[aria-label="Inner"]')!,
			last = inner.lastElementChild as HTMLElement,
			first = inner.firstElementChild as HTMLElement;
		const bubbled: Event[] = [];
		const observe = (e: Event) => bubbled.push(e);
		outer.addEventListener('keydown', observe);
		let boundaryOwned = false;
		try {
			first.focus();
			first.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
			);
			const boundary = new KeyboardEvent('keydown', {
				key: 'ArrowDown',
				bubbles: true,
				cancelable: true
			});
			last.dispatchEvent(boundary);
			boundaryOwned =
				document.activeElement === last && !boundary.defaultPrevented && bubbled.includes(boundary);
		} finally {
			outer.removeEventListener('keydown', observe);
		}
		const item = outer.firstElementChild as HTMLElement;
		item.setAttribute('tabindex', '7');
		const unhandled = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
		item.dispatchEvent(unhandled);
		const republished = item.getAttribute('tabindex') === '0' && !unhandled.defaultPrevented;
		unmount(host);
		const externalRestored = item.getAttribute('tabindex') === '7';
		const releasedKey = new KeyboardEvent('keydown', {
			key: 'Home',
			bubbles: true,
			cancelable: true
		});
		last.dispatchEvent(releasedKey);
		mountAccessibilityOwnership(host, true, options);
		flushSync();
		const progress =
			accessibilityOwner !== owner && document.activeElement === host.querySelector('input');
		unmount(host);
		if (
			!initial ||
			!retained ||
			!restored ||
			!disposed ||
			!boundaryOwned ||
			!republished ||
			!externalRestored ||
			releasedKey.defaultPrevented ||
			!progress ||
			reports.length
		)
			throw new Error('Accessibility ownership contract failed');
		return {
			initial,
			retained,
			restored,
			disposed,
			boundaryOwned,
			republished,
			externalRestored,
			listenerReleased: !releasedKey.defaultPrevented,
			progress,
			reports
		};
	} finally {
		unmount(host);
		host.remove();
		opener.remove();
	}
}
