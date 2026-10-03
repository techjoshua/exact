import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate/enhanced';
import { flushSync } from '@exactjs/reactive';
import { pendingOwnerRoot } from './pending-owner-overlap.fixtures.js';
import { corpus } from '../scenarios/enhancement-implementation.fixtures.js';
import type { PendingOwnerHarness } from './pending-owner-journey.js';

/** Supplies the client half while each backend owns server rendering and metadata delivery. */
export function createPendingOwnerHarness(
	serverRender: (
		props: Parameters<PendingOwnerHarness['start']>[0]
	) => Promise<{
		html: string;
		resumptions?: NonNullable<Parameters<typeof hydrate>[2]>['resumptions'];
	}>
): PendingOwnerHarness {
	const identity = '../scenarios/enhancement-routing.fixtures.js#corpus';
	const options = (report: (value: unknown) => void) => ({
		enhancementCatalog: new Map([[identity, corpus]]),
		onErrorReport: report
	});
	return {
		async start(props, container, entry, report) {
			if (entry === 'mount') render(pendingOwnerRoot(props), container, options(report));
			else {
				const rendered = await serverRender(props);
				container.innerHTML = rendered.html;
				const initial = container.querySelector('section');
				hydrate(pendingOwnerRoot(props), container, {
					...options(report),
					resumptions: rendered.resumptions,
					onMismatch: 'throw'
				});
				if (container.querySelector('section') !== initial)
					throw new Error('Hydration replaced the authored host');
			}
		},
		update(props, container, report) {
			render(pendingOwnerRoot(props), container, options(report));
			flushSync();
		},
		dispose(container) {
			dispose(container, true);
		}
	};
}
