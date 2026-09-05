/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
/**
 * @vitest-environment jsdom
 */
import { render } from '@exactjs/dom';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import {
	defineExactOperationContract,
	defineExactBoundaryContract,
	handleExactRequest,
	unsafeExactHtml
} from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactClient, hydrateClientIslands } from './index.js';
import { applyPatches } from './patches.js';
import { noopLogger, testContinuation } from './test-support/responses.js';
import {
	clickCounterRoot,
	DeepPropsObserver,
	EagerCounter,
	IslandShell,
	NestedInner,
	NestedOuter,
	PropsCounter,
	PropsObserver,
	readIslandClicks,
	readIslandProps,
	resetIslandFixtureObservations,
	ResumableIslandCounter,
	StableIslandShell
} from './test-support/islands.fixtures.js';

describe('@exactjs/hydrate islands', () => {
	it('supports an eager root override for compiler-approved interaction islands', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction"><button>Count</button></div>';
		expect(
			hydrateClientIslands(
				container,
				{ Counter: EagerCounter },
				{
					hydration: { strategy: 'eager' }
				}
			)
		).toBe(1);
	});

	it('rolls back a resumption consumed by failed adoption before mounting the fallback', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-resumption="true"><p>server mismatch</p></div>';
		const componentId = exactComponentIdentity(ResumableIslandCounter);

		const client = createExactClient(container, {
			islands: { Counter: ResumableIslandCounter },
			resumptions: [
				{
					componentId,
					values: { count: 7 },
					contexts: {},
					settledContinuations: []
				}
			],
			logger: noopLogger
		});

		expect(container.querySelector('output')?.textContent).toBe('7');
		expect(
			container
				.querySelector('[data-exact-client-boundary="counter"]')
				?.getAttribute('data-exact-client-hydrated')
		).toBe('true');
		client.dispose();
	});

	it('disposes a hydrated island before a server replacement removes it', () => {
		resetIslandFixtureObservations();
		const container = document.createElement('main'),
			island = document.createElement('div');
		island.setAttribute('data-exact-client-boundary', 'counter');
		container.appendChild(island);
		render(clickCounterRoot, island);
		const detachedButton = island.querySelector('button')!;
		expect(applyPatches(container, [{ type: 'replace', id: 'counter', html: '<p>New</p>' }])).toBe(
			true
		);
		detachedButton.click();
		expect(readIslandClicks()).toBe(0);
		expect(container.textContent).toBe('New');
	});

	it('auto-hydrates client islands returned from action patches', async () => {
		const container = document.createElement('main');
		container.innerHTML = '<!--exact:panel--><p>Old</p><!--/exact:panel-->';
		const fetch = async (_input: string, init: { body: string }) => {
			const response = await handleExactRequest(
				{
					method: 'POST',
					body: JSON.parse(init.body)
				},
				{
					contract: {
						version: 1,
						endpoint: '/__exact',
						invocations: {
							save: defineExactOperationContract('save', {
								boundaries: ['panel'],
								writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
							})
						},
						executors: {},
						boundaries: {
							panel: defineExactBoundaryContract('panel')
						}
					},
					invocations: {
						save: () => ({
							patches: [
								{
									type: 'replace',
									id: 'panel',
									html: unsafeExactHtml(
										'<div data-exact-client-boundary="counter" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":8}}\'></div>'
									)
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
			continuations: {
				save: testContinuation('save', { boundaries: ['panel'] })
			},
			fetch,
			islands: { Counter_ExactClient_1: PropsCounter }
		});
		await client.invokeTask('save');

		expect(container.querySelector('button')?.textContent).toBe('8');
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
	});

	it('hydrates server-rendered client island placeholders', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-1" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":2}}\'></div>';

		const hydrated = hydrateClientIslands(container, { Counter_ExactClient_1: PropsCounter });

		expect(hydrated).toBe(1);
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
		expect(container.querySelector('button')?.textContent).toBe('2');
	});

	it('hydrates nested islands from the current DOM instead of a stale preorder snapshot', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="outer" data-exact-client-name="Outer"></div>';
		expect(hydrateClientIslands(container, { Outer: NestedOuter, Inner: NestedInner })).toBe(2);
		expect(container.querySelector('button')?.textContent).toBe('Inner');
		expect(container.querySelectorAll('[data-exact-client-hydrated="true"]')).toHaveLength(2);
	});

	it('ignores unsafe object keys in server-rendered client island props', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-1" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":2,"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}}\'></div>';
		resetIslandFixtureObservations();

		const hydrated = hydrateClientIslands(container, { Counter_ExactClient_1: PropsObserver });

		expect(hydrated).toBe(1);
		const receivedProps = readIslandProps() as any;
		expect(receivedProps.count).toBe(2);
		expect(receivedProps.polluted).toBeUndefined();
		expect(({} as any).polluted).toBeUndefined();
	});

	it('rejects over-deep client island props without recursive traversal', () => {
		const container = document.createElement('main');
		const boundary = document.createElement('div');
		boundary.setAttribute('data-exact-client-boundary', 'deep');
		boundary.setAttribute('data-exact-client-name', 'Deep');
		const props: Record<string, unknown> = {};
		let cursor = props;
		for (let index = 0; index < 150; index++) {
			const next: Record<string, unknown> = {};
			cursor.next = next;
			cursor = next;
		}
		boundary.setAttribute('data-exact-client-props', JSON.stringify({ props }));
		container.append(boundary);
		resetIslandFixtureObservations();
		expect(hydrateClientIslands(container, { Deep: DeepPropsObserver })).toBe(1);
		expect(readIslandProps()).toEqual({});
	});

	it('hydrates client islands without replacing server child slots', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-children" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props=\'{"props":{"children":{"__exactServerSlot":"island-children:children"}}}\'><span data-exact-server-slot="island-children:children" style="display: contents;"><p>Server child</p></span></div>';

		const hydrated = hydrateClientIslands(container, { Shell_ExactClient_1: IslandShell });

		expect(hydrated).toBe(1);
		const section = container.querySelector('section');
		expect(
			section?.querySelector('[data-exact-server-slot="island-children:children"] p')?.textContent
		).toBe('Server child');
		expect(
			container.querySelectorAll('[data-exact-server-slot="island-children:children"]')
		).toHaveLength(1);
	});

	it('leaves unknown client island placeholders in place', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-1" data-exact-client-name="Missing_ExactClient_1"></div>';

		expect(hydrateClientIslands(container, {}, { logger: noopLogger })).toBe(0);
		expect(container.querySelector('[data-exact-client-boundary]')).not.toBeNull();
	});

	it('refreshes a server boundary and hydrates returned client islands', async () => {
		const container = document.createElement('main');
		container.innerHTML = '<!--exact:panel--><p>Old</p><!--/exact:panel-->';
		const fetch = async (_input: string, init: { body: string }) => {
			const response = await handleExactRequest(
				{
					method: 'POST',
					body: JSON.parse(init.body)
				},
				{
					contract: {
						version: 1,
						invocations: {},
						boundaries: {
							panel: defineExactBoundaryContract('panel')
						}
					},
					refreshBoundaries: {
						panel: () => ({
							patches: [
								{
									type: 'replace',
									id: 'panel',
									html: unsafeExactHtml(
										'<div data-exact-client-boundary="counter" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":4}}\'></div>'
									)
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
			fetch
		});
		await client.refreshIsland('panel', { Counter_ExactClient_1: PropsCounter });

		expect(container.querySelector('p')).toBeNull();
		expect(container.querySelector('button')?.textContent).toBe('4');
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
	});

	it('auto-hydrates refreshed client islands from configured registries', async () => {
		const container = document.createElement('main');
		container.innerHTML = '<!--exact:panel--><p>Old</p><!--/exact:panel-->';
		const fetch = async (_input: string, init: { body: string }) => {
			const response = await handleExactRequest(
				{
					method: 'POST',
					body: JSON.parse(init.body)
				},
				{
					contract: {
						version: 1,
						invocations: {},
						boundaries: {
							panel: defineExactBoundaryContract('panel')
						}
					},
					refreshBoundaries: {
						panel: () => ({
							patches: [
								{
									type: 'replace',
									id: 'panel',
									html: unsafeExactHtml(
										'<div data-exact-client-boundary="counter" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":7}}\'></div>'
									)
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
			fetch,
			islands: { Counter_ExactClient_1: PropsCounter }
		});
		await client.refreshBoundary('panel');

		expect(container.querySelector('button')?.textContent).toBe('7');
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
	});

	it('refreshes server child slots without replacing the client island', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-children" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props=\'{"props":{"children":{"__exactServerSlot":"island-children:children"}}}\'><span data-exact-server-slot="island-children:children" style="display: contents;"><p>Old child</p></span></div>';
		let requestBody: any;
		const fetch = async (_input: string, init: { body: string }) => {
			requestBody = JSON.parse(init.body);
			const response = await handleExactRequest(
				{
					method: 'POST',
					body: requestBody
				},
				{
					contract: {
						version: 1,
						invocations: {},
						boundaries: {
							'island-children:children': defineExactBoundaryContract('island-children:children')
						}
					},
					refreshBoundaries: {
						'island-children:children': () => ({
							patches: [
								{
									type: 'replace',
									id: 'island-children:children',
									html: unsafeExactHtml('<p>New child</p>')
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
			fetch,
			islands: { Shell_ExactClient_1: StableIslandShell }
		});
		hydrateClientIslands(container, { Shell_ExactClient_1: StableIslandShell });
		const shell = container.querySelector('section');

		await client.refreshBoundary('island-children:children');

		expect(requestBody.boundaryHtml).toBe('<p>Old child</p>');
		expect(container.querySelector('section')).toBe(shell);
		expect(
			container.querySelector('[data-exact-server-slot="island-children:children"] p')?.textContent
		).toBe('New child');
	});
});
