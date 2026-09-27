let release!: (value: string) => void;
let pending: Promise<string>;
/** Starts an independently controlled task source. */
export function reset() {
	pending = new Promise((resolve) => {
		release = resolve;
	});
}
/** Returns the source awaited by the compiled component task. */
export function result() {
	return pending;
}
/** Resolves the source while the test controls Activity presentation. */
export function finish() {
	release('ready');
}
