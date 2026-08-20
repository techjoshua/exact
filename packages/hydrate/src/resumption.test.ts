/**
 * @vitest-environment jsdom
 */
import {
	activateTaskForHost,
	createContext,
	defineTask,
	markComponentContinuationTask,
	registerComponentContinuationContexts,
	type Component,
	type TaskContext
} from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { renderToHydratableStringAsync } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './index.js';
import { createComponentResumptionResolver } from './runtime/resumption.js';
import { createVNode } from './test-support/native-vnode.js';

function resumablePage(id: string, label: string) {
	const implementation = function Page(this: Component<{ label: string }>) {
		this.state.label = label;
		return () => createVNode('p', null, this.state.label);
	};
	return Object.assign(implementation, {
		[exactComponentType]: id,
		[exactComponentContract]: {
			version: 2 as const,
			placement: 'isomorphic' as const,
			role: 'client' as const,
			implementations: [],
			continuations: [],
			executors: [],
			boundaries: [],
			resumption: {
				componentId: id,
				statePaths: ['label'],
				valueCaptures: [],
				contexts: [],
				boundaries: []
			}
		}
	});
}

describe('@exactjs/hydrate component resumption', () => {
	it('matches SSR activations by component type while preserving per-type order and rollback', () => {
		const First = resumablePage('component:First', 'first');
		const Second = resumablePage('component:Second', 'second');
		const records = [
			{
				componentId: 'component:Second',
				values: { label: 'second-server' },
				contexts: {},
				settledContinuations: []
			},
			{
				componentId: 'component:First',
				values: { label: 'first-server' },
				contexts: {},
				settledContinuations: []
			},
			{
				componentId: 'component:First',
				values: { label: 'first-server-2' },
				contexts: {},
				settledContinuations: []
			}
		];
		const resolve = createComponentResumptionResolver(() => records);

		expect(resolve(First)?.values.label).toBe('first-server');
		const checkpoint = resolve.checkpoint();
		expect(resolve(Second)?.values.label).toBe('second-server');
		resolve.rollback(checkpoint);
		expect(resolve(Second)?.values.label).toBe('second-server');
		expect(resolve(First)?.values.label).toBe('first-server-2');
	});

	it('limits SSR activation records to adoption so later client navigation mounts fresh state', async () => {
		const InitialPage = resumablePage('component:InitialPage', 'initial');
		const NavigatedPage = resumablePage('component:NavigatedPage', 'navigated');
		const rendered = await renderToHydratableStringAsync(createVNode(InitialPage, {}));
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;

		const client = hydrate(createVNode(InitialPage, {}), container, { onMismatch: 'throw' });

		expect(container.querySelector('p')?.textContent).toBe('initial');
		expect(() => hydrate(createVNode(NavigatedPage, {}), container)).not.toThrow();
		expect(container.querySelector('p')?.textContent).toBe('navigated');
		client.dispose();
	});

	it('mounts a fresh route when the browser location changes before SSR adoption', async () => {
		const InitialPage = resumablePage('component:PrerenderedRoute', 'initial');
		const NavigatedPage = resumablePage('component:PreHydrationRoute', 'navigated');
		const implementation = function Shell(
			this: Component<{}>,
			props: { page: typeof InitialPage }
		) {
			return () => createVNode(props.page, {});
		};
		const Shell = Object.assign(implementation, {
			[exactComponentType]: 'component:PreHydrationShell',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:PreHydrationShell',
					statePaths: [],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});
		const rendered = await renderToHydratableStringAsync(createVNode(Shell, { page: InitialPage }));
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;

		const client = hydrate(createVNode(Shell, { page: NavigatedPage }), container, {
			onMismatch: 'replace'
		});

		expect(container.querySelector('p')?.textContent).toBe('navigated');
		client.dispose();
	});

	it('adopts SSR state without repeating settled work and reruns after a dependency change', async () => {
		let runs = 0;
		const implementation = function Search(this: Component<{ query: string; result: string }>) {
			this.state.query = 'first';
			this.state.result = 'waiting';
			activateTaskForHost(
				this,
				defineTask(
					{},
					markComponentContinuationTask(
						'task:search',
						async (query: string, _task: TaskContext) => {
							runs++;
							await Promise.resolve();
							this.state.result = query.toUpperCase();
						}
					)
				),
				this.reactive(() => this.state.query)
			);
			return () =>
				createVNode(
					'section',
					null,
					createVNode(
						'button',
						{
							onClick: () => {
								this.state.query = 'second';
							}
						},
						'Change'
					),
					createVNode('output', null, this.state.result)
				);
		};
		const Search = Object.assign(implementation, {
			[exactComponentType]: 'component:Search',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:search',
						componentId: 'component:Search',
						kind: 'task' as const,
						readiness: 'nonblocking' as const,
						dependencies: [{ source: 'state' as const }],
						stateReads: [{ path: 'query', kind: 'read' as const, confidence: 'exact' as const }],
						stateWrites: [{ path: 'result', kind: 'write' as const, confidence: 'exact' as const }],
						publicContexts: [],
						serverContexts: [],
						contextWrites: [],
						boundaries: []
					}
				],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Search',
					statePaths: ['query', 'result'],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});
		const rendered = await renderToHydratableStringAsync(createVNode(Search, {}));
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		const serverOutput = container.querySelector('output');

		const client = hydrate(createVNode(Search, {}), container, { onMismatch: 'throw' });

		expect(runs).toBe(1);
		expect(container.querySelector('output')).toBe(serverOutput);
		expect(serverOutput?.textContent).toBe('FIRST');

		container.querySelector('button')!.click();
		await vi.waitFor(() => expect(serverOutput?.textContent).toBe('SECOND'));

		expect(runs).toBe(2);
		client.dispose();
	});

	it('rejects SSR output produced by a different immutable client build', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<!--exact:component:Root--><p>server</p><!--/exact:component:Root-->' +
			'<script type="application/json" id="__exact_hydration">{"buildKey":"server-build"}</script>';
		function Root() {
			return () => createVNode('p', null, 'server');
		}

		expect(() =>
			hydrate(createVNode(Root, {}), container, {
				buildKey: 'client-build',
				onMismatch: 'throw'
			})
		).toThrow('build identities do not match');
	});

	it('restores a settled shared context before constructing its descendants', async () => {
		const Status = createContext<{ message: string }>('status');
		let runs = 0;
		function Consumer(this: Component<{}>) {
			const status = this.getContext(Status);
			return () => createVNode('output', null, status.message);
		}
		const implementation = function Provider(this: Component<{}>) {
			registerComponentContinuationContexts(this, [{ name: 'Status', token: Status }]);
			activateTaskForHost(
				this,
				defineTask(
					{},
					markComponentContinuationTask('task:status', () => {
						runs++;
						this.setContext(Status, { message: 'ready' });
					})
				)
			);
			return () => createVNode(Consumer, {});
		};
		const Provider = Object.assign(implementation, {
			[exactComponentType]: 'component:Provider',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:status',
						componentId: 'component:Provider',
						kind: 'task' as const,
						readiness: 'nonblocking' as const,
						dependencies: [],
						stateReads: [],
						stateWrites: [],
						publicContexts: [],
						serverContexts: [],
						contextWrites: ['Status'],
						boundaries: []
					}
				],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Provider',
					statePaths: [],
					valueCaptures: [],
					contexts: ['Status'],
					boundaries: []
				}
			}
		});
		const rendered = await renderToHydratableStringAsync(createVNode(Provider, {}));
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		const serverOutput = container.querySelector('output');

		const client = hydrate(createVNode(Provider, {}), container, { onMismatch: 'throw' });

		expect(runs).toBe(1);
		expect(container.querySelector('output')).toBe(serverOutput);
		expect(serverOutput?.textContent).toBe('ready');
		client.dispose();
	});
});
