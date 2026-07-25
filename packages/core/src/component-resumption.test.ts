import { describe, expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import {
	createComponentDomain,
	createComponentInstance,
	markComponentContinuationTask,
	settledComponentContinuationIds,
	type Component
} from './index.js';

describe('@exactjs/core component resumption', () => {
	it('restores SSR state and arms settled continuations without repeating initial work', () => {
		let runs = 0;
		function Search(this: Component<{ query: string; result: string }>) {
			this.state.query = 'setup';
			this.state.result = 'waiting';
			this.task(
				this.reactive(() => this.state.query),
				markComponentContinuationTask('load', (query: string) => {
					runs++;
					this.state.result = query.toUpperCase();
				})
			);
			return () => this.state.result;
		}
		const domain = createComponentDomain('page', undefined, () => ({
			componentId: 'component:Search',
			values: { query: 'server', result: 'SERVER' },
			settledContinuations: ['load']
		}));

		const instance = createComponentInstance(Search, {}, undefined, undefined, domain);

		expect(instance.state.query).toBe('server');
		expect(instance.state.result).toBe('SERVER');
		expect(runs).toBe(0);

		instance.state.query = 'client';
		flushSync();

		expect(runs).toBe(1);
		expect(instance.state.result).toBe('CLIENT');
		instance.unmount();
	});

	it('reports only successfully completed tagged generations', () => {
		function Worker(this: Component<{ ready: boolean }>) {
			this.state.ready = false;
			this.task(
				markComponentContinuationTask('prepare', () => {
					this.state.ready = true;
				})
			);
			return () => null;
		}

		const instance = createComponentInstance(Worker, {});

		expect(instance.state.ready).toBe(true);
		expect(settledComponentContinuationIds(instance)).toEqual(['prepare']);
		instance.unmount();
	});
});
