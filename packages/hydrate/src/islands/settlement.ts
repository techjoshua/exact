import type { ComponentDomain } from '@exactjs/core';

const owners = new WeakMap<ComponentDomain, IslandSettlement>();

/** Tracks asynchronous adoption against its root rather than the shared module loader. */
export function trackIslandSettlement(domain: ComponentDomain, work: Promise<unknown>): void {
	owners.get(domain)?.track(work);
}

/** Owns eager and activated island work, retaining failures for callers awaiting readiness. */
export class IslandSettlement {
	private readonly pending = new Set<Promise<void>>();
	private failure: { error: unknown } | undefined;
	private readonly aborted: Promise<void>;
	private abort!: () => void;

	/** Installs a root-local tracker; abort releases waiters even when imports never finish. */
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
