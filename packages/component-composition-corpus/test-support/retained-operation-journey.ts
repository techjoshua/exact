import { flushSync } from '@exactjs/reactive';
import { unmount } from '@exactjs/dom/root';
import * as fixture from './retained-operation.fixtures.js';

/** Checks that list selection preserves the supplied owner while removed siblings retire normally. */
export async function verifyRetainedOperationIdentity() {
	const host = document.createElement('div');
	document.body.append(host);
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: unknown) => reports.push(report) };
	const initialSpans = fixture.spanDisposals;
	const initialButtons = fixture.buttonDisposals;
	try {
		fixture.mount(host, [fixture.spanOperation, fixture.stableOperation], options);
		const button = host.querySelector('button');
		const section = host.querySelector('section');
		const parent = fixture.parentOwner;
		const owner = fixture.buttonOwner;
		if (!button || !section || owner.refs.get(fixture.buttonRef) !== button)
			throw new Error('Missing initial native button/ref anchor');
		button.click();
		flushSync();
		if (button.textContent !== '1') throw new Error('Initial interaction did not progress');
		let span = host.querySelector('span');
		let removedSpan: Element | null = null;
		let removedOwner = fixture.spanOwner;
		let removals = 0;
		for (const items of [
			[fixture.stableOperation],
			[fixture.stableOperation, fixture.spanOperation],
			['before', fixture.spanOperation, 'between', fixture.stableOperation, 'after'],
			[fixture.spanOperation, fixture.stableOperation],
			[fixture.stableOperation],
			[fixture.spanOperation, fixture.stableOperation]
		]) {
			const previous = span;
			const previousOwner = fixture.spanOwner;
			fixture.mount(host, items, options);
			flushSync();
			span = host.querySelector('span');
			if (previous && !span) {
				removals++;
				removedSpan = previous;
				removedOwner = previousOwner;
			}
			if (!previous && span && (span === removedSpan || fixture.spanOwner === removedOwner))
				throw new Error('Restoration revived a retired conditional owner');
			if (previous && span && (previous !== span || fixture.spanOwner !== previousOwner))
				throw new Error('Moving the same supplied conditional handle replaced its live owner');
			if (
				host.querySelector('button') !== button ||
				fixture.buttonOwner !== owner ||
				owner.refs.get(fixture.buttonRef) !== button ||
				fixture.parentOwner !== parent ||
				host.querySelector('section') !== section ||
				button.textContent !== '1'
			)
				throw new Error('Sibling selection replaced the retained native button or parent');
			if (
				fixture.spanDisposals !== initialSpans + removals ||
				fixture.buttonDisposals !== initialButtons
			)
				throw new Error('Sibling cleanup did not match actual removed ownership');
		}
		button.click();
		flushSync();
		if (host.querySelector('button')?.textContent !== '2')
			throw new Error('Retained interaction lost its state');
		unmount(host);
		if (
			owner.refs.get(fixture.buttonRef) !== undefined ||
			host.childNodes.length ||
			fixture.buttonDisposals !== initialButtons + 1 ||
			fixture.spanDisposals !== initialSpans + removals + 1
		)
			throw new Error('Final disposal retained a range/ref or repeated cleanup');
		fixture.mount(host, [fixture.stableOperation], options);
		if (fixture.buttonOwner === owner || host.querySelector('button')?.textContent !== '0')
			throw new Error('Fresh mounting reused disposed owner state');
		unmount(host);
		if (fixture.buttonDisposals !== initialButtons + 2 || reports.length)
			throw new Error('Fresh progress or final reports failed');
		return {
			retained: true,
			restored: true,
			interaction: true,
			cleanup: true,
			fresh: true,
			reports
		};
	} finally {
		unmount(host);
		host.remove();
	}
}
