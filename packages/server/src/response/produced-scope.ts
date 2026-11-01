import { attachSuppressedCleanupFailure } from '@exactjs/core';
import type { ExactResponseBodyOperations, ExactResponseBodyScopeRelease } from './body.js';

/** Owns retained request resources until one produced body settles or cancels. */
export class ProducedResponseScope {
	private release: ExactResponseBodyScopeRelease | undefined;
	private signal: AbortSignal | undefined;
	private abort: (() => void) | undefined;
	private completion: Promise<void> | undefined;

	/** Transfers a scope before production and forwards the request's exact abort reason. */
	retain(
		release: ExactResponseBodyScopeRelease,
		signal: AbortSignal | undefined,
		body: Pick<ExactResponseBodyOperations, 'cancel'>
	): void {
		if (this.release) throw new TypeError('eXact response body already owns a request scope');
		this.release = release;
		this.signal = signal;
		this.abort = () => {
			const reason = signal?.reason;
			void body.cancel(reason).catch((cleanup) => attachSuppressedCleanupFailure(reason, cleanup));
		};
		if (signal?.aborted) this.abort();
		else signal?.addEventListener('abort', this.abort, { once: true });
	}

	/** Releases once, preserving a production failure when scope cleanup also fails. */
	finish(reason: unknown, failure?: { error: unknown }): Promise<void> | undefined {
		if (this.completion) return this.completion;
		const release = this.release;
		this.release = undefined;
		if (this.abort) this.signal?.removeEventListener('abort', this.abort);
		this.abort = undefined;
		this.signal = undefined;
		if (!release) return undefined;
		this.completion = release(reason).catch((cleanup) => {
			if (failure) {
				attachSuppressedCleanupFailure(failure.error, cleanup);
				return;
			}
			throw cleanup;
		});
		return this.completion;
	}
}
