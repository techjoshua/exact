import { describe, expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import {
	activateTask,
	defineTask,
	markComponentContinuationTask,
	settledComponentContinuationIds,
	withComponentResumption,
	type Component,
	type TaskContext
} from './index.js';
import { createFrameworkFixtureComponentInstance } from './runtime/render.js';
import { createFrameworkComponentDomain } from './component/domain.js';

describe('@exactjs/core component resumption', () => {
	it('restores SSR state and arms settled continuations without repeating initial work', () => {
		let runs = 0;
		function Search(this: Component<{ query: string; result: string }>) {
			this.state.query = 'setup';
			this.state.result = 'waiting';
			const load = defineTask(
				{},
				markComponentContinuationTask('load', (query: string, _task: TaskContext) => {
					runs++;
					this.state.result = query.toUpperCase();
				})
			);
			activateTask(
				load,
				this.reactive(() => this.state.query)
			);
			return () => this.state.result;
		}
		const domain = createFrameworkComponentDomain({
			executionRoot: 'page',
			resumeComponent: () => ({
				componentId: 'component:Search',
				values: { query: 'server', result: 'SERVER' },
				contexts: {},
				settledContinuations: ['load']
			})
		});

		const fresh = createFrameworkFixtureComponentInstance(Search, {}, undefined, undefined, domain);
		expect(fresh.state.query).toBe('setup');
		expect(fresh.state.result).toBe('waiting');
		fresh.unmount();

		const instance = withComponentResumption(domain, () =>
			createFrameworkFixtureComponentInstance(Search, {}, undefined, undefined, domain)
		);

		expect(instance.state.query).toBe('server');
		expect(instance.state.result).toBe('SERVER');
		expect(runs).toBe(0);

		instance.state.query = 'client';
		flushSync();

		expect(runs).toBe(1);
		expect(instance.state.result).toBe('CLIENT');
		instance.unmount();
	});

	it('reports only successfully completed tagged generations', async () => {
		function Worker(this: Component<{ ready: boolean }>) {
			this.state.ready = false;
			const prepare = defineTask(
				{},
				markComponentContinuationTask('prepare', (_task: TaskContext) => {
					this.state.ready = true;
				})
			);
			activateTask(prepare);
			return () => null;
		}

		const instance = createFrameworkFixtureComponentInstance(Worker, {});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(instance.state.ready).toBe(true);
		expect(settledComponentContinuationIds(instance)).toEqual(['prepare']);
		instance.unmount();
	});
});
import './runtime/component-tasks.js';
