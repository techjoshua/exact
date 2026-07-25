import {
	createContext,
	createVNode,
	exactComponentContract,
	markComponentContinuationTask,
	registerComponentContinuationContexts,
	type Component
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { renderToHydratableDocumentStream, renderToHydratableStringAsync } from './index.js';
import { readRemainingStreamEvents } from './test-support/streams.js';

describe('@exactjs/ssr component resumption', () => {
	it('emits only compiler-selected state and successfully settled continuation ids', async () => {
		const implementation = function Counter(
			this: Component<{ count: number; serverOnly: string }>
		) {
			this.state.count = 0;
			this.state.serverOnly = 'private';
			this.task(
				markComponentContinuationTask('task:load', async () => {
					await Promise.resolve();
					this.state.count = 7;
				})
			);
			return () => createVNode('output', null, String(this.state.count));
		};
		const Counter = Object.assign(implementation, {
			[exactComponentContract]: {
				version: 1 as const,
				id: 'component:Counter',
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:load',
						componentId: 'component:Counter',
						dependencies: [],
						stateReads: [],
						stateWrites: [{ path: 'count', kind: 'write' as const, confidence: 'exact' as const }],
						publicContexts: [],
						serverContexts: [],
						contextWrites: [],
						boundaries: []
					}
				],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Counter',
					statePaths: ['count'],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});

		const rendered = await renderToHydratableStringAsync(createVNode(Counter, {}));

		expect(rendered.html).toContain('<output>7</output>');
		expect(rendered.resumptions).toEqual([
			{
				componentId: 'component:Counter',
				values: { count: 7 },
				contexts: {},
				settledContinuations: ['task:load']
			}
		]);
		expect(rendered.hydrationScript).toContain('"resumptions"');
		expect(rendered.hydrationScript).not.toContain('serverOnly');
		expect(rendered.hydrationScript).not.toContain('private');
	});

	it('captures the settled render used by a hydratable document stream', async () => {
		const implementation = function StreamedCounter(this: Component<{ count: number }>) {
			this.state.count = 0;
			this.task(
				markComponentContinuationTask('task:stream', async () => {
					await Promise.resolve();
					this.state.count = 9;
				})
			);
			return () => createVNode('output', null, String(this.state.count));
		};
		const StreamedCounter = Object.assign(implementation, {
			[exactComponentContract]: {
				version: 1 as const,
				id: 'component:StreamedCounter',
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:stream',
						componentId: 'component:StreamedCounter',
						dependencies: [],
						stateReads: [],
						stateWrites: [{ path: 'count', kind: 'write' as const, confidence: 'exact' as const }],
						publicContexts: [],
						serverContexts: [],
						contextWrites: [],
						boundaries: []
					}
				],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:StreamedCounter',
					statePaths: ['count'],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});

		const events = await readRemainingStreamEvents(
			renderToHydratableDocumentStream(createVNode(StreamedCounter, {})).getReader()
		);
		const hydration = events.find((event) => event.event === 'hydration');

		expect(events).toContainEqual(
			expect.objectContaining({ event: 'replace', html: expect.stringContaining('>9</output>') })
		);
		expect(hydration.html).toContain(
			'"resumptions":[{"componentId":"component:StreamedCounter","values":{"count":9},"contexts":{},"settledContinuations":["task:stream"]}]'
		);
	});

	it('captures only compiler-registered shared component context values', async () => {
		const Status = createContext<{ message: string }>('status');
		function Consumer(this: Component<{}>) {
			return () => createVNode('p', null, this.getContext(Status).message);
		}
		const implementation = function Provider(this: Component<{}>) {
			registerComponentContinuationContexts(this, [{ name: 'Status', token: Status }]);
			this.task(
				markComponentContinuationTask('task:status', () => {
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

		expect(rendered.html).toContain('<p>ready</p>');
		expect(rendered.resumptions).toEqual([
			{
				componentId: 'component:Provider',
				values: {},
				contexts: { Status: { message: 'ready' } },
				settledContinuations: ['task:status']
			}
		]);
	});
});
