import { describe, expect, it, vi } from 'vitest';
import { exactResponseToFetchResponse } from './adapters.js';
import { defineExactBoundaryContract, handleExactRequest, unsafeExactHtml } from './index.js';
import { context } from './test-support/server.js';

describe('refresh boundary security', () => {
	it('passes boundary html snapshots to refresh handlers', async () => {
		const refresh = vi.fn((input) => ({
			patches: [
				{
					type: 'replace' as const,
					id: 'allowed-boundary',
					html: unsafeExactHtml(String(input.boundaryHtml ?? ''))
				}
			]
		}));
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					id: 'allowed-boundary',
					boundaryHtml: '<p>Previous</p>'
				}
			},
			context({
				refreshBoundaries: {
					'allowed-boundary': refresh
				}
			})
		);

		expect(result.status).toBe(200);
		expect(refresh).toHaveBeenCalledWith(
			expect.objectContaining({
				boundaryHtml: '<p>Previous</p>'
			}),
			expect.any(Object)
		);
	});

	it('rejects partition refresh patches outside declared descendant containment', async () => {
		const contract = {
			version: 1 as const,
			invocations: {},
			boundaries: {
				permissions: defineExactBoundaryContract('permissions', {
					kind: 'partition-range',
					planVersion: 1,
					buildKey: 'build',
					planEdgeId: 'permissions',
					parentPlanId: 'controls',
					fallbackPlanId: 'controls',
					patchTargets: ['permissions', 'permissions-detail']
				})
			}
		};
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					root: 'page',
					id: 'permissions',
					partition: {
						version: 1,
						buildKey: 'build',
						executionRoot: 'page',
						planEdgeId: 'permissions',
						ownerComponentId: 'application:permissions',
						discriminator: { kind: 'single' },
						generation: 1
					}
				}
			},
			context({
				contract,
				refreshBoundaries: {
					permissions: () => ({
						patches: [
							{
								type: 'replace',
								id: 'summary',
								html: unsafeExactHtml('<p>Wrong sibling</p>')
							}
						]
					})
				}
			})
		);

		expect(response.status).toBe(500);
		expect(await exactResponseToFetchResponse(response).json()).toMatchObject({
			error: 'internal_error'
		});
	});

	it('rejects partition refresh before dispatch when runtime authority mismatches', async () => {
		const refresh = vi.fn(() => ({ patches: [] }));
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					root: 'page',
					id: 'permissions',
					partition: {
						version: 1,
						buildKey: 'wrong-build',
						executionRoot: 'page',
						planEdgeId: 'permissions',
						ownerComponentId: 'application:permissions',
						discriminator: { kind: 'single' },
						generation: 1
					}
				}
			},
			context({
				contract: {
					version: 1,
					invocations: {},
					boundaries: {
						permissions: defineExactBoundaryContract('permissions', {
							kind: 'partition-range',
							planVersion: 1,
							buildKey: 'build',
							planEdgeId: 'permissions'
						})
					}
				},
				refreshBoundaries: { permissions: refresh }
			})
		);

		expect(response.status).toBe(400);
		expect(refresh).not.toHaveBeenCalled();
	});

	it('fences stale dynamic partition generations before refresh dispatch', async () => {
		const refresh = vi.fn(() => ({ patches: [] }));
		const current = {
			version: 1 as const,
			buildKey: 'build',
			executionRoot: 'page',
			planEdgeId: 'conditional-range',
			ownerComponentId: 'reports-component',
			discriminator: { kind: 'branch' as const, branch: 'remote-branch' },
			generation: 5
		};
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					root: 'page',
					id: 'conditional-range',
					partition: { ...current, generation: 4 }
				}
			},
			context({
				contract: {
					version: 1,
					invocations: {},
					boundaries: {
						'conditional-range': defineExactBoundaryContract('conditional-range', {
							componentId: 'reports-component',
							ownerComponentId: 'reports-component',
							kind: 'partition-range',
							planVersion: 1,
							buildKey: 'build',
							planEdgeId: 'conditional-range',
							patchTargets: ['conditional-range', 'remote-branch'],
							discriminatorKind: 'branch',
							discriminatorValues: ['local-branch', 'remote-branch']
						})
					}
				},
				resolvePartitionAuthority: () => current,
				refreshBoundaries: { 'conditional-range': refresh }
			})
		);

		expect(response.status).toBe(400);
		expect(refresh).not.toHaveBeenCalled();
	});
});
