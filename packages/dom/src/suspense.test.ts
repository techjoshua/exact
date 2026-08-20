/**
 * @vitest-environment jsdom
 */
import './structural-boundaries.js';
import {
	Suspense,
	activateTaskForHost,
	defineTask,
	stageTaskMutation,
	type Component,
	type TaskContext
} from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { render, unmount } from './index.js';
import { createCompiledVNode, createVNode } from './test-support/native-vnode.js';

describe('@exactjs/dom native Suspense', () => {
	it('shows fallback until blocking descendant work settles', async () => {
		let resolve!: () => void;
		const pending = new Promise<void>((settle) => {
			resolve = settle;
		});
		let panel!: Component<{ ready: boolean }>;

		function AsyncPanel(this: Component<{ ready: boolean }>) {
			panel = this;
			this.state.ready = false;
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async ({ signal }) => {
					await pending;
					stageTaskMutation(signal, () => {
						this.state.ready = true;
					});
				})
			);
			return () =>
				createCompiledVNode(
					'p',
					{},
					createExpression(() => (this.state.ready ? 'ready' : ''))
				);
		}

		const container = document.createElement('div');
		render(
			createVNode(
				Suspense,
				{ fallback: createVNode('span', null, 'loading') },
				createVNode(AsyncPanel, {})
			),
			container
		);
		expect(container.textContent).toBe('loading');

		resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(panel.state.ready).toBe(false);
		await settleMicrotasks();
		expect(container.textContent).toBe('ready');
		unmount(container);
	});

	it('retains committed content while a replacement generation prepares', async () => {
		let resolveFirst!: () => void;
		let resolveSecond!: () => void;
		const first = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});
		const second = new Promise<void>((resolve) => {
			resolveSecond = resolve;
		});

		function Panel(this: Component<{}>, props: { label: string; pending: Promise<void> }) {
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async (_task: TaskContext) => {
					await props.pending;
				})
			);
			return () => createVNode('p', null, props.label);
		}

		const boundary = (label: string, pending: Promise<void>) =>
			createVNode(
				Suspense,
				{ fallback: createVNode('span', null, 'loading') },
				createVNode(Panel, { label, pending })
			);
		const container = document.createElement('div');
		render(boundary('first', first), container);
		resolveFirst();
		await settleMicrotasks();
		const committed = container.querySelector('p');
		expect(committed?.textContent).toBe('first');

		render(boundary('second', second), container);
		expect(container.querySelector('p')).toBe(committed);
		expect(container.textContent).toBe('first');

		resolveSecond();
		await settleMicrotasks();
		expect(container.textContent).toBe('second');
		expect(container.querySelector('p')).not.toBe(committed);
		unmount(container);
	});

	it('publishes a restarted descendant task only after its readiness generation settles', async () => {
		let panel!: Component<{ query: string; result: string }>;
		let resolve!: () => void;
		const pending = new Promise<void>((settle) => {
			resolve = settle;
		});
		function Search(this: Component<{ query: string; result: string }>) {
			panel = this;
			this.state.query = 'initial';
			this.state.result = '';
			activateTaskForHost(
				this,
				defineTask(
					{ readiness: 'blocking', concurrency: 'latest' },
					async (query: string, { signal }) => {
						if (query !== 'initial') await pending;
						stageTaskMutation(signal, () => {
							this.state.result = query;
						});
					}
				),
				this.reactive(() => this.state.query)
			);
			return () =>
				createCompiledVNode(
					'p',
					{},
					createExpression(() => this.state.result)
				);
		}
		const container = document.createElement('div');
		render(createVNode(Suspense, { fallback: 'loading' }, createVNode(Search, {})), container);
		await settleMicrotasks();
		expect(container.textContent).toBe('initial');

		panel.state.query = 'next';
		await settleMicrotasks();
		expect(panel.state.result).toBe('initial');
		expect(container.textContent).toBe('initial');

		resolve();
		await settleMicrotasks();
		expect(panel.state.result).toBe('next');
		expect(container.textContent).toBe('next');
		unmount(container);
	});

	it('lets nested boundaries reveal their fallback without blocking the parent', () => {
		const never = new Promise<void>(() => undefined);
		function Pending(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async (_task: TaskContext) => {
					await never;
				})
			);
			return () => createVNode('strong', null, 'inner ready');
		}
		const container = document.createElement('div');
		render(
			createVNode(
				Suspense,
				{ fallback: 'outer loading' },
				createVNode('h1', null, 'shell'),
				createVNode(
					Suspense,
					{ fallback: createVNode('i', null, 'inner loading') },
					createVNode(Pending, {})
				)
			),
			container
		);

		expect(container.textContent).toBe('shellinner loading');
		unmount(container);
	});
});

async function settleMicrotasks(): Promise<void> {
	for (let index = 0; index < 12; index++) {
		flushSync();
		await Promise.resolve();
		await Promise.resolve();
	}
	flushSync();
}
