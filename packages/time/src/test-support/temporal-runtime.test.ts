import { expect, it, onTestFinished, vi } from 'vitest';

it.each([undefined, { host: 'native' }])('preserves the host Temporal choice: %j', async (host) => {
	vi.resetModules();
	vi.stubGlobal('Temporal', host);
	onTestFinished(() => {
		vi.unstubAllGlobals();
	});
	await import('./temporal-runtime.js');
	const temporal = Reflect.get(globalThis, 'Temporal');
	if (host) expect(temporal).toBe(host);
	else expect(temporal.Instant.fromEpochMilliseconds(1250).epochMilliseconds).toBe(1250);
});
