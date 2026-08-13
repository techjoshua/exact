import {
	createVNode,
	markExactComponent,
	withTaskObserver,
	type Child,
	type Component,
	type ComponentFunction,
	type ComponentInstance,
	type ContextToken,
	type TaskObserver,
	type VNode
} from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { inspectDomRoot } from '@exactjs/dom/testing';
import { flushSync } from '@exactjs/reactive';

import type { ContextEntry, PropsOf, StateOf, TestConfiguration } from '../contracts.js';
import { attachCleanupError } from '../control/settling.js';
import { TestView } from './views.js';

/** Defines the task tracker class contract. */
export class TaskTracker implements TaskObserver {
	readonly pending = new Map<Promise<unknown>, ComponentInstance<any>>();
	/** Performs the register domain operation for this task tracker instance. */
	register(promise: Promise<unknown>, instance: ComponentInstance<any>): void {
		this.pending.set(promise, instance);
		void promise.then(
			() => this.pending.delete(promise),
			() => this.pending.delete(promise)
		);
	}
	/** Performs the retain domain operation for this task tracker instance. */
	retain(): void {}
}

/** Defines the test component builder class contract. */
export class TestComponentBuilder<C extends ComponentFunction<any, any>> {
	private componentProps = {} as PropsOf<C>;
	private contextEntries: ContextEntry[] = [];
	private targetContainer?: Element;
	private configuration: TestConfiguration = {};

	constructor(readonly component: C) {}
	/** Performs the props domain operation for this test component builder instance. */
	props(props: PropsOf<C>): this {
		this.componentProps = props;
		return this;
	}
	/** Performs the context domain operation for this test component builder instance. */
	context<T>(token: ContextToken<T>, value: T): this {
		this.contextEntries.push({ token, value });
		return this;
	}
	/** Performs the contexts domain operation for this test component builder instance. */
	contexts(entries: Iterable<readonly [ContextToken<any>, unknown]>): this {
		for (const [token, value] of entries) this.contextEntries.push({ token, value });
		return this;
	}
	/** Performs the container domain operation for this test component builder instance. */
	container(container: Element): this {
		this.targetContainer = container;
		return this;
	}
	/** Performs the configure domain operation for this test component builder instance. */
	configure(configuration: TestConfiguration): this {
		this.configuration = { ...this.configuration, ...configuration };
		return this;
	}
	/** Performs the mount domain operation for this test component builder instance. */
	async mount(): Promise<TestView<StateOf<C>, PropsOf<C>>> {
		return mountComponent(this.component, this.componentProps, {
			...this.configuration,
			container: this.targetContainer,
			contexts: this.contextEntries
		});
	}
}

/** Performs the test component domain operation. */
export function testComponent<C extends ComponentFunction<any, any>>(
	component: C
): TestComponentBuilder<C> {
	return new TestComponentBuilder(component);
}

/** Configures mount test. */
export type MountTestOptions = TestConfiguration & {
	container?: Element;
	contexts?: Iterable<readonly [ContextToken<any>, unknown]>;
};

/** Performs the mount test domain operation. */
export async function mountTest(
	vnode: VNode,
	options: MountTestOptions = {}
): Promise<TestView<any, any>> {
	return mountVNode(vnode, options);
}

type InternalMountOptions = Omit<MountTestOptions, 'contexts'> & { contexts?: ContextEntry[] };

async function mountComponent<C extends ComponentFunction<any, any>>(
	component: C,
	props: PropsOf<C>,
	options: InternalMountOptions
): Promise<TestView<StateOf<C>, PropsOf<C>>> {
	const vnode = createVNode(component, props as Record<string, unknown>);
	const view = await mountVNode(vnode, options, component);
	return view as TestView<StateOf<C>, PropsOf<C>>;
}

type MountVNodeOptions = Omit<MountTestOptions, 'contexts'> & {
	contexts?: MountTestOptions['contexts'] | ContextEntry[];
};

async function mountVNode(
	vnode: VNode,
	options: MountVNodeOptions,
	targetType?: ComponentFunction<any, any>
): Promise<TestView<any, any>> {
	const container = options.container ?? document.createElement('div');
	if (inspectDomRoot(container))
		throw new Error('The test container already has a mounted eXact root');
	const attached = !options.container && options.attachToDocument !== false;
	if (attached) document.body.appendChild(container);
	const entries = normalizeContexts(options.contexts);
	const rendered = createVNode(TestMountHost, { entries }, vnode);
	const tracker = new TaskTracker();
	try {
		if (options.enhancementCatalog) await import('@exactjs/dom/framework/enhancements');
		withTaskObserver(tracker, () =>
			render(rendered, container, { enhancementCatalog: options.enhancementCatalog })
		);
		flushSync();
		const view = new TestView(
			container,
			tracker,
			{ timeout: options.timeout ?? 1_000, settleTasks: options.settleTasks ?? true },
			attached,
			targetType
		);
		if (options.settleTasks !== false) await view.settle();
		return view;
	} catch (error) {
		try {
			unmount(container);
		} catch (cleanup) {
			attachCleanupError(error, cleanup);
		}
		if (attached) container.remove();
		throw error;
	}
}

function normalizeContexts(
	input: MountTestOptions['contexts'] | ContextEntry[] | undefined
): ContextEntry[] {
	if (!input) return [];
	const values = Array.from(
		input as Iterable<ContextEntry | readonly [ContextToken<any>, unknown]>
	);
	return values.map((value) =>
		Array.isArray(value) ? { token: value[0], value: value[1] } : (value as ContextEntry)
	);
}

/** Performs the test mount host domain operation. */
export function TestMountHost(
	this: Component<{}>,
	props: { entries: ContextEntry[]; children?: Child | Child[] }
) {
	for (const entry of props.entries) this.setContext(entry.token, entry.value);
	return () => props.children;
}

markExactComponent(TestMountHost, '@exactjs/testing:TestMountHost');
