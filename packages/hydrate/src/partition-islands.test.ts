/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { defineExactBoundaryContract, handleExactRequest, unsafeExactHtml } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactClient, hydrateClientIslands } from './index.js';
import { partitionAuthority } from './patching/api.js';
import { createVNode, markTestComponents } from './test-support/native-vnode.js';

describe('@exactjs/hydrate partition islands', () => {
	it('hydrates independent partition slots without replacing either sibling range', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="partitioned" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props=\'{"props":{"children":[{"__exactServerSlot":"summary-edge"},{"__exactServerSlot":"permissions-edge"}]}}\'><span data-exact-server-slot="summary-edge" style="display: contents;"><p>Summary</p></span><span data-exact-server-slot="permissions-edge" style="display: contents;"><p>Permissions</p></span></div>';
		const summary = container.querySelector('[data-exact-server-slot="summary-edge"]');
		const permissions = container.querySelector('[data-exact-server-slot="permissions-edge"]');

		function Shell(this: Component<{}>, props: { children?: unknown }) {
			return () => createVNode('section', null, props.children);
		}

		expect(
			hydrateClientIslands(container, markTestComponents({ Shell_ExactClient_1: Shell }))
		).toBe(1);
		expect(container.querySelector('[data-exact-server-slot="summary-edge"]')).toBe(summary);
		expect(container.querySelector('[data-exact-server-slot="permissions-edge"]')).toBe(
			permissions
		);
		expect(container.querySelector('section')?.textContent).toBe('SummaryPermissions');
	});

	it('retains branch and keyed discriminators in refresh authority', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<span data-exact-server-slot="branch-edge" data-exact-partition-version="1" data-exact-partition-build="build-1" data-exact-partition-root="page" data-exact-partition-edge="branch-edge" data-exact-partition-owner="owner" data-exact-partition-discriminator="branch" data-exact-partition-branch="remote-branch" data-exact-partition-generation="3"></span><span data-exact-server-slot="item-edge:key:~726f773a37" data-exact-partition-version="1" data-exact-partition-build="build-1" data-exact-partition-root="page" data-exact-partition-edge="item-edge" data-exact-partition-owner="owner" data-exact-partition-discriminator="keyed" data-exact-partition-list="rows" data-exact-partition-key="row:7" data-exact-partition-generation="4"></span>';

		expect(partitionAuthority(container, 'branch-edge')).toMatchObject({
			discriminator: { kind: 'branch', branch: 'remote-branch' },
			generation: 3
		});
		expect(partitionAuthority(container, 'item-edge:key:~726f773a37')).toMatchObject({
			planEdgeId: 'item-edge',
			discriminator: { kind: 'keyed', list: 'rows', keyToken: 'row:7' },
			generation: 4
		});
	});

	it('adopts a current dynamic branch generation without flattening its owner', () => {
		const container = document.createElement('main');
		const reference = {
			__exactServerSlot: 'remote-branch',
			planVersion: 1,
			buildKey: 'build-1',
			executionRoot: 'page',
			planEdgeId: 'remote-branch',
			ownerComponentId: 'reports-component',
			discriminator: { kind: 'branch', branch: 'remote-branch' },
			generation: 3
		};
		container.innerHTML = `<div data-exact-client-boundary="reports" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props='${JSON.stringify({ props: { children: reference } })}'><span data-exact-server-slot="remote-branch" data-exact-partition-version="1" data-exact-partition-build="build-1" data-exact-partition-root="page" data-exact-partition-edge="remote-branch" data-exact-partition-owner="reports-component" data-exact-partition-discriminator="branch" data-exact-partition-branch="remote-branch" data-exact-partition-generation="3" style="display: contents"><p>Remote</p></span></div>`;
		const retained = container.querySelector('[data-exact-server-slot="remote-branch"]');
		function Shell(this: Component<{}>, props: { children?: unknown }) {
			return () => createVNode('section', null, props.children);
		}

		expect(
			hydrateClientIslands(container, markTestComponents({ Shell_ExactClient_1: Shell }), {
				buildKey: 'build-1',
				executionRoot: 'page'
			})
		).toBe(1);
		expect(container.querySelector('[data-exact-server-slot="remote-branch"]')).toBe(retained);
	});

	it('adopts only ranges whose complete partition authority matches', () => {
		const reference = {
			__exactServerSlot: 'summary-edge',
			planVersion: 1,
			buildKey: 'build-1',
			executionRoot: 'page',
			planEdgeId: 'summary-edge',
			ownerComponentId: 'workspace-component',
			discriminator: { kind: 'single' },
			generation: 1
		};
		const markup = (buildKey: string) => {
			const container = document.createElement('main');
			container.innerHTML = `<div data-exact-client-boundary="partitioned" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props='${JSON.stringify({ props: { children: reference } })}'><span data-exact-server-slot="summary-edge" data-exact-partition-version="1" data-exact-partition-build="build-1" data-exact-partition-root="page" data-exact-partition-edge="summary-edge" data-exact-partition-owner="workspace-component" data-exact-partition-discriminator="single" data-exact-partition-generation="1" style="display: contents;"><p>Summary</p></span></div>`;
			function Shell(this: Component<{}>, props: { children?: unknown }) {
				return () => createVNode('section', null, props.children);
			}
			const original = container.querySelector('[data-exact-server-slot="summary-edge"]');
			let instances: readonly import('./types.js').ExactPartitionInstance[] = [];
			hydrateClientIslands(container, markTestComponents({ Shell_ExactClient_1: Shell }), {
				buildKey,
				executionRoot: 'page',
				onPartitionInstances(value) {
					instances = value;
				}
			});
			return { container, original, instances };
		};
		const matching = markup('build-1');
		expect(matching.container.querySelector('[data-exact-server-slot="summary-edge"]')).toBe(
			matching.original
		);
		expect(matching.instances).toEqual([
			expect.objectContaining({
				buildKey: 'build-1',
				plan: 'summary-edge',
				ownerComponentId: 'workspace-component',
				generation: 1,
				host: 'server',
				children: []
			})
		]);
		const mismatched = markup('build-2');
		const fresh = mismatched.container.querySelector('[data-exact-server-slot="summary-edge"]');
		expect(fresh?.textContent).toBe('');
		expect(fresh?.hasAttribute('data-exact-partition-edge')).toBe(false);
	});

	it('recovers one mismatched nested range without replacing a matching sibling', () => {
		const reference = (id: string, buildKey: string) => ({
			__exactServerSlot: id,
			planVersion: 1,
			buildKey,
			executionRoot: 'page',
			planEdgeId: id,
			ownerComponentId: 'workspace-component',
			discriminator: { kind: 'single' },
			generation: 1
		});
		const container = document.createElement('main');
		container.innerHTML = `<div data-exact-client-boundary="workspace" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props='${JSON.stringify({ props: { children: [reference('summary', 'build-1'), reference('permissions', 'wrong-build')] } })}'><span data-exact-server-slot="summary" data-exact-partition-version="1" data-exact-partition-build="build-1" data-exact-partition-root="page" data-exact-partition-edge="summary" data-exact-partition-owner="workspace-component" data-exact-partition-discriminator="single" data-exact-partition-generation="1"><p>Summary</p></span><span data-exact-server-slot="permissions" data-exact-partition-version="1" data-exact-partition-build="wrong-build" data-exact-partition-root="page" data-exact-partition-edge="permissions" data-exact-partition-owner="workspace-component" data-exact-partition-discriminator="single" data-exact-partition-generation="1"><p>Stale permissions</p></span></div>`;
		const summary = container.querySelector('[data-exact-server-slot="summary"]');
		const permissions = container.querySelector('[data-exact-server-slot="permissions"]');
		function Shell(this: Component<{}>, props: { children?: unknown }) {
			return () => createVNode('section', null, props.children);
		}

		expect(
			hydrateClientIslands(container, markTestComponents({ Shell_ExactClient_1: Shell }), {
				buildKey: 'build-1',
				executionRoot: 'page'
			})
		).toBe(1);
		expect(container.querySelector('[data-exact-server-slot="summary"]')).toBe(summary);
		expect(summary?.textContent).toBe('Summary');
		expect(container.querySelector('[data-exact-server-slot="permissions"]')).toBe(permissions);
		expect(permissions?.textContent).toBe('');
		expect(permissions?.hasAttribute('data-exact-partition-edge')).toBe(false);
	});

	it('refreshes one keyed runtime range through its plan-edge authority', async () => {
		const runtimeId = 'item-edge:key:~726f773a37';
		const authority = {
			version: 1 as const,
			buildKey: 'build-1',
			executionRoot: 'page',
			planEdgeId: 'item-edge',
			ownerComponentId: 'rows-component',
			discriminator: { kind: 'keyed' as const, list: 'rows', keyToken: 'row:7' },
			generation: 4
		};
		const container = document.createElement('main');
		container.innerHTML = `<span data-exact-server-slot="${runtimeId}" data-exact-partition-version="1" data-exact-partition-build="build-1" data-exact-partition-root="page" data-exact-partition-edge="item-edge" data-exact-partition-owner="rows-component" data-exact-partition-discriminator="keyed" data-exact-partition-list="rows" data-exact-partition-key="row:7" data-exact-partition-generation="4"><p>Old row</p></span>`;
		let requestedId = '';
		const fetch = async (_input: string, init: { body: string }) => {
			const body = JSON.parse(init.body);
			requestedId = body.operations?.[0]?.id ?? body.id;
			const response = await handleExactRequest(
				{ method: 'POST', body },
				{
					contract: {
						version: 1,
						invocations: {},
						boundaries: {
							'item-edge': defineExactBoundaryContract('item-edge', {
								componentId: 'rows-component',
								ownerComponentId: 'rows-component',
								kind: 'partition-range',
								planVersion: 1,
								buildKey: 'build-1',
								planEdgeId: 'item-edge',
								parentPlanId: 'rows',
								fallbackPlanId: 'rows',
								patchTargets: ['item-edge'],
								discriminatorKind: 'keyed'
							})
						}
					},
					resolvePartitionAuthority: () => authority,
					refreshBoundaries: {
						'item-edge': () => ({
							patches: [
								{
									type: 'replace',
									id: 'item-edge',
									html: unsafeExactHtml('<p>New row</p>')
								}
							]
						})
					}
				}
			);
			return {
				ok: response.status >= 200 && response.status < 300,
				status: response.status,
				async json() {
					return JSON.parse(response.body);
				}
			};
		};
		const client = createExactClient(container, {
			endpoint: '/__exact',
			executionRoot: 'page',
			fetch
		});

		await client.refreshIsland(runtimeId, {});

		expect(requestedId).toBe('item-edge');
		expect(container.querySelector(`[data-exact-server-slot="${runtimeId}"]`)?.textContent).toBe(
			'New row'
		);
	});
});
