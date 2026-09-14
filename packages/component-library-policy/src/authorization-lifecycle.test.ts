import { describe, expect, it } from 'vitest';
import {
	createFixture,
	createSession,
	recordCandidateGraph
} from './test-support/authorization.js';
describe('authorization generation settlement', () => {
	describe.each([false, true])('warm metadata cache: %s', (warm) => {
		it.each(['dispose', 'rejectGeneration', 'commitGeneration'] as const)(
			'fences pending authorization after %s',
			async (close) => {
				const fixture = createFixture();
				const session = createSession(fixture);
				recordCandidateGraph(session, fixture);
				if (warm) await session.authorizeResolvedComponent(fixture.candidate);
				const pending = session.authorizeResolvedComponent(fixture.candidate);
				const rejected = expect(pending).rejects.toMatchObject({ code: 'generation-stale' });
				await session[close]();
				await rejected;
				expect(session.getTelemetry()).toMatchObject({
					authorizedPackages: 0,
					omittedEnhancements: 0,
					importers: 0,
					participationCacheEntries: 0
				});
			}
		);
	});
});
