interface ActiveDocumentAnalysis {
	readonly controller: AbortController;
	readonly version: number;
}

/**
 * Owns per-document analysis generations and the presentation-readiness fence.
 * A duplicate notification for the active version joins the existing generation
 * instead of cancelling the only analysis capable of publishing that version.
 */
export class ExactDocumentAnalysisState {
	readonly #active = new Map<string, ActiveDocumentAnalysis>();
	readonly #presented = new Map<string, number>();

	/** Starts a newer generation, or returns nothing when that generation is already running. */
	start(uri: string, version: number): AbortController | undefined {
		const current = this.#active.get(uri);
		if (current?.version === version) return undefined;
		current?.controller.abort();
		this.#presented.delete(uri);
		const controller = new AbortController();
		this.#active.set(uri, { version, controller });
		return controller;
	}

	/** Reports whether a controller still owns the current generation. */
	isCurrent(uri: string, controller: AbortController): boolean {
		return this.#active.get(uri)?.controller === controller;
	}

	/** Publishes a completed generation and allows presentation requests for its version. */
	publish(uri: string, version: number, controller: AbortController): boolean {
		if (!this.isCurrent(uri, controller) || controller.signal.aborted) return false;
		this.#active.delete(uri);
		this.#presented.set(uri, version);
		return true;
	}

	/** Releases a settled generation without disturbing a newer owner. */
	finish(uri: string, controller: AbortController): void {
		if (this.isCurrent(uri, controller)) this.#active.delete(uri);
	}

	/** Blocks presentation during analysis and until the open document version is published. */
	presentationBlocked(uri: string, version: number | undefined): boolean {
		return this.#active.has(uri) || version === undefined || this.#presented.get(uri) !== version;
	}

	/** Cancels and forgets all state for a closed document. */
	close(uri: string): void {
		this.#active.get(uri)?.controller.abort();
		this.#active.delete(uri);
		this.#presented.delete(uri);
	}

	/** Cancels every owned generation and clears all readiness state. */
	dispose(): void {
		for (const analysis of this.#active.values()) analysis.controller.abort();
		this.#active.clear();
		this.#presented.clear();
	}
}
