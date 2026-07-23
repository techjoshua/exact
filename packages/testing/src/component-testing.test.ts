/**
 * @vitest-environment jsdom
 */
import {
	createContext,
	createErrorContext,
	createVNode,
	ErrorContext,
	type Component
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { installExactMatchers, mountTest, testComponent } from './index.js';
import { installVitestMatchers } from './vitest.js';

describe('component testing', () => {
	it('reads and writes state, contexts, components, and events', async () => {
		const Name = createContext<string>('test.name');
		function Child(this: Component<{}>) {
			const name = this.getContext(Name);
			return () => createVNode('span', null, name);
		}
		function Counter(this: Component<{ count: number }>, props: { initial: number }) {
			this.state.count = props.initial;
			return () =>
				createVNode(
					'section',
					null,
					createVNode('button', { onClick: () => this.state.count++ }, `Count ${this.state.count}`),
					createVNode(Child, {})
				);
		}
		const view = await testComponent(Counter).props({ initial: 1 }).context(Name, 'Ada').mount();
		expect(view.root.state().count).toBe(1);
		expect(view.root.find(Child).getByText('Ada').text()).toBe('Ada');
		await view.root.getByRole('button', { name: 'Count 1' }).click();
		expect(view.root.state().count).toBe(2);
		await view.root.setState({ count: 4 });
		expect(view.root.getByRole('button', { name: 'Count 4' })).toBeDefined();
		view.unmount();
	});

	it('settles retained asynchronous component tasks', async () => {
		function AsyncPanel(this: Component<{ ready: boolean }>) {
			this.state.ready = false;
			this.task(async () => {
				await Promise.resolve();
				this.state.ready = true;
			});
			return () => createVNode('p', null, this.state.ready ? 'Ready' : 'Waiting');
		}
		const view = await testComponent(AsyncPanel).mount();
		expect(view.root.getByText('Ready')).toBeDefined();
		view.unmount();
	});

	it('rejects ambiguous singular queries and installs runner-neutral matchers', async () => {
		function Buttons() {
			return () =>
				createVNode(
					'div',
					null,
					createVNode('button', null, 'One'),
					createVNode('button', null, 'Two')
				);
		}
		const view = await testComponent(Buttons).mount();
		expect(() => view.root.getByRole('button')).toThrow('found 2');
		let installed: Record<string, unknown> | undefined;
		installExactMatchers({
			extend(matchers) {
				installed = matchers;
			}
		});
		expect(installed).toHaveProperty('toHaveState');
		view.unmount();
	});

	it('mounts intrinsic trees and supports recursive root component types', async () => {
		const intrinsic = await mountTest(createVNode('button', null, 'Hello'));
		expect(intrinsic.getByRole('button').text()).toBe('Hello');
		intrinsic.unmount();

		function Recursive(this: Component<{}>, props: { depth: number }) {
			return () =>
				props.depth
					? createVNode(Recursive, { depth: props.depth - 1 })
					: createVNode('p', null, 'Done');
		}
		const recursive = await testComponent(Recursive).props({ depth: 2 }).mount();
		expect(recursive.root.getByText('Done')).toBeDefined();
		expect(recursive.root.findAll(Recursive)).toHaveLength(2);
		recursive.unmount();
	});

	it('cleans failed mounts and reports stale components as unmounted', async () => {
		const before = document.body.children.length;
		function Missing(): never {
			throw new Error('construct failed');
		}
		await expect(testComponent(Missing).mount()).rejects.toThrow();
		expect(document.body.children.length).toBe(before);

		function Stable() {
			return () => createVNode('p', null, 'Stable');
		}
		const view = await testComponent(Stable).mount();
		const component = view.root;
		view.unmount();
		expect(component.isMounted()).toBe(false);
	});

	it('rejects managed containers and reports replaced element handles', async () => {
		const container = document.createElement('div');
		function Existing(this: Component<{ alternate: boolean }>) {
			this.state.alternate = false;
			return () =>
				this.state.alternate
					? createVNode('span', null, 'New')
					: createVNode('button', null, 'Old');
		}
		const first = await testComponent(Existing).container(container).mount();
		await expect(testComponent(Existing).container(container).mount()).rejects.toThrow(
			'already has a mounted eXact root'
		);
		expect(first.root.isMounted()).toBe(true);
		const stale = first.getByRole('button');
		await first.root.setState({ alternate: true });
		expect(() => stale.text()).toThrow('no longer mounted');
		first.unmount();
	});

	it('finalizes the view even when component teardown reports an error', async () => {
		const before = document.body.children.length;
		function BrokenTeardown(this: Component<{}>) {
			this.onUnmount(() => {
				throw new Error('teardown failed');
			});
			return () => createVNode('p', null, 'Mounted');
		}
		const teardownErrors = createErrorContext();
		teardownErrors.report = () => {
			throw new Error('teardown failed');
		};
		const view = await testComponent(BrokenTeardown).context(ErrorContext, teardownErrors).mount();
		const root = view.root;
		expect(() => view.unmount()).toThrow('teardown failed');
		expect(root.isMounted()).toBe(false);
		expect(document.body.children.length).toBe(before);
		expect(() => view.snapshot()).toThrow('unmounted');
	});

	it('excludes inaccessible roles and handles reusable regular expressions', async () => {
		function Content() {
			return () =>
				createVNode(
					'div',
					null,
					createVNode('button', { hidden: true }, 'Hidden'),
					createVNode('button', null, 'Visible'),
					createVNode('p', null, 'Repeat'),
					createVNode('p', null, 'Repeat')
				);
		}
		const view = await testComponent(Content).mount();
		expect(view.getAllByRole('button')).toHaveLength(1);
		expect(view.getAllByText(/Repeat/g)).toHaveLength(2);
		view.unmount();
	});

	it('augments Vitest matcher types', () => {
		installVitestMatchers(expect);
		expect({}).not.toBeMounted();
	});

	it('settles asynchronous event handlers and routes their failures', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		function AsyncButton(this: Component<{ done: boolean }>) {
			this.state.done = false;
			return () =>
				createVNode(
					'button',
					{
						onClick: async () => {
							await gate;
							this.state.done = true;
						}
					},
					this.state.done ? 'Done' : 'Run'
				);
		}
		const view = await testComponent(AsyncButton).mount();
		let settled = false;
		const action = view
			.getByRole('button')
			.click()
			.then(() => {
				settled = true;
			});
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await action;
		expect(view.root.state().done).toBe(true);
		view.unmount();

		const errors = createErrorContext();
		function RejectingButton() {
			return () =>
				createVNode(
					'button',
					{
						onClick: async () => {
							throw new Error('event failed');
						}
					},
					'Reject'
				);
		}
		const rejected = await testComponent(RejectingButton).context(ErrorContext, errors).mount();
		await rejected.getByRole('button').click();
		expect(errors.errors).toHaveLength(1);
		expect(errors.errors[0]?.error).toEqual(new Error('event failed'));
		rejected.unmount();
	});
});
