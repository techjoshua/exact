/** Request-owned FIFO scheduler for compiler-proven SSR work. */
export class AsyncSsrScheduler {
	readonly limit: number;
	private active = 0;
	private readonly queued: Array<() => void> = [];

	/** Normalizes the request limit to the supported range of one through 32. */
	constructor(limit: number | undefined) {
		this.limit =
			typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0
				? Math.min(limit, 32)
				: 4;
	}

	/** Runs one operation after acquiring a request-owned slot and always releases it. */
	async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		if (signal?.aborted)
			throw signal.reason ?? new DOMException('SSR render aborted', 'AbortError');
		await this.acquire(signal);
		try {
			return await work();
		} finally {
			this.release();
		}
	}

	/** Temporarily yields a held permit while nested scheduled work settles. */
	async suspend<T>(work: () => Promise<T>): Promise<T> {
		this.release();
		try {
			return await work();
		} finally {
			// Reacquire unconditionally so the outer run still owns the permit it releases.
			await this.acquire();
		}
	}

	private acquire(signal?: AbortSignal): Promise<void> {
		if (this.active < this.limit) {
			this.active++;
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const start = () => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener('abort', abort);
				this.active++;
				resolve();
			};
			const abort = () => {
				if (settled) return;
				settled = true;
				const index = this.queued.indexOf(start);
				if (index >= 0) this.queued.splice(index, 1);
				reject(signal?.reason ?? new DOMException('SSR render aborted', 'AbortError'));
			};
			this.queued.push(start);
			signal?.addEventListener('abort', abort, { once: true });
			// Close the race between the caller's initial check and listener registration.
			if (signal?.aborted) abort();
		});
	}

	private release(): void {
		if (this.active <= 0) throw new Error('eXact async SSR scheduler released an unowned slot');
		this.active--;
		this.queued.shift()?.();
	}
}
