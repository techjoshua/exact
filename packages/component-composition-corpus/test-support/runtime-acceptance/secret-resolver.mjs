import { createSecretResolver } from '@exactjs/secrets/server';

/** Verifies atomic secret publication, pending-owner cancellation, and isolated reinitialization. */
export async function secretResolverJourney() {
	let releaseOld, releaseNext, enterOld, enterNext;
	const old = new Promise((resolve) => {
		releaseOld = resolve;
	});
	const next = new Promise((resolve) => {
		releaseNext = resolve;
	});
	const oldEntered = new Promise((resolve) => {
		enterOld = resolve;
	});
	const nextEntered = new Promise((resolve) => {
		enterNext = resolve;
	});
	let calls = 0,
		oldSignal;
	const resolver = createSecretResolver(
		{
			providers: [
				{
					name: 'held',
					load(context) {
						if (++calls === 1) {
							oldSignal = context.signal;
							enterOld();
							return old;
						}
						enterNext();
						return next;
					}
				}
			],
			required: [],
			allowPackages: []
		},
		{ applicationRoot: '/', environment: 'test', signal: new AbortController().signal }
	);
	const first = resolver.initialize(),
		sibling = resolver.initialize();
	const retired = Promise.allSettled([first, sibling]);
	let current;
	try {
		await oldEntered;
		await resolver.dispose();
		current = resolver.initialize();
		await nextEntered;
		releaseOld({ OLD: 'retired' });
		const outcomes = await retired;
		const shared = resolver.initialize();
		releaseNext({ NEW: 'ready', EMPTY: '' });
		await Promise.all([current, shared]);
		return {
			calls,
			cancelled: oldSignal.aborted,
			staleRejected: outcomes.every((outcome) => outcome.status === 'rejected'),
			oldAbsent: resolver.optional('OLD') === undefined,
			current: resolver.require('NEW'),
			empty: resolver.require('EMPTY')
		};
	} finally {
		releaseOld({});
		releaseNext({});
		await Promise.allSettled([first, sibling, current]);
		await resolver.dispose();
	}
}
