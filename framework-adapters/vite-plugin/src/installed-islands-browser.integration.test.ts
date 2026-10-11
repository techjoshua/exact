import { describe, it } from 'vitest';
import { createInstalledIslandsFixture } from '../../test-support/installed-islands.js';
import { buildInstalledIslands } from '../../test-support/build-installed-islands.js';
import { verifyInstalledBrowser } from '../../test-support/installed-islands-browser.mjs';

const acceptance = process.env.EXACT_NATIVE_RUNTIME_ACCEPTANCE === '1' ? describe : describe.skip;
acceptance('installed component ownership in Chromium', () => {
	for (const stream of [false, true])
		it(`retains installed owners in Chromium, streaming=${stream}`, async () => {
			const fixture = await createInstalledIslandsFixture(stream);
			try {
				await buildInstalledIslands('vite', fixture.root);
				await verifyInstalledBrowser(fixture.root);
			} finally {
				await fixture.dispose();
			}
		}, 90_000);
});
