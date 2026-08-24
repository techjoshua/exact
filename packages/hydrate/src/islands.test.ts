/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { createVNode, markTestComponents } from './test-support/native-vnode.js';
import { render } from '@exactjs/dom';
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

describe('@exactjs/hydrate islands', () => {
	it('adopts an interaction island before delivering its first click', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="counter-button">Count</button></div>';
		const serverButton = container.querySelector('button')!;
		let clicks = 0;
		function Counter() {
			return () =>
				createVNode(
					'button',
					{ 'data-exact-id': 'counter-button', onClick: () => clicks++ },
					'Count'
				);
		}

		expect(hydrateClientIslands(container, markTestComponents({ Counter }))).toBe(0);
		serverButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(clicks).toBe(1);
		expect(container.querySelector('button')).toBe(serverButton);
		expect(
			container
				.querySelector('[data-exact-client-boundary="counter"]')
				?.getAttribute('data-exact-client-hydrated')
		).toBe('true');
	});

	it('automatically registers interaction islands in the owning exact client domain', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction"><button data-exact-id="counter-button">Count</button></div>';
		let componentDomain: unknown;
		function Counter(this: Component<{}>) {
			componentDomain = (this as Component<{}> & { domain: unknown }).domain;
			return () => createVNode('button', { 'data-exact-id': 'counter-button' }, 'Count');
		}

		const client = createExactClient(container, { islands: markTestComponents({ Counter }) });

		expect(componentDomain).toBeUndefined();
		container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(componentDomain).toBe(client.domain);
	});

	it('preserves a dirty input and lets the first input event update its compiled binding', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="FormIsland" data-exact-client-hydration="interaction"><input data-exact-id="name" value="server"></div>';
		const serverInput = container.querySelector('input')!;
		serverInput.value = 'typed';
		let value = 'server';
		function FormIsland() {
			return () =>
				createVNode('input', {
					'data-exact-id': 'name',
					value,
					__exactBindInput: (event: Event) => {
						value = (event.currentTarget as HTMLInputElement).value;
					}
				});
		}

		hydrateClientIslands(container, markTestComponents({ FormIsland }));
		serverInput.dispatchEvent(new Event('input', { bubbles: true }));

		expect(container.querySelector('input')).toBe(serverInput);
		expect(serverInput.value).toBe('typed');
		expect(value).toBe('typed');
	});

	it('preserves one native checkbox toggle while activating its click handler', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="choice" data-exact-client-name="Choice" data-exact-client-hydration="interaction"><input data-exact-id="choice-box" type="checkbox"></div>';
		const serverInput = container.querySelector('input')!;
		let clicks = 0;
		function Choice() {
			return () =>
				createVNode('input', {
					'data-exact-id': 'choice-box',
					type: 'checkbox',
					checked: false,
					onClick: () => clicks++
				});
		}

		hydrateClientIslands(container, markTestComponents({ Choice }));
		serverInput.click();

		expect(clicks).toBe(1);
		expect(container.querySelector('input')).toBe(serverInput);
		expect(serverInput.checked).toBe(true);
	});

	it('activates a form before delivering its first submit once', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="FormIsland" data-exact-client-hydration="interaction"><form data-exact-id="profile-form"><button type="submit">Save</button></form></div>';
		const form = container.querySelector('form')!;
		let submits = 0;
		function FormIsland() {
			return () =>
				createVNode(
					'form',
					{
						'data-exact-id': 'profile-form',
						onSubmit: (event: Event) => {
							event.preventDefault();
							submits++;
						}
					},
					createVNode('button', { type: 'submit' }, 'Save')
				);
		}

		hydrateClientIslands(container, markTestComponents({ FormIsland }));
		form.requestSubmit(form.querySelector('button')!);

		expect(submits).toBe(1);
		expect(container.querySelector('form')).toBe(form);
	});

	it('supports an eager root override for compiler-approved interaction islands', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction"><button>Count</button></div>';
		function Counter() {
			return () => createVNode('button', null, 'Count');
		}

		expect(
			hydrateClientIslands(container, markTestComponents({ Counter }), {
				hydration: { strategy: 'eager' }
			})
		).toBe(1);
	});

	it('rolls back a resumption consumed by failed adoption before mounting the fallback', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-resumption="true"><p>server mismatch</p></div>';
		const implementation = function Counter(this: Component<{ count: number }>) {
			this.state.count = 0;
			return () => createVNode('output', null, String(this.state.count));
		};
		const Counter = Object.assign(implementation, {
			[exactComponentType]: 'component:Counter',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Counter',
					statePaths: ['count'],
					stateInputs: [],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});

		const client = createExactClient(container, {
			islands: markTestComponents({ Counter }),
			resumptions: [
				{
					componentId: 'component:Counter',
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

	it('replays once against a replacement target after an adoption mismatch', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="counter-button"><span>Server</span></button></div>';
		const serverButton = container.querySelector('button')!;
		let clicks = 0;
		function Counter() {
			return () =>
				createVNode(
					'button',
					{ 'data-exact-id': 'counter-button', onClick: () => clicks++ },
					'Client'
				);
		}

		hydrateClientIslands(container, markTestComponents({ Counter }));
		serverButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(container.querySelector('button')).not.toBe(serverButton);
		expect(container.querySelector('button')?.textContent).toBe('Client');
		expect(clicks).toBe(1);
	});

	it('disposes a hydrated island before a server replacement removes it', () => {
		let clicks = 0;
		function Counter() {
			return () => createVNode('button', { onClick: () => clicks++ }, 'Old');
		}
		const container = document.createElement('main'),
			island = document.createElement('div');
		island.setAttribute('data-exact-client-boundary', 'counter');
		container.appendChild(island);
		render(createVNode(Counter, null), island);
		const detachedButton = island.querySelector('button')!;
		expect(applyPatches(container, [{ type: 'replace', id: 'counter', html: '<p>New</p>' }])).toBe(
			true
		);
		detachedButton.click();
		expect(clicks).toBe(0);
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

		function Counter(this: Component<{ count: number }>, props: { count: number }) {
			this.state.count = props.count;
			return () => createVNode('button', null, String(this.state.count));
		}

		const client = createExactClient(container, {
			endpoint: '/__exact',
			continuations: {
				save: testContinuation('save', { boundaries: ['panel'] })
			},
			fetch,
			islands: markTestComponents({
				Counter_ExactClient_1: Counter
			})
		});
		await client.invokeTask('save');

		expect(container.querySelector('button')?.textContent).toBe('8');
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
	});

	it('hydrates server-rendered client island placeholders', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-1" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":2}}\'></div>';

		function Counter(this: Component<{ count: number }>, props: { count: number }) {
			this.state.count = props.count;
			return () => createVNode('button', null, String(this.state.count));
		}

		const hydrated = hydrateClientIslands(
			container,
			markTestComponents({
				Counter_ExactClient_1: Counter
			})
		);

		expect(hydrated).toBe(1);
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
		expect(container.querySelector('button')?.textContent).toBe('2');
	});

	it('hydrates nested islands from the current DOM instead of a stale preorder snapshot', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="outer" data-exact-client-name="Outer"></div>';
		function Inner() {
			return () => createVNode('button', null, 'Inner');
		}
		function Outer() {
			return () =>
				createVNode(
					'section',
					null,
					createVNode('div', {
						'data-exact-client-boundary': 'inner',
						'data-exact-client-name': 'Inner'
					})
				);
		}
		expect(hydrateClientIslands(container, markTestComponents({ Outer, Inner }))).toBe(2);
		expect(container.querySelector('button')?.textContent).toBe('Inner');
		expect(container.querySelectorAll('[data-exact-client-hydrated="true"]')).toHaveLength(2);
	});

	it('ignores unsafe object keys in server-rendered client island props', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-1" data-exact-client-name="Counter_ExactClient_1" data-exact-client-props=\'{"props":{"count":2,"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}}\'></div>';
		let receivedProps: any;

		function Counter(this: Component<{ count: number }>, props: { count: number }) {
			receivedProps = props;
			this.state.count = props.count;
			return () => createVNode('button', null, String(this.state.count));
		}

		const hydrated = hydrateClientIslands(
			container,
			markTestComponents({
				Counter_ExactClient_1: Counter
			})
		);

		expect(hydrated).toBe(1);
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
		let received: unknown;
		expect(
			hydrateClientIslands(
				container,
				markTestComponents({
					Deep(_props) {
						received = _props;
						return () => null;
					}
				})
			)
		).toBe(1);
		expect(received).toEqual({});
	});

	it('hydrates client islands without replacing server child slots', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="island-children" data-exact-client-name="Shell_ExactClient_1" data-exact-client-props=\'{"props":{"children":{"__exactServerSlot":"island-children:children"}}}\'><span data-exact-server-slot="island-children:children" style="display: contents;"><p>Server child</p></span></div>';

		function Shell(this: Component<{}>, props: { children?: unknown }) {
			return () => createVNode('section', null, props.children);
		}

		const hydrated = hydrateClientIslands(
			container,
			markTestComponents({
				Shell_ExactClient_1: Shell
			})
		);

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

		function Counter(this: Component<{ count: number }>, props: { count: number }) {
			this.state.count = props.count;
			return () => createVNode('button', null, String(this.state.count));
		}

		const client = createExactClient(container, {
			endpoint: '/__exact',
			fetch
		});
		await client.refreshIsland(
			'panel',
			markTestComponents({
				Counter_ExactClient_1: Counter
			})
		);

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

		function Counter(this: Component<{ count: number }>, props: { count: number }) {
			this.state.count = props.count;
			return () => createVNode('button', null, String(this.state.count));
		}

		const client = createExactClient(container, {
			endpoint: '/__exact',
			fetch,
			islands: markTestComponents({
				Counter_ExactClient_1: Counter
			})
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

		function Shell(this: Component<{}>, props: { children?: unknown }) {
			return () => createVNode('section', { 'data-shell': 'stable' }, props.children);
		}

		const client = createExactClient(container, {
			endpoint: '/__exact',
			fetch,
			islands: markTestComponents({
				Shell_ExactClient_1: Shell
			})
		});
		hydrateClientIslands(
			container,
			markTestComponents({
				Shell_ExactClient_1: Shell
			})
		);
		const shell = container.querySelector('section');

		await client.refreshBoundary('island-children:children');

		expect(requestBody.boundaryHtml).toBe('<p>Old child</p>');
		expect(container.querySelector('section')).toBe(shell);
		expect(
			container.querySelector('[data-exact-server-slot="island-children:children"] p')?.textContent
		).toBe('New child');
	});
});
