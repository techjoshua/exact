/**
 * @vitest-environment jsdom
 */
import {
	createVNode,
	exactComponentContract,
	markComponentContinuationTask,
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
			this.task(
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
						dependencies: [{ source: 'state' as const }],
						stateReads: [{ path: 'query', kind: 'read' as const, confidence: 'exact' as const }],
						stateWrites: [{ path: 'result', kind: 'write' as const, confidence: 'exact' as const }],
						publicContexts: [],
						serverContexts: [],
						boundaries: []
					}
				],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Search',
					statePaths: ['query', 'result'],
					valueCaptures: [],
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
});
