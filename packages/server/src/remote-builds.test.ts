import { describe, expect, it } from 'vitest';
import {
	defineExactActionContract,
	handleExactRequest,
	type ExactRemoteBuildRegistration
} from './index.js';
import { context } from './test-support/server.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('build-keyed execution-root dispatch', () => {
	it('selects colliding local ids by build and root inside one batch', async () => {
		let authorizationCalls = 0;
		const build = registration({
			'@company/billing#./Area': 'billing',
			'@company/branding#./Shell': 'branding'
		});
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-build': buildKey },
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{ type: 'action', root: '@company/billing#./Area', id: 'submit' },
						{ type: 'action', root: '@company/branding#./Shell', id: 'submit' }
					]
				}
			},
			context({
				remoteBuilds: { [buildKey]: build },
				authorize() {
					authorizationCalls++;
					return true;
				}
			})
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body).results).toMatchObject([
			{ ok: true, state: 'billing' },
			{ ok: true, state: 'branding' }
		]);
		expect(authorizationCalls).toBe(1);
	});

	it('rejects an unsupported build before handler dispatch and advertises a preferred build', async () => {
		let dispatched = false;
		const supported = registration({ '@company/billing#./Area': 'supported' }, () => {
			dispatched = true;
		});
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'X-Exact-Build': 'ffffffffffffffffffffffffffffffffffffffff' },
				body: {
					type: 'action',
					root: '@company/billing#./Area',
					id: 'submit'
				}
			},
			context({
				remoteBuilds: { [buildKey]: supported },
				preferredBuildKey: buildKey
			})
		);

		expect(response.status).toBe(410);
		expect(JSON.parse(response.body)).toEqual({ error: 'exact_build_unsupported' });
		expect(response.headers['X-Exact-Preferred-Build']).toBe(buildKey);
		expect(dispatched).toBe(false);
	});

	it('fails a root outside the selected build without falling back to the page manifest', async () => {
		const build = registration({ '@company/billing#./Area': 'billing' });
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-build': buildKey },
				body: { type: 'action', root: '@company/other#./Area', id: 'submit' }
			},
			context({ remoteBuilds: { [buildKey]: build } })
		);

		expect(response.status).toBe(404);
		expect(JSON.parse(response.body)).toEqual({ error: 'not_found' });
	});
});

function registration(
	roots: Readonly<Record<string, string>>,
	onDispatch?: () => void
): ExactRemoteBuildRegistration {
	return {
		buildKey,
		roots: Object.fromEntries(
			Object.entries(roots).map(([root, value]) => [
				root,
				{
					contract: {
						version: 1,
						actions: {
							submit: defineExactActionContract('submit', {
								writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
							})
						},
						boundaries: {}
					},
					actions: {
						submit: () => {
							onDispatch?.();
							return { state: value };
						}
					}
				}
			])
		)
	};
}
