let callback = () => {};

/** Installs the synchronous action exercised by replay lifecycle tests. */
export function observeReplay(callbackForTest: () => void): void {
	callback = callbackForTest;
}

/** Keeps a stable server target while a replayed handler changes its owner's lifetime. */
export function ReplayCounter() {
	return () => (
		<button data-exact-id="action" onClick={() => callback()}>
			Count
		</button>
	);
}
