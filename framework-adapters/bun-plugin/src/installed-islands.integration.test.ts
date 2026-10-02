import {
	verifyInstalledIslands,
	verifyInvalidInstalledIslands
} from '../../test-support/installed-islands-journey.js';

type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it'>;
const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('independently installed Bun split islands', () => {
	for (const stream of [false, true])
		testApi.it(
			`preserves independently installed split islands, streaming=${stream}`,
			() => verifyInstalledIslands('bun', stream),
			60_000
		);
	for (const fault of ['missing-facts', 'incompatible-facts', 'missing-client'] as const)
		testApi.it(
			`rejects invalid installed split islands, fault=${fault}`,
			() => verifyInvalidInstalledIslands('bun', fault),
			60_000
		);
});
