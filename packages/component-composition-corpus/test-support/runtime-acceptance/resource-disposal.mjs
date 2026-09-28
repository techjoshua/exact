import { ownTaskResource } from '@exactjs/core/runtime/tasks';

/** Verifies compiler-facing disposal precedence and independent cancellation lifetimes. */
export async function resourceDisposalJourney() {
	const calls = [];
	for (const asynchronous of [false, true]) {
		const owner = new AbortController();
		ownTaskResource(owner.signal, {
			[Symbol.asyncDispose]() {
				calls.push(asynchronous ? 'async-promise' : 'async-void');
				return asynchronous ? Promise.resolve() : undefined;
			},
			[Symbol.dispose]() {
				calls.push('unexpected-sync');
			}
		});
		owner.abort('complete');
		owner.abort('again');
		await Promise.resolve();
	}
	const next = new AbortController();
	ownTaskResource(next.signal, {
		[Symbol.dispose]() {
			calls.push('sync-only');
		}
	});
	next.abort();
	return calls;
}
