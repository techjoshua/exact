import type { ComponentDomain } from '@exactjs/core';

const owners = new WeakMap<ComponentDomain, HydrationSettlement>();

/** Tracks asynchronous adoption against its root rather than the shared module loader. */
export function trackHydrationSettlement(domain: ComponentDomain, work: Promise<unknown>): void {
	owners.get(domain)?.track(work);
}

/** Releases a readiness waiter when its owning root is disposed, without cancelling a shared import. */
export function waitForHydrationReadiness(
	domain: ComponentDomain,
	work: Promise<unknown>
): Promise<unknown> {
	return owners.get(domain)?.wait(work) ?? work;
}

/** Owns root and activated island work, retaining failures for callers awaiting readiness. */
export class HydrationSettlement {
	private readonly pending = new Set<Promise<void>>();
	private failure: { error: unknown } | undefined;
	private readonly aborted: Promise<void>;
	private abort!: () => void;

	/** Installs a root-local tracker. Abort releases waiters even when imports never finish. */
	constructor(
		domain: ComponentDomain,
		private readonly signal: AbortSignal
	) {
		owners.set(domain, this);
		this.aborted = new Promise((resolve) => {
			this.abort = resolve;
		});
		if (signal.aborted) this.abort();
		else signal.addEventListener('abort', this.abort, { once: true });
	}

	/** Waits for shared work only while this root remains active. */
	wait(work: Promise<unknown>): Promise<unknown> {
		return Promise.race([work, this.aborted]);
	}

	/** Observes completion without creating an unhandled rejection for fire-and-forget hydration. */
	track(work: Promise<unknown>): void {
		const settled = work
			.then(
				() => {},
				(error: unknown) => {
					this.failure ??= { error };
				}
			)
			.finally(() => {
				this.pending.delete(settled);
			});
		this.pending.add(settled);
	}

	/** Waits for adoption and recursively discovered islands, rejecting load failures or cancellation. */
	async whenSettled(): Promise<void> {
		while (this.pending.size && !this.signal.aborted)
			await Promise.race([Promise.all(this.pending), this.aborted]);
		if (this.signal.aborted) throw this.signal.reason;
		if (this.failure) throw this.failure.error;
	}
}
