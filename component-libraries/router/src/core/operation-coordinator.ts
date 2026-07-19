export type RouterOperation = Readonly<{ id: number; abort: AbortController }>;

/** Owns cancellation and identity checks for overlapping router operations. */
export class RouterOperationCoordinator {
	private activeAbort: AbortController | undefined;
	private revalidationAbort: AbortController | undefined;
	transitionId = 0;
	revalidationId = 0;

	constructor(private readonly onCancelRevalidation: () => void) {}

	/** Starts navigation or submission work and supersedes prior authoritative work. */
	beginAuthoritative(): RouterOperation {
		this.activeAbort?.abort();
		this.cancelRevalidation();
		const abort = new AbortController();
		this.activeAbort = abort;
		return { id: ++this.transitionId, abort };
	}

	/** Returns whether an authoritative operation still owns publication rights. */
	owns(operation: RouterOperation): boolean {
		return (
			operation.id === this.transitionId &&
			this.activeAbort === operation.abort &&
			!operation.abort.signal.aborted
		);
	}

	/** Starts revalidation work without replacing current navigation ownership. */
	beginRevalidation(): RouterOperation {
		this.revalidationAbort?.abort();
		const abort = new AbortController();
		this.revalidationAbort = abort;
		return { id: ++this.revalidationId, abort };
	}

	/** Cancels independent revalidation and invalidates its publication token. */
	cancelRevalidation(): void {
		this.revalidationAbort?.abort();
		this.revalidationAbort = undefined;
		this.revalidationId++;
		this.onCancelRevalidation();
	}

	/** Cancels every operation owned by the router during disposal. */
	dispose(): void {
		this.activeAbort?.abort();
		this.revalidationAbort?.abort();
	}
}
