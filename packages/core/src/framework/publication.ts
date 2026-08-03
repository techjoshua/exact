import { flushSync } from '@exactjs/reactive';

/** Receipt returned by one authoritative synchronous framework publication. */
export interface FrameworkPublicationCommit {
	/** Settles after reactive renderer consequences caused by the publication have flushed. */
	readonly rendered: PromiseLike<void>;
}

/** One cancelable request to publish already-prepared framework state exactly once. */
export interface FrameworkPublicationRequest<Metadata = unknown> {
	readonly kind: string;
	readonly signal: AbortSignal;
	readonly metadata: Metadata;
	publish(): FrameworkPublicationCommit;
}

/** Coordinates the timing around an authoritative framework publication. */
export interface FrameworkPublicationCoordinator<Metadata = unknown> {
	publish(request: FrameworkPublicationRequest<Metadata>): void | PromiseLike<void>;
}

/** Creates a receipt that flushes reactive consequences in the next microtask. */
export function createFrameworkPublicationCommit(): FrameworkPublicationCommit {
	return Object.freeze({
		rendered: Promise.resolve().then(() => flushSync())
	});
}
