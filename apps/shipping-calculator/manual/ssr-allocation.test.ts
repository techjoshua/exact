import inspector from 'node:inspector';
import { afterAll, describe, expect, it } from 'vitest';
import { createShippingSsrFixture } from './test-support/shipping-ssr-fixture.js';

const fixture = createShippingSsrFixture();

describe('shipping SSR transient allocation volume', () => {
	afterAll(async () => fixture.dispose());

	it('keeps warmed production-marker allocation below the reviewed ceiling', async () => {
		for (let index = 0; index < 100; index++) await fixture.render();
		const session = new inspector.Session();
		session.connect();
		try {
			await post(session, 'HeapProfiler.enable');
			await post(session, 'HeapProfiler.startSampling', {
				samplingInterval: 8192,
				includeObjectsCollectedByMajorGC: true,
				includeObjectsCollectedByMinorGC: true
			});
			for (let index = 0; index < 200; index++) await fixture.render();
			const { profile } = await post<{ profile: SamplingProfile }>(
				session,
				'HeapProfiler.stopSampling'
			);
			const bytesPerRequest = sampledBytes(profile.head) / 200;
			console.info(`shipping SSR sampled allocation: bytesPerRequest=${bytesPerRequest}`);

			// Sampling is diagnostic and environment-sensitive; this broad ceiling detects
			// regression to marker fallbacks or subtree flattening rather than small engine noise.
			expect(bytesPerRequest).toBeLessThan(5.5 * 1024 * 1024);
		} finally {
			session.disconnect();
		}
	}, 120_000);
});

type SamplingNode = Readonly<{
	selfSize: number;
	children?: readonly SamplingNode[];
}>;
type SamplingProfile = Readonly<{ head: SamplingNode }>;

function post<Result = unknown>(
	session: inspector.Session,
	method: string,
	params: object = {}
): Promise<Result> {
	return new Promise((resolve, reject) => {
		session.post(method, params, (error, result) =>
			error ? reject(error) : resolve(result as Result)
		);
	});
}

function sampledBytes(node: SamplingNode): number {
	let total = node.selfSize;
	for (const child of node.children ?? []) total += sampledBytes(child);
	return total;
}
