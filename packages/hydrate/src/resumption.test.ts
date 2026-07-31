/**
 * @vitest-environment jsdom
 */
import {
	createContext,
	createVNode,
	exactComponentContract,
	markComponentContinuationTask,
	registerComponentContinuationContexts,
	type Component
} from '@exactjs/core';
import { renderToHydratableStringAsync } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './index.js';

describe('@exactjs/hydrate component resumption', () => {
	it('adopts SSR state without repeating settled work and reruns after a dependency change', async () => {
		let runs = 0;
		const implementation = function Search(this: Component<{ query: string; result: string }>) {
			this.state.query = 'first';
			this.state.result = 'waiting';
			(this as any).task(
				this.reactive(() => this.state.query),
				markComponentContinuationTask('task:search', async (query: string) => {
					runs++;
					await Promise.resolve();
					this.state.result = query.toUpperCase();
				})
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
			[exactComponentContract]: {
				version: 1 as const,
				id: 'component:Search',
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:search',
						componentId: 'component:Search',
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
			(this as any).task(
				markComponentContinuationTask('task:status', () => {
					runs++;
					this.setContext(Status, { message: 'ready' });
				})
			);
			return () => createVNode(Consumer, {});
		};
		const Provider = Object.assign(implementation, {
			[exactComponentContract]: {
				version: 1 as const,
				id: 'component:Provider',
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:status',
						componentId: 'component:Provider',
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
