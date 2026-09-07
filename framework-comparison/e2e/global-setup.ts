/** Starts the selected production runtime and returns its owning harness teardown. */
export default async function globalSetup() {
	const harness =
		process.env.COMPARISON_E2E_RUNTIME === 'bun'
			? await import('../src/e2e-bun-server.mjs')
			: await import('../src/e2e-server.mjs');
	return harness.close;
}
