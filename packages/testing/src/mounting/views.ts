import {
	withTaskObserver,
	type AnyComponentFunction,
	type AnyComponentInstance,
	type ComponentFunction,
	type ComponentInstance,
	type ContextToken
} from '@exactjs/core';
import { unmount } from '@exactjs/dom';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';
import { flushSync, unwrap } from '@exactjs/reactive';

import type { ActionOptions, InternalConfiguration, PropsOf, StateOf } from '../contracts.js';
import { withTimeout } from '../control/settling.js';
import { QueryHost, TestElement, allElements, requireOne } from '../queries/host.js';
import type { TestElementView } from '../queries/host.js';
import { TestMountHost, type TaskTracker } from './mount.js';

/** Defines the view capabilities required to inspect a live component instance. */
export type ComponentTestView = TestElementView & {
	nodeFor(instance: AnyComponentInstance): DomInspectionNode | undefined;
	componentFor(instance: AnyComponentInstance): AnyTestComponent;
	hasComponent(instance: AnyComponentInstance): boolean;
};

/** Defines the test view class contract. */
export class TestView<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An unparameterized test view intentionally exposes arbitrary authored component state.
	State extends object = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An unparameterized test view intentionally exposes arbitrary authored component props.
	Props = any
> extends QueryHost {
	readonly root: TestComponent<State, Props>;
	private disposed = false;

	constructor(
		readonly container: Element,
		private readonly tracker: TaskTracker,
		readonly configuration: InternalConfiguration,
		private readonly removeContainer: boolean,
		targetType?: AnyComponentFunction
	) {
		super(
			() => allElements(container),
			async (work, options) => this.action(work, options)
		);
		const snapshot = this.snapshot();
		const host = requireOne(
			componentNodes(snapshot).filter((node) => node.instance?.type === TestMountHost),
			'test mount host'
		);
		const target = targetType
			? requireOne(
					directComponentChildren(host).filter((node) => node.instance?.type === targetType),
					`root component ${targetType.name || 'anonymous'}`
				)
			: host;
		if (!target?.instance)
			throw new Error('The mounted tree does not contain a component instance');
		this.root = new TestComponent(this, target.instance);
	}

	/** Performs the snapshot domain operation for this test view instance. */
	snapshot(): DomInspectionNode {
		if (this.disposed) throw new Error('The test view has been unmounted');
		const root = inspectDomRoot(this.container);
		if (!root) throw new Error('The test view is not mounted');
		return root;
	}

	/** Performs the component for domain operation for this test view instance. */
	componentFor(instance: AnyComponentInstance): AnyTestComponent {
		return new TestComponent(this, instance);
	}
	/** Performs the node for domain operation for this test view instance. */
	nodeFor(instance: AnyComponentInstance): DomInspectionNode | undefined {
		if (this.disposed) return undefined;
		return componentNodes(this.snapshot()).find((node) => node.instance === instance);
	}
	/** Reports whether an application component remains mounted and visible to this test view. */
	hasComponent(instance: AnyComponentInstance): boolean {
		return (
			instance.type !== TestMountHost &&
			publicComponentNodes(this.snapshot()).some((node) => node.instance === instance)
		);
	}
	/** Performs the component domain operation for this test view instance. */
	component<C extends AnyComponentFunction>(type: C): TestComponent<StateOf<C>, PropsOf<C>> {
		return this.root.find(type);
	}
	/** Performs the components domain operation for this test view instance. */
	components<C extends AnyComponentFunction>(type: C): TestComponent<StateOf<C>, PropsOf<C>>[] {
		return this.root.findAll(type);
	}

	/** Performs the action domain operation for this test view instance. */
	async action(work: () => unknown, options: ActionOptions = {}): Promise<void> {
		this.snapshot();
		withTaskObserver(this.tracker, () => {
			work();
			flushSync();
		});
		if (options.settleTasks ?? this.configuration.settleTasks) await this.settle();
	}

	/** Performs the flush domain operation for this test view instance. */
	async flush(): Promise<void> {
		this.snapshot();
		flushSync();
		await Promise.resolve();
		flushSync();
	}

	/** Performs the settle domain operation for this test view instance. */
	async settle(): Promise<void> {
		this.snapshot();
		const deadline = Date.now() + this.configuration.timeout;
		while (this.tracker.pending.size) {
			const pending = [...this.tracker.pending.keys()];
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw this.timeoutError();
			await withTimeout(Promise.allSettled(pending), remaining, () => this.timeoutError());
			flushSync();
		}
		await Promise.resolve();
		flushSync();
	}

	/** Performs the unmount domain operation for this test view instance. */
	unmount(): void {
		if (this.disposed) return;
		try {
			unmount(this.container);
		} finally {
			this.disposed = true;
			if (this.removeContainer) this.container.remove();
		}
	}

	protected ownerView(): AnyTestView {
		return this;
	}

	private timeoutError(): Error {
		const names = [
			...new Set(
				[...this.tracker.pending.values()].map((instance) => instance.type.name || instance.id)
			)
		];
		return new Error(
			`Timed out settling eXact tasks after ${this.configuration.timeout}ms${names.length ? `; pending: ${names.join(', ')}` : ''}`
		);
	}
}

/** Defines the test component class contract. */
export class TestComponent<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An unparameterized test component intentionally exposes arbitrary authored component state.
	State extends object = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An unparameterized test component intentionally exposes arbitrary authored component props.
	Props = any
