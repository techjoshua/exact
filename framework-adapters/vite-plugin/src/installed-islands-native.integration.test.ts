import { describe, it } from 'vitest';
import { createInstalledIslandsFixture } from '../../test-support/installed-islands.js';
import { buildInstalledIslands } from '../../test-support/build-installed-islands.js';
import { verifyNativeInstalledIslands } from '../../test-support/installed-islands-native.mjs';

// Native executables are prepared by test:runtimes, which explicitly enables this suite.
const nativeAcceptance =
	process.env.EXACT_NATIVE_RUNTIME_ACCEPTANCE === '1' ? describe : describe.skip;

nativeAcceptance('independently installed islands on native hosts', () => {
	for (const stream of [false, true])
		for (const runtime of ['bun', 'deno', 'cloudflare'] as const)
			it(`retains installed islands on ${runtime}, streaming=${stream}`, async () => {
				const fixture = await createInstalledIslandsFixture(stream);
				try {
					await buildInstalledIslands('vite', fixture.root);
					await verifyNativeInstalledIslands(fixture.root, runtime);
				} finally {
					await fixture.dispose();
				}
			}, 90_000);
});
