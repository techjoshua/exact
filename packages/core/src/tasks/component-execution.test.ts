import { describe, expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import {
	activateTask,
	activationInputDependency,
	componentExecutionValueForHost,
	createComponentInstance,
	createExpression,
	defineTask,
	exactComponentContract,
	exactComponentType,
	type Component,
	type TaskContext
} from '../index.js';
import { markComponentContinuationTask } from './component-continuation.js';
import { createContinuationDependencySlot } from './dependency-source.js';
import { markContinuationDependencyValue } from './dependency-provenance.js';
import { prepareComponentExecution } from './component-execution-plan.js';

describe('compiler-planned component execution', () => {
	it('prepares immutable lookup indexes once for every compiled plan', () => {
		const plan = {
			version: 1 as const,
			ports: [
				{ index: 0, kind: 'props' as const, path: 'props.query', direction: 'input' as const },
				{ index: 1, kind: 'state' as const, path: 'result', direction: 'output' as const }
			],
			transitions: [
				{
					id: 'load',
					taskId: 'load',
					activation: 'setup' as const,
					placement: 'server' as const,
					readiness: 'blocking' as const,
					concurrency: 'latest' as const,
					inputs: [0],
					outputs: [1]
				}
			],
			reactive: []
		};

		const first = prepareComponentExecution(plan);
		expect(prepareComponentExecution(plan)).toBe(first);
		expect(first.statePortsByPath.get('result')).toBe(1);
		expect(first.propPorts).toEqual([{ portIndex: 0, path: ['query'] }]);
		expect(first.setupPropNames).toEqual(new Set(['query']));
		expect(first.transitionsById.get('load')).toMatchObject({
			dependencyPorts: [0],
			outputs: [{ portIndex: 1, path: ['result'] }]
		});
	});

	it('keeps an interaction-only output available until its first generation starts', () => {
		let initialStatus: string | undefined;
		function Editor(this: Component<{ result: string }>) {
			this.state.result = 'draft';
			const forwarded = componentExecutionValueForHost(
				this,
				'result',
				createExpression(() => this.state.result)
			);
			initialStatus = activationInputDependency(forwarded).read().status;
			return () => forwarded;
		}
		const CompiledEditor = Object.assign(Editor, {
			[exactComponentType]: 'component:Editor',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'executor' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: {
					version: 1 as const,
					ports: [
						{ index: 0, kind: 'state' as const, path: 'result', direction: 'output' as const }
					],
					transitions: [
						{
							id: 'save',
							taskId: 'save',
							activation: 'interaction' as const,
							placement: 'isomorphic' as const,
							readiness: 'nonblocking' as const,
							concurrency: 'latest' as const,
							inputs: [],
							outputs: [0]
						}
					],
					reactive: []
				}
			}
		});

		const instance = createComponentInstance(CompiledEditor, {});
		expect(initialStatus).toBe('available');
		instance.unmount();
	});

	it('hides prop dependency sources from component reads while retaining task readiness', async () => {
		const source = createContinuationDependencySlot<{ label: string }>();
		const generation = source.beginGeneration();
		const observedProps: unknown[] = [];
		const taskValues: string[] = [];

		function Consumer(this: Component<{}>, props: { value: { label: string } }) {
			observedProps.push(props.value.label);
			activateTask(
				defineTask(
					{},
					markComponentContinuationTask('consume-prop', (value: string, _task: TaskContext) => {
						taskValues.push(value);
					})
				),
				props.value.label
			);
			return () => props.value.label;
		}
		const CompiledConsumer = Object.assign(Consumer, {
			[exactComponentType]: 'component:PropConsumer',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'executor' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: {
					version: 1 as const,
					ports: [
						{ index: 0, kind: 'props' as const, path: 'value.label', direction: 'input' as const }
					],
					transitions: [
						{
							id: 'consume-prop',
							taskId: 'consume-prop',
							activation: 'setup' as const,
							placement: 'isomorphic' as const,
							readiness: 'blocking' as const,
							concurrency: 'parallel' as const,
							inputs: [0],
							outputs: []
						}
					],
					reactive: []
				}
			}
		});

		const forwarded = markContinuationDependencyValue(
			createExpression(() => ({ label: 'fallback' })),
			source
		);
		const instance = createComponentInstance(CompiledConsumer, {
			value: forwarded as unknown as { label: string }
		});
		expect(observedProps).toEqual(['fallback']);
		expect(taskValues).toEqual([]);

		source.publish(generation, { label: 'ready' });
		flushSync();
		await Promise.resolve();
		expect(taskValues).toEqual(['ready']);
		instance.unmount();
	});

	it('waits for a predecessor generation before issuing its dependent continuation', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const observed: number[] = [];
		function Pipeline(this: Component<{ input: number; middle: number; result: number }>) {
			this.state.input = 2;
			this.state.middle = 0;
			this.state.result = 0;
			const load = defineTask(
				{ concurrency: 'latest' },
				markComponentContinuationTask('load', async (input: number, _task: TaskContext) => {
					await gate;
					this.state.middle = input * 2;
				})
			);
			const consume = defineTask(
				{},
				markComponentContinuationTask('consume', (middle: number, _task: TaskContext) => {
					observed.push(middle);
					this.state.result = middle + 1;
				})
			);
			activateTask(
				load,
				this.reactive(() => this.state.input)
			);
			activateTask(
				consume,
				this.reactive(() => this.state.middle)
			);
			return () => this.state.result;
		}
		const CompiledPipeline = Object.assign(Pipeline, {
			[exactComponentType]: 'component:Pipeline',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'executor' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: {
					version: 1 as const,
					ports: [
						{ index: 0, kind: 'state' as const, path: 'input', direction: 'input' as const },
						{ index: 1, kind: 'state' as const, path: 'middle', direction: 'inout' as const },
						{ index: 2, kind: 'state' as const, path: 'result', direction: 'output' as const }
					],
					transitions: [
						{
							id: 'load',
							taskId: 'load',
							activation: 'setup' as const,
							placement: 'isomorphic' as const,
							readiness: 'blocking' as const,
							concurrency: 'latest' as const,
							inputs: [0],
							outputs: [1]
						},
						{
							id: 'consume',
							taskId: 'consume',
							activation: 'setup' as const,
							placement: 'isomorphic' as const,
							readiness: 'blocking' as const,
							concurrency: 'parallel' as const,
							inputs: [1],
							outputs: [2]
						}
					],
					reactive: []
				}
			}
		});

		const instance = createComponentInstance(CompiledPipeline, {});
		flushSync();
		await Promise.resolve();
		expect(observed).toEqual([]);

		release();
		await gate;
		for (let pass = 0; pass < 10 && observed.length === 0; pass++) {
			await Promise.resolve();
			flushSync();
		}
		expect(observed).toEqual([4]);
		expect(instance.state.result).toBe(5);
		instance.unmount();
	});
});