> extends QueryHost {
	constructor(
		readonly view: ComponentTestView,
		readonly instance: ComponentInstance<State>
	) {
		super(
			() => componentElements(view, instance),
			async (work, options) => view.action(work, options)
		);
	}
	/** Performs the name domain operation for this test component instance. */
	get name(): string {
		return this.instance.type.name || 'Anonymous';
	}
	/** Performs the type domain operation for this test component instance. */
	get type(): ComponentFunction<State, Props> {
		return this.instance.type as ComponentFunction<State, Props>;
	}
	/** Reports whether mounted for this test component instance. */
	isMounted(): boolean {
		return !!this.view.nodeFor(this.instance) && this.instance.mounted;
	}
	/** Performs the state domain operation for this test component instance. */
	state(): State {
		this.assertMounted();
		return this.instance.state as State;
	}
	/** Performs the props domain operation for this test component instance. */
	props(): Props {
		this.assertMounted();
		return this.instance.props as Props;
	}
	/** Applies a state to the owned runtime state for this test component instance. */
	async setState(
		update: Partial<State> | ((state: State) => void),
		options?: ActionOptions
	): Promise<this> {
		await this.view.action(
			() =>
				typeof update === 'function'
					? update(this.instance.state as State)
					: Object.assign(this.instance.state, update),
			options
		);
		return this;
	}
	/** Performs the context domain operation for this test component instance. */
	context<T>(token: ContextToken<T>): T {
		this.assertMounted();
		return unwrap(this.instance.getContext(token)) as T;
	}
	/** Performs the provided context domain operation for this test component instance. */
	providedContext<T>(token: ContextToken<T>): T | undefined {
		this.assertMounted();
		return unwrap(this.instance.contexts.get(token.id)) as T | undefined;
	}
	/** Performs the parent domain operation for this test component instance. */
	parent(): AnyTestComponent | undefined {
		this.assertMounted();
		const parent = this.instance.parent;
		return parent && this.view.hasComponent(parent) ? this.view.componentFor(parent) : undefined;
	}
	/** Performs the children domain operation for this test component instance. */
	children<C extends AnyComponentFunction>(type?: C): TestComponent<StateOf<C>, PropsOf<C>>[] {
		const node = this.assertMounted();
		const values = directComponentChildren(node).filter(
			(child) => !type || child.instance?.type === type
		);
		return values.map((child) => this.view.componentFor(child.instance!));
	}
	/** Performs the child domain operation for this test component instance. */
	child<C extends AnyComponentFunction>(type: C): TestComponent<StateOf<C>, PropsOf<C>> {
		return requireOne(this.children(type), `direct child ${type.name || 'anonymous'}`);
	}
	/** Resolves a find for this test component instance. */
	find<C extends AnyComponentFunction>(type: C): TestComponent<StateOf<C>, PropsOf<C>> {
		return requireOne(this.findAll(type), `descendant ${type.name || 'anonymous'}`);
	}
	/** Resolves an all for this test component instance. */
	findAll<C extends AnyComponentFunction>(type: C): TestComponent<StateOf<C>, PropsOf<C>>[] {
		const node = this.assertMounted();
		return componentNodes(node)
			.slice(1)
			.filter((child) => child.instance?.type === type)
			.map((child) => this.view.componentFor(child.instance!));
	}
	/** Performs the elements domain operation for this test component instance. */
	elements(): readonly Element[] {
		return this.assertMounted().elements();
	}
	/** Performs the owned elements domain operation for this test component instance. */
	ownedElements(): readonly Element[] {
		return this.assertMounted().ownedElements();
	}
	/** Performs the dispatch domain operation for this test component instance. */
	async dispatch(type: string, init?: EventInit, options?: ActionOptions): Promise<this> {
		await uniqueRoot(this).dispatch(type, init, options);
		return this;
	}
	/** Performs the click domain operation for this test component instance. */
	async click(options?: ActionOptions): Promise<this> {
		await uniqueRoot(this).click(options);
		return this;
	}
	protected ownerView(): ComponentTestView {
		return this.view;
	}
	private assertMounted(): DomInspectionNode {
		const node = this.view.nodeFor(this.instance);
		if (!node) throw new Error(`Component ${this.name} is no longer mounted`);
		return node;
	}
}

function componentNodes(root: DomInspectionNode): DomInspectionNode[] {
	return [root, ...root.children.flatMap(componentNodes)].filter((node) => !!node.instance);
}
function publicComponentNodes(root: DomInspectionNode): DomInspectionNode[] {
	return componentNodes(root)
		.slice(1)
		.filter((node) => node.instance?.type !== TestMountHost);
}
function directComponentChildren(root: DomInspectionNode): DomInspectionNode[] {
	const output: DomInspectionNode[] = [];
	for (const child of root.children) {
		if (child.instance) output.push(child);
		else output.push(...directComponentChildren(child));
	}
	return output;
}
function componentElements(view: ComponentTestView, instance: AnyComponentInstance): Element[] {
	const node = view.nodeFor(instance);
	if (!node) throw new Error(`Component ${instance.type.name || instance.id} is no longer mounted`);
	return [
		...new Set(
			node.elements().flatMap((element) => [element, ...Array.from(element.querySelectorAll('*'))])
		)
	];
}

function uniqueRoot(component: AnyTestComponent): TestElement {
	return new TestElement(
		component.view,
		requireOne([...component.elements()], `root element of ${component.name}`)
	);
}

/** Existential test view used when traversal preserves but does not inspect root state or props. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test traversal must accept views for every authored state and props shape.
export type AnyTestView = TestView<any, any>;

/** Existential test component used by heterogeneous tree traversal. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test traversal must accept components for every authored state and props shape.
type AnyTestComponent = TestComponent<any, any>;
