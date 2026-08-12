/** Running production listeners for the isolated native-full-stack track. */
export type NativeHarness = {
	/** Stops both listeners and releases their child processes. */
	close(): Promise<void>;
};

/** Starts both native-full-stack production listeners. */
export function startNativeHarness(): Promise<NativeHarness>;
