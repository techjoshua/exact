import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	ErrorContext,
	createComponentInstance,
	createErrorContext,
	createVNode,
	ownTaskResource,
	renderInstance,
	type Component,
	type ErrorReport
} from './index.js';

describe('@exactjs/core lifecycle', () => {
	it('constructs once and renders repeatedly from tracked state', () => {
		const constructed = vi.fn();
		const rendered = vi.fn();

		function Counter(this: Component<{ count: number }>) {
			constructed();
			this.state.count = 0;
			return () => {
				rendered();
				return Number(this.state.count) > 0
					? createVNode('span', null, 'positive')
					: createVNode('span', null, 'zero');
			};
		}

		const instance = createComponentInstance(Counter, {});
		renderInstance(instance, () => renderInstance(instance, () => undefined));
		instance.state.count = 1;
		flushSync();

		expect(constructed).toHaveBeenCalledTimes(1);
		expect(rendered).toHaveBeenCalledTimes(2);
	});

	it('reruns task dependencies and aborts previous work', () => {
		const aborts: boolean[] = [];

		function Search(this: Component<{ query: string }>) {
			this.state.query = 'a';
			(this.reactive(() => this.state.query) as any).task(
				(query: string, { signal }: { signal: AbortSignal }) => {
					expect(typeof query).toBe('string');
					signal.addEventListener('abort', () => aborts.push(true));
				}
			);
			return () => null;
		}

		const instance = createComponentInstance(Search, {});
		instance.state.query = 'b';
		flushSync();

		expect(aborts).toEqual([true]);
	});

	it('waits for asynchronous cleanup before starting the replacement task generation', async () => {
		let releaseCleanup!: () => void;
		const cleanupFinished = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const starts: string[] = [];

		const instance = createComponentInstance(function Search(this: Component<{ query: string }>) {
			this.state.query = 'a';
			(this.reactive(() => this.state.query) as any).task((query: string) => {
				starts.push(query);
				return query === 'a' ? () => cleanupFinished : undefined;
			});
			return () => null;
		}, {});

		instance.state.query = 'b';
		flushSync();
		expect(starts).toEqual(['a']);

		releaseCleanup();
		await cleanupFinished;
		await vi.waitFor(() => expect(starts).toEqual(['a', 'b']));
	});

	it('waits for compiler-owned asynchronous resources before replacing a task generation', async () => {
		let releaseClose!: () => void;
		const closed = new Promise<void>((resolve) => {
			releaseClose = resolve;
		});
		const starts: string[] = [];

		const instance = createComponentInstance(function Search(this: Component<{ query: string }>) {
			this.state.query = 'a';
			(this.reactive(() => this.state.query) as any).task(
				(query: string, { signal }: { signal: AbortSignal }) => {
					starts.push(query);
					if (query === 'a') ownTaskResource(signal, { close: () => closed }, 'close');
				}
			);
			return () => null;
		}, {});

		instance.state.query = 'b';
		flushSync();
		expect(starts).toEqual(['a']);

		releaseClose();
		await closed;
		await vi.waitFor(() => expect(starts).toEqual(['a', 'b']));
	});

	it('coalesces reruns while an asynchronous task generation is settling', async () => {
		let finishFirst!: (cleanup: () => Promise<void>) => void;
		let finishCleanup!: () => void;
		const first = new Promise<() => Promise<void>>((resolve) => {
			finishFirst = resolve;
		});
		const cleanup = new Promise<void>((resolve) => {
			finishCleanup = resolve;
		});
		const starts: string[] = [];

		const instance = createComponentInstance(function Search(this: Component<{ query: string }>) {
			this.state.query = 'a';
			(this.reactive(() => this.state.query) as any).task((query: string) => {
				starts.push(query);
				return query === 'a' ? first : undefined;
			});
			return () => null;
		}, {});

		instance.state.query = 'b';
		flushSync();
		instance.state.query = 'c';
		flushSync();
		expect(starts).toEqual(['a']);

		finishFirst(() => cleanup);
		await first;
		await Promise.resolve();
		expect(starts).toEqual(['a']);
		finishCleanup();
		await cleanup;
		await vi.waitFor(() => expect(starts).toEqual(['a', 'c']));
	});

	it('routes scheduled setup watcher failures through the component error context', () => {
		let instance!: Component<{ count: number; errors: ErrorReport[] }>;
		createComponentInstance(function Worker(
			this: Component<{ count: number; errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.count = 0;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			watch(() => {
				if (this.state.count === 1) throw new Error('watch failed');
			});
			return () => null;
		}, {});

		instance.state.count = 1;
		expect(() => flushSync()).not.toThrow();
		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]).toMatchObject({ source: 'reactive', phase: 'watch' });
	});

	it('runs normal lifecycle cleanup when construction fails', () => {
		const taskCleanup = vi.fn();
		const unmountCleanup = vi.fn();

		expect(() =>
			createComponentInstance(function Broken(this: Component<{}>) {
				(this as any).task(() => taskCleanup);
				this.onUnmount(unmountCleanup);
				throw new Error('construct failed');
			}, {})
		).toThrow('construct failed');

		expect(taskCleanup).toHaveBeenCalledTimes(1);
		expect(unmountCleanup).toHaveBeenCalledTimes(1);
	});
});
