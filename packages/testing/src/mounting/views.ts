import {
	withTaskObserver,
	type ComponentFunction,
	type ComponentInstance,
	type ContextToken
} from '@exact/core';
import { unmount } from '@exact/dom';
import { inspectDomRoot, type DomInspectionNode } from '@exact/dom/testing';
import { flushSync, unwrap } from '@exact/reactive';

import type { ActionOptions, InternalConfiguration, PropsOf, StateOf } from '../contracts.js';
import { withTimeout } from '../control/settling.js';
import { QueryHost, TestElement, allElements, requireOne } from '../queries/host.js';
import { TestMountHost, type TaskTracker } from './mount.js';

export class TestView<State extends object = any, Props = any> extends QueryHost {
	readonly root: TestComponent<State, Props>;
	private disposed = false;

	constructor(
		readonly container: Element,
		private readonly tracker: TaskTracker,
		readonly configuration: InternalConfiguration,
		private readonly removeContainer: boolean,
		targetType?: ComponentFunction<any, any>
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

	snapshot(): DomInspectionNode {
		if (this.disposed) throw new Error('The test view has been unmounted');
		const root = inspectDomRoot(this.container);
		if (!root) throw new Error('The test view is not mounted');
		return root;
	}

	componentFor(instance: ComponentInstance<any>): TestComponent<any, any> {
		return new TestComponent(this, instance);
	}
	nodeFor(instance: ComponentInstance<any>): DomInspectionNode | undefined {
		if (this.disposed) return undefined;
		return componentNodes(this.snapshot()).find((node) => node.instance === instance);
	}
	component<C extends ComponentFunction<any, any>>(type: C): TestComponent<StateOf<C>, PropsOf<C>> {
		return this.root.find(type);
	}
	components<C extends ComponentFunction<any, any>>(
		type: C
	): TestComponent<StateOf<C>, PropsOf<C>>[] {
		return this.root.findAll(type);
	}

	async action(work: () => unknown, options: ActionOptions = {}): Promise<void> {
		this.snapshot();
		withTaskObserver(this.tracker, () => {
			work();
			flushSync();
		});
		if (options.settleTasks ?? this.configuration.settleTasks) await this.settle();
	}

	async flush(): Promise<void> {
		this.snapshot();
		flushSync();
		await Promise.resolve();
		flushSync();
	}

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

	unmount(): void {
		if (this.disposed) return;
		try {
			unmount(this.container);
		} finally {
			this.disposed = true;
			if (this.removeContainer) this.container.remove();
		}
	}

	protected ownerView(): TestView<any, any> {
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

export class TestComponent<State extends object = any, Props = any> extends QueryHost {
	constructor(
		readonly view: TestView<any, any>,
		readonly instance: ComponentInstance<State>
	) {
		super(
			() => componentElements(view, instance),
			async (work, options) => view.action(work, options)
		);
	}
	get name(): string {
		return this.instance.type.name || 'Anonymous';
	}
	get type(): ComponentFunction<State, Props> {
		return this.instance.type as ComponentFunction<State, Props>;
	}
	isMounted(): boolean {
		return !!this.view.nodeFor(this.instance) && this.instance.mounted;
	}
	state(): State {
		this.assertMounted();
		return this.instance.state as State;
	}
	props(): Props {
		this.assertMounted();
		return this.instance.props as Props;
	}
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
	context<T>(token: ContextToken<T>): T {
		this.assertMounted();
		return unwrap(this.instance.getContext(token)) as T;
	}
	providedContext<T>(token: ContextToken<T>): T | undefined {
		this.assertMounted();
		return unwrap(this.instance.contexts.get(token.id)) as T | undefined;
	}
	parent(): TestComponent<any, any> | undefined {
		this.assertMounted();
		const parent = this.instance.parent;
		return parent &&
			publicComponentNodes(this.view.snapshot()).some((node) => node.instance === parent)
			? this.view.componentFor(parent)
			: undefined;
	}
	children<C extends ComponentFunction<any, any>>(
		type?: C
	): TestComponent<StateOf<C>, PropsOf<C>>[] {
		const node = this.assertMounted();
		const values = directComponentChildren(node).filter(
			(child) => !type || child.instance?.type === type
		);
		return values.map((child) => this.view.componentFor(child.instance!));
	}
	child<C extends ComponentFunction<any, any>>(type: C): TestComponent<StateOf<C>, PropsOf<C>> {
		return requireOne(this.children(type), `direct child ${type.name || 'anonymous'}`);
	}
	find<C extends ComponentFunction<any, any>>(type: C): TestComponent<StateOf<C>, PropsOf<C>> {
		return requireOne(this.findAll(type), `descendant ${type.name || 'anonymous'}`);
	}
	findAll<C extends ComponentFunction<any, any>>(type: C): TestComponent<StateOf<C>, PropsOf<C>>[] {
		const node = this.assertMounted();
		return componentNodes(node)
			.slice(1)
			.filter((child) => child.instance?.type === type)
			.map((child) => this.view.componentFor(child.instance!));
	}
	elements(): readonly Element[] {
		return this.assertMounted().elements();
	}
	ownedElements(): readonly Element[] {
		return this.assertMounted().ownedElements();
	}
	async dispatch(type: string, init?: EventInit, options?: ActionOptions): Promise<this> {
		await uniqueRoot(this).dispatch(type, init, options);
		return this;
	}
	async click(options?: ActionOptions): Promise<this> {
		await uniqueRoot(this).click(options);
		return this;
	}
	protected ownerView(): TestView<any, any> {
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
function componentElements(view: TestView<any, any>, instance: ComponentInstance<any>): Element[] {
	const node = view.nodeFor(instance);
	if (!node) throw new Error(`Component ${instance.type.name || instance.id} is no longer mounted`);
	return [
		...new Set(
			node.elements().flatMap((element) => [element, ...Array.from(element.querySelectorAll('*'))])
		)
	];
}

function uniqueRoot(component: TestComponent<any, any>): TestElement {
	return new TestElement(
		component.view,
		requireOne([...component.elements()], `root element of ${component.name}`)
	);
}
