import { startNativeHarness } from '../src/native-harness.mjs';

/** Starts the isolated native production harness and returns its teardown. */
export default async function globalSetup() {
	const harness = await startNativeHarness();
	return () => harness.close();
}
