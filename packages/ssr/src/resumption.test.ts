import {
	activateTaskForHost,
	createContext,
	defineTask,
	markComponentContinuationTask,
	registerComponentContinuationContexts,
	type Component
} from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { computed } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import {
	renderToHydratableDocumentStream,
	renderToHydratableString,
	renderToHydratableStringAsync
} from './index.js';
import { renderResumableComponentBoundary } from './render/boundaries.js';
import { createSsrContext } from './render/context.js';
import { readRemainingStreamEvents } from './test-support/streams.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr component resumption', () => {
	it('captures direct-frame state in parent-before-child construction order', () => {
		const DirectChild = directResumableFixture(
			'DirectChild',
			['value'],
			function DirectChild(this: { state: Record<string, unknown> }, props: { value: number }) {
				this.state.value = props.value + 1;
				return () => createVNode('output', null, String(this.state.value));
			}
		);
		const DirectCounter = directResumableFixture(
			'DirectCounter',
			['count'],
			function DirectCounter(this: { state: Record<string, unknown> }, props: { count: number }) {
				this.state.count = props.count;
				this.state.serverOnly = 'private';
				return () =>
					createVNode(
						'section',
						null,
						createVNode(DirectChild, { value: this.state.count as number })
					);
			}
		);

		const rendered = renderToHydratableString(
			createVNode(DirectCounter, { count: computed(() => 4) })
		);

		expect(rendered.html).toContain('<output>5</output>');
		expect(rendered.resumptions).toEqual([
			{
				componentId: 'component:DirectCounter',
				values: { count: 4 },
				contexts: {},
				settledContinuations: []
			},
			{
				componentId: 'component:DirectChild',
				values: { value: 5 },
				contexts: {},
				settledContinuations: []
			}
		]);
		expect(rendered.hydrationScript).not.toContain('serverOnly');
		expect(rendered.hydrationScript).not.toContain('private');
	});

	it('discards resumptions from invalidated synchronous render attempts', () => {
		const childImplementation = function Snapshot(
			this: Component<{ value: number }>,
			props: { value: number; invalidate(): void }
		) {
			this.state.value = props.value;
			props.invalidate();
			return () => createVNode('output', null, String(this.state.value));
		};
		const Snapshot = Object.assign(childImplementation, {
			[exactComponentType]: 'component:Snapshot',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Snapshot',
					statePaths: ['value'],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});
		function Root(this: Component<{ value: number }>) {
			this.state.value = 0;
			return () =>
				createVNode(Snapshot, {
					value: this.state.value,
					invalidate: () => {
						if (this.state.value === 0) this.state.value = 1;
					}
				});
		}

		const rendered = renderToHydratableString(createVNode(Root, {}));

		expect(rendered.html).toContain('<output>1</output>');
		expect(rendered.resumptions).toEqual([
			{
				componentId: 'component:Snapshot',
				values: { value: 1 },
				contexts: {},
				settledContinuations: []
			}
		]);
	});

	it('emits only compiler-selected state and successfully settled continuation ids', async () => {
		const implementation = function Counter(
			this: Component<{ count: number; serverOnly: string }>
		) {
			this.state.count = 0;
			this.state.serverOnly = 'private';
			activateTaskForHost(
				this,
				defineTask(
					{},
					markComponentContinuationTask('task:load', async () => {
						await Promise.resolve();
						this.state.count = 7;
					})
				)
			);
			return () => createVNode('output', null, String(this.state.count));
		};
		const Counter = Object.assign(implementation, {
			[exactComponentType]: 'component:Counter',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:load',
						componentId: 'component:Counter',
						kind: 'task' as const,
						readiness: 'nonblocking' as const,
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

		function Root() {
			return () => createVNode(Counter, {});
		}
		const rendered = await renderToHydratableStringAsync(createVNode(Root, {}));

		expect(rendered.html).toContain('<output>7</output>');
		expect(rendered.html).toContain('data-exact-client-name="Counter"');
		expect(rendered.html).toContain('data-exact-client-resumption="true"');
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

	it('does not promote state-only resumptions into islands or evaluate ignored reactive children', async () => {
		let childEvaluations = 0;
		const ignoredChild = computed(() => {
			childEvaluations++;
			return createVNode('strong', null, 'ignored');
		});
		const implementation = function StateOnly(
			this: Component<{ count: number }>,
			_props: { children?: unknown }
		) {
			this.state.count = 1;
			return () => createVNode('output', null, String(this.state.count));
		};
		const StateOnly = Object.assign(implementation, {
			[exactComponentType]: 'component:StateOnly',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [
					{
						id: 'implementation:StateOnly',
						name: 'StateOnly',
						role: 'root' as const,
						implementation
					}
				],
				continuations: [],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:StateOnly',
					statePaths: ['count'],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});
		function Root() {
			return () => createVNode(StateOnly, {}, ignoredChild);
		}

		const rendered = await renderToHydratableStringAsync(createVNode(Root, {}));

		expect(rendered.html).toContain('<output>1</output>');
		expect(rendered.html).not.toContain('data-exact-client-name="StateOnly"');
		expect(childEvaluations).toBe(0);
	});

	it('rejects reactive continuation props without evaluating them during SSR', async () => {
		let childEvaluations = 0;
		const reactiveChild = computed(() => {
			childEvaluations++;
			return createVNode('strong', null, 'deferred');
		});
		const implementation = function ContinuationOwner(
			this: Component<{}>,
			_props: { children?: unknown }
		) {
			return () => createVNode('output', null, 'ready');
		};
		const ContinuationOwner = Object.assign(implementation, {
			[exactComponentType]: 'component:ContinuationOwner',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [
					{
						id: 'implementation:ContinuationOwner',
						name: 'ContinuationOwner',
						role: 'root' as const,
						implementation
					}
				],
				continuations: [
					{
						id: 'task:continuation-owner',
						componentId: 'component:ContinuationOwner',
						kind: 'task' as const,
						readiness: 'nonblocking' as const,
						dependencies: [],
						stateReads: [],
						stateWrites: [],
						publicContexts: [],
						serverContexts: [],
						contextWrites: [],
						boundaries: []
					}
				],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:ContinuationOwner',
					statePaths: [],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});
		const vnode = createVNode(ContinuationOwner, {});
		expect(() =>
			renderResumableComponentBoundary(
				createSsrContext({}),
				vnode,
				'component-boundary',
				'<output>ready</output>',
				{ children: reactiveChild }
			)
		).toThrow('must be JSON-serializable');
		expect(childEvaluations).toBe(0);

		let sourceEvaluations = 0;
		const reactiveSource = computed(() => {
			sourceEvaluations++;
			return 'compiled';
		});
		const boundary = renderResumableComponentBoundary(
			createSsrContext({}),
			vnode,
			'component-boundary',
			'<output>ready</output>',
			{ source: reactiveSource }
		);
		expect(boundary).toContain('compiled');
		expect(sourceEvaluations).toBe(1);
	});

	it('captures the settled render used by a hydratable document stream', async () => {
		const implementation = function StreamedCounter(this: Component<{ count: number }>) {
			this.state.count = 0;
			activateTaskForHost(
				this,
				defineTask(
					{},
					markComponentContinuationTask('task:stream', async () => {
						await Promise.resolve();
						this.state.count = 9;
					})
				)
			);
			return () => createVNode('output', null, String(this.state.count));
		};
		const StreamedCounter = Object.assign(implementation, {
			[exactComponentType]: 'component:StreamedCounter',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [
					{
						id: 'task:stream',
						componentId: 'component:StreamedCounter',
						kind: 'task' as const,
						readiness: 'nonblocking' as const,
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
			'"resumptions":[{"componentId":"component:StreamedCounter","values":{"count":9},"settledContinuations":["task:stream"]}]'
		);
	});

	it('captures only compiler-registered shared component context values', async () => {
		const Status = createContext<{ message: string }>('status');
		function Consumer(this: Component<{}>) {
			return () => createVNode('p', null, this.getContext(Status).message);
		}
		const implementation = function Provider(this: Component<{}>) {
			registerComponentContinuationContexts(this, [{ name: 'Status', token: Status }]);
			activateTaskForHost(
				this,
				defineTask(
					{},
					markComponentContinuationTask('task:status', () => {
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

/** Attaches the smallest prepared contract used by direct-frame resumption fixtures. */
function directResumableFixture<Props extends Record<string, unknown>>(
	name: string,
	statePaths: readonly string[],
	implementation: (
		this: { state: Record<string, unknown> },
		props: Props
	) => () => ReturnType<typeof createVNode>
) {
	const componentId = `component:${name}`;
	return Object.assign(implementation, {
		[exactComponentType]: componentId,
		[exactComponentContract]: {
			version: 2 as const,
			placement: 'isomorphic' as const,
			role: 'client' as const,
			implementations: [
				{
					id: `implementation:${name}`,
					name,
					role: 'root' as const,
					implementation
				}
			],
			continuations: [],
			executors: [],
			boundaries: [],
			definition: {
				version: 1 as const,
				instantiate: implementation,
				abi: 1,
				capabilities: ['resumption'] as const,
				state: statePaths,
				server: {
					version: 1 as const,
					classification: 'synchronous' as const,
					lane: 'direct' as const,
					setupProps: [],
					render: implementation
				}
			},
			resumption: {
				componentId,
				statePaths,
				valueCaptures: [],
				contexts: [],
				boundaries: []
			}
		}
	});
}
