import {
	createVNode,
	withTaskObserver,
	type Child,
	type Component,
	type ComponentFunction,
	type ComponentInstance,
	type ContextToken,
	type TaskObserver,
	type VNode
} from '@exact/core';
import { render, unmount } from '@exact/dom';
import { findElementOwner, inspectDomRoot, type DomInspectionNode } from '@exact/dom/testing';
import { flushSync, unwrap } from '@exact/reactive';

export type StateOf<C> = C extends ComponentFunction<infer State, any> ? State : never;
export type PropsOf<C> = C extends ComponentFunction<any, infer Props> ? Props : never;
export type TestConfiguration = {
	timeout?: number;
	settleTasks?: boolean;
	attachToDocument?: boolean;
};
export type ActionOptions = { settleTasks?: boolean };
export type AccessibleName = string | RegExp;
export type RoleQueryOptions = { name?: AccessibleName };

type ContextEntry = { token: ContextToken<any>; value: unknown };

class TaskTracker implements TaskObserver {
	readonly pending = new Map<Promise<unknown>, ComponentInstance<any>>();
	register(promise: Promise<unknown>, instance: ComponentInstance<any>): void {
		this.pending.set(promise, instance);
		void promise.then(
			() => this.pending.delete(promise),
			() => this.pending.delete(promise)
		);
	}
	retain(): void {}
}

export class TestComponentBuilder<C extends ComponentFunction<any, any>> {
	private componentProps = {} as PropsOf<C>;
	private contextEntries: ContextEntry[] = [];
	private targetContainer?: Element;
	private configuration: TestConfiguration = {};

	constructor(readonly component: C) {}
	props(props: PropsOf<C>): this {
		this.componentProps = props;
		return this;
	}
	context<T>(token: ContextToken<T>, value: T): this {
		this.contextEntries.push({ token, value });
		return this;
	}
	contexts(entries: Iterable<readonly [ContextToken<any>, unknown]>): this {
		for (const [token, value] of entries) this.contextEntries.push({ token, value });
		return this;
	}
	container(container: Element): this {
		this.targetContainer = container;
		return this;
	}
	configure(configuration: TestConfiguration): this {
		this.configuration = { ...this.configuration, ...configuration };
		return this;
	}
	async mount(): Promise<TestView<StateOf<C>, PropsOf<C>>> {
		return mountComponent(this.component, this.componentProps, {
			...this.configuration,
			container: this.targetContainer,
			contexts: this.contextEntries
		});
	}
}

export function testComponent<C extends ComponentFunction<any, any>>(
	component: C
): TestComponentBuilder<C> {
	return new TestComponentBuilder(component);
}

export type MountTestOptions = TestConfiguration & {
	container?: Element;
	contexts?: Iterable<readonly [ContextToken<any>, unknown]>;
};

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
		withTaskObserver(tracker, () => render(rendered, container));
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

function TestMountHost(
	this: Component<{}>,
	props: { entries: ContextEntry[]; children?: Child | Child[] }
) {
	for (const entry of props.entries) this.setContext(entry.token, entry.value);
	return () => props.children;
}

type InternalConfiguration = Required<Pick<TestConfiguration, 'timeout' | 'settleTasks'>>;

export class QueryHost {
	constructor(
		private readonly candidates: () => Element[],
		private readonly runAction: (work: () => unknown, options?: ActionOptions) => Promise<void>
	) {}
	getBySelector(selector: string): TestElement {
		return this.one(
			this.all().filter((element) => element.matches(selector)),
			`selector ${selector}`
		);
	}
	queryBySelector(selector: string): TestElement | undefined {
		return this.optional(
			this.all().filter((element) => element.matches(selector)),
			`selector ${selector}`
		);
	}
	getAllBySelector(selector: string): TestElement[] {
		return this.wrap(this.all().filter((element) => element.matches(selector)));
	}
	getByRole(role: string, options: RoleQueryOptions = {}): TestElement {
		return this.one(this.role(role, options), `role ${role}`);
	}
	queryByRole(role: string, options: RoleQueryOptions = {}): TestElement | undefined {
		return this.optional(this.role(role, options), `role ${role}`);
	}
	getAllByRole(role: string, options: RoleQueryOptions = {}): TestElement[] {
		return this.wrap(this.role(role, options));
	}
	getByLabelText(text: AccessibleName): TestElement {
		return this.one(
			this.all().filter((element) => matchesName(labelText(element), text)),
			`label ${String(text)}`
		);
	}
	queryByLabelText(text: AccessibleName): TestElement | undefined {
		return this.optional(
			this.all().filter((element) => matchesName(labelText(element), text)),
			`label ${String(text)}`
		);
	}
	getAllByLabelText(text: AccessibleName): TestElement[] {
		return this.wrap(this.all().filter((element) => matchesName(labelText(element), text)));
	}
	getByText(text: AccessibleName): TestElement {
		return this.one(minimalTextMatches(this.all(), text), `text ${String(text)}`);
	}
	queryByText(text: AccessibleName): TestElement | undefined {
		return this.optional(minimalTextMatches(this.all(), text), `text ${String(text)}`);
	}
	getAllByText(text: AccessibleName): TestElement[] {
		return this.wrap(minimalTextMatches(this.all(), text));
	}
	getByTestId(id: string): TestElement {
		return this.one(
			this.all().filter((element) => element.getAttribute('data-testid') === id),
			`test id ${id}`
		);
	}
	queryByTestId(id: string): TestElement | undefined {
		return this.optional(
			this.all().filter((element) => element.getAttribute('data-testid') === id),
			`test id ${id}`
		);
	}
	getAllByTestId(id: string): TestElement[] {
		return this.wrap(this.all().filter((element) => element.getAttribute('data-testid') === id));
	}
	protected async action(work: () => unknown, options?: ActionOptions): Promise<void> {
		return this.runAction(work, options);
	}
	private all(): Element[] {
		return [...new Set(this.candidates())];
	}
	private role(role: string, options: RoleQueryOptions): Element[] {
		return this.all().filter(
			(element) =>
				isElementVisible(element) &&
				roleOf(element) === role &&
				(!options.name || matchesName(accessibleName(element), options.name))
		);
	}
	private wrap(elements: Element[]): TestElement[] {
		const view = viewFrom(this);
		return elements.map((element) => new TestElement(view, element));
	}
	private one(elements: Element[], description: string): TestElement {
		return new TestElement(viewFrom(this), requireOne(elements, description));
	}
	private optional(elements: Element[], description: string): TestElement | undefined {
		if (elements.length > 1) requireOne(elements, description);
		return elements[0] ? new TestElement(viewFrom(this), elements[0]) : undefined;
	}
}

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
	private assertMounted(): DomInspectionNode {
		const node = this.view.nodeFor(this.instance);
		if (!node) throw new Error(`Component ${this.name} is no longer mounted`);
		return node;
	}
}

export class TestElement<E extends Element = Element> extends QueryHost {
	constructor(
		readonly view: TestView<any, any>,
		readonly element: E
	) {
		super(
			() => elementCandidates(view, element),
			async (work, options) =>
				view.action(() => {
					assertElementLive(view, element);
					return work();
				}, options)
		);
	}
	text(): string {
		this.assertLive();
		return this.element.textContent ?? '';
	}
	html(): string {
		this.assertLive();
		return this.element.innerHTML;
	}
	attribute(name: string): string | null {
		this.assertLive();
		return this.element.getAttribute(name);
	}
	property<T = unknown>(name: string): T {
		this.assertLive();
		return (this.element as unknown as Record<string, T>)[name];
	}
	value(): unknown {
		return this.property('value');
	}
	checked(): boolean {
		return Boolean(this.property('checked'));
	}
	disabled(): boolean {
		return Boolean(this.property('disabled'));
	}
	focused(): boolean {
		this.assertLive();
		return this.element.ownerDocument.activeElement === this.element;
	}
	visible(): boolean {
		this.assertLive();
		return isElementVisible(this.element);
	}
	owner(): TestComponent<any, any> | undefined {
		this.assertLive();
		const owner = findElementOwner(this.element);
		return owner ? this.view.componentFor(owner) : undefined;
	}
	async dispatch(type: string, init: EventInit = {}, options?: ActionOptions): Promise<this> {
		await this.view.action(
			() => this.element.dispatchEvent(createEvent(this.element, type, init)),
			options
		);
		return this;
	}
	async click(options?: ActionOptions): Promise<this> {
		await this.view.action(() => {
			const clickable = this.element as unknown as { click?: () => void };
			if (typeof clickable.click === 'function') clickable.click();
			else
				this.element.dispatchEvent(
					createEvent(this.element, 'click', { bubbles: true, cancelable: true })
				);
		}, options);
		return this;
	}
	async input(value: unknown, options?: ActionOptions): Promise<this> {
		setNativeValue(this.element, value);
		return this.dispatch('input', { bubbles: true, cancelable: true }, options);
	}
	async change(value: unknown, options?: ActionOptions): Promise<this> {
		setNativeValue(this.element, value);
		return this.dispatch('change', { bubbles: true, cancelable: true }, options);
	}
	async submit(options?: ActionOptions): Promise<this> {
		const form = this.element.matches('form')
			? (this.element as unknown as HTMLFormElement)
			: this.element.closest('form');
		if (!form) throw new Error('submit() requires a form or an element inside a form');
		await this.view.action(() => {
			const submitter =
				this.element.matches('button') ||
				(this.element.matches('input') &&
					['submit', 'image'].includes((this.element as unknown as HTMLInputElement).type))
					? (this.element as unknown as HTMLButtonElement | HTMLInputElement)
					: undefined;
			if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter);
			else
				form.dispatchEvent(
					createEvent(form, 'submit', {
						bubbles: true,
						cancelable: true,
						submitter
					} as SubmitEventInit)
				);
		}, options);
		return this;
	}
	async focus(options?: ActionOptions): Promise<this> {
		await this.view.action(() => (this.element as unknown as HTMLElement).focus(), options);
		return this;
	}
	async blur(options?: ActionOptions): Promise<this> {
		await this.view.action(() => (this.element as unknown as HTMLElement).blur(), options);
		return this;
	}
	async keyDown(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		return this.keyboard('keydown', key, init, options);
	}
	async keyUp(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		return this.keyboard('keyup', key, init, options);
	}
	async key(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		return this.keyDown(key, init, options);
	}
	async press(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		await this.view.action(() => {
			const EventType = windowFor(this.element).KeyboardEvent;
			this.element.dispatchEvent(
				new EventType('keydown', { bubbles: true, cancelable: true, key, ...init })
			);
			this.element.dispatchEvent(
				new EventType('keyup', { bubbles: true, cancelable: true, key, ...init })
			);
		}, options);
		return this;
	}
	private async keyboard(
		type: 'keydown' | 'keyup',
		key: string,
		init: KeyboardEventInit,
		options?: ActionOptions
	): Promise<this> {
		await this.view.action(
			() =>
				this.element.dispatchEvent(
					new (windowFor(this.element).KeyboardEvent)(type, {
						bubbles: true,
						cancelable: true,
						key,
						...init
					})
				),
			options
		);
		return this;
	}
	private assertLive(): void {
		assertElementLive(this.view, this.element);
	}
}

export type TestQuery = QueryHost;

function viewFrom(host: QueryHost): TestView<any, any> {
	if (host instanceof TestView) return host;
	if (host instanceof TestComponent || host instanceof TestElement) return host.view;
	throw new Error('Detached TestQuery instances cannot create element handles');
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
function allElements(container: Element): Element[] {
	return Array.from(container.querySelectorAll('*'));
}
function assertElementLive(view: TestView<any, any>, element: Element): void {
	view.snapshot();
	if (element !== view.container && !view.container.contains(element))
		throw new Error('The test element is no longer mounted in this view');
}
function elementCandidates(view: TestView<any, any>, element: Element): Element[] {
	assertElementLive(view, element);
	return [element, ...Array.from(element.querySelectorAll('*'))];
}
function uniqueRoot(component: TestComponent<any, any>): TestElement {
	return new TestElement(
		component.view,
		requireOne([...component.elements()], `root element of ${component.name}`)
	);
}
function requireOne<T>(values: readonly T[], description: string): T {
	if (values.length !== 1)
		throw new Error(`Expected exactly one ${description}, found ${values.length}`);
	return values[0]!;
}

function windowFor(element: Element): Window & typeof globalThis {
	return element.ownerDocument.defaultView as unknown as Window & typeof globalThis;
}
function createEvent(element: Element, type: string, init: EventInit): Event {
	const view = windowFor(element);
	if (type === 'click') return new view.MouseEvent(type, init as MouseEventInit);
	if (type === 'input') return new view.InputEvent(type, init as InputEventInit);
	if (type === 'submit' && view.SubmitEvent)
		return new view.SubmitEvent(type, init as SubmitEventInit);
	if (type === 'focus' || type === 'blur') return new view.FocusEvent(type, init as FocusEventInit);
	return new view.Event(type, init);
}
function setNativeValue(element: Element, value: unknown): void {
	if (
		element.matches('input') &&
		['checkbox', 'radio'].includes((element as HTMLInputElement).type)
	)
		(element as HTMLInputElement).checked = Boolean(value);
	else if ('value' in element)
		(element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(
			value ?? ''
		);
	else throw new Error('input() and change() require a form control');
}

function roleOf(element: Element): string | undefined {
	const explicit = element.getAttribute('role');
	if (explicit) return explicit.split(/\s+/)[0];
	const tag = element.tagName.toLowerCase();
	if (tag === 'button') return 'button';
	if (tag === 'a' && element.hasAttribute('href')) return 'link';
	if (/^h[1-6]$/.test(tag)) return 'heading';
	if (tag === 'img' && element.getAttribute('alt') !== '') return 'img';
	if (tag === 'ul' || tag === 'ol') return 'list';
	if (tag === 'li') return 'listitem';
	if (tag === 'nav') return 'navigation';
	if (tag === 'main') return 'main';
	if (tag === 'table') return 'table';
	if (tag === 'tr') return 'row';
	if (tag === 'th') return 'columnheader';
	if (tag === 'td') return 'cell';
	if (tag === 'textarea') return 'textbox';
	if (tag === 'select') return (element as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
	if (tag === 'form')
		return element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')
			? 'form'
			: undefined;
	if (tag === 'input') {
		const type = (element.getAttribute('type') ?? 'text').toLowerCase();
		if (['button', 'submit', 'reset'].includes(type)) return 'button';
		if (type === 'checkbox') return 'checkbox';
		if (type === 'radio') return 'radio';
		if (type === 'range') return 'slider';
		if (type === 'number') return 'spinbutton';
		if (!['hidden', 'file', 'color'].includes(type)) return 'textbox';
	}
	return undefined;
}
function accessibleName(element: Element): string {
	const labelledBy = element.getAttribute('aria-labelledby');
	if (labelledBy)
		return labelledBy
			.split(/\s+/)
			.map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
			.join(' ')
			.trim();
	return (
		element.getAttribute('aria-label') ??
		labelText(element) ??
		(element.matches('input')
			? (element as HTMLInputElement).value
			: (element.textContent?.trim() ?? ''))
	);
}
function labelText(element: Element): string | undefined {
	if (!element.matches('input, textarea, select')) return undefined;
	return (
		Array.from((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels ?? [])
			.map((label) => label.textContent?.trim() ?? '')
			.join(' ')
			.trim() || undefined
	);
}
function matchesName(actual: string | undefined, expected: AccessibleName): boolean {
	if (typeof expected === 'string') return actual?.trim() === expected;
	expected.lastIndex = 0;
	return expected.test(actual ?? '');
}
function minimalTextMatches(elements: Element[], text: AccessibleName): Element[] {
	return elements.filter(
		(element) =>
			isElementVisible(element) &&
			matchesName(element.textContent?.trim(), text) &&
			!Array.from(element.children).some((child) => matchesName(child.textContent?.trim(), text))
	);
}
function isElementVisible(element: Element): boolean {
	for (let cursor: Element | null = element; cursor; cursor = cursor.parentElement) {
		const style = (cursor as unknown as HTMLElement).style;
		if (
			cursor.hasAttribute('hidden') ||
			cursor.getAttribute('aria-hidden') === 'true' ||
			style?.display === 'none' ||
			style?.visibility === 'hidden'
		)
			return false;
		const computed = cursor.ownerDocument.defaultView?.getComputedStyle(cursor);
		if (
			computed?.display === 'none' ||
			computed?.visibility === 'hidden' ||
			computed?.visibility === 'collapse'
		)
			return false;
	}
	return true;
}

export type MatcherResult = { pass: boolean; message(): string };
export interface ExactMatcherDeclarations<R = void> {
	toBeMounted(): R;
	toHaveState(expected: object): R;
	toHaveProps(expected: object): R;
	toHaveContext(token: ContextToken<unknown>, expected: unknown): R;
	toContainComponent(type: ComponentFunction<any, any>): R;
	toHaveText(expected: AccessibleName): R;
	toHaveAttribute(name: string, expected?: string): R;
	toHaveValue(expected: unknown): R;
	toBeChecked(): R;
	toBeDisabled(): R;
	toHaveFocus(): R;
}
export type ExpectLike = {
	extend(
		matchers: Record<string, (received: unknown, ...expected: unknown[]) => MatcherResult>
	): void;
};
const result = (pass: boolean, positive: string, negative: string): MatcherResult => ({
	pass,
	message: () => (pass ? negative : positive)
});
const componentValue = (value: unknown): TestComponent<any, any> | undefined =>
	value instanceof TestComponent ? value : undefined;
const elementValue = (value: unknown): Element | undefined =>
	value instanceof TestElement
		? value.element
		: !!value && typeof value === 'object' && (value as Node).nodeType === 1
			? (value as Element)
			: undefined;

export const exactMatchers = {
	toBeMounted(received: unknown) {
		const pass =
			componentValue(received)?.isMounted() ??
			(received instanceof TestElement
				? (received.owner()?.isMounted() ?? !!received.element.parentNode)
				: !!elementValue(received)?.isConnected);
		return result(pass, 'Expected value to be mounted', 'Expected value not to be mounted');
	},
	toHaveState(received: unknown, expected: object) {
		const actual = componentValue(received)?.state();
		const pass = !!actual && subset(actual, expected);
		return result(
			pass,
			`Expected component state to contain ${JSON.stringify(expected)}`,
			'Expected component state not to match'
		);
	},
	toHaveProps(received: unknown, expected: object) {
		const actual = componentValue(received)?.props();
		const pass = !!actual && subset(actual as object, expected);
		return result(
			pass,
			`Expected component props to contain ${JSON.stringify(expected)}`,
			'Expected component props not to match'
		);
	},
	toHaveContext(received: unknown, token: ContextToken<unknown>, expected: unknown) {
		let actual: unknown;
		try {
			actual = componentValue(received)?.context(token);
		} catch {}
		const pass = Object.is(actual, expected);
		return result(
			pass,
			`Expected context ${token.description} to match`,
			`Expected context ${token.description} not to match`
		);
	},
	toContainComponent(received: unknown, type: ComponentFunction<any, any>) {
		const pass = (componentValue(received)?.findAll(type).length ?? 0) > 0;
		return result(
			pass,
			`Expected component to contain ${type.name}`,
			`Expected component not to contain ${type.name}`
		);
	},
	toHaveText(received: unknown, expected: AccessibleName) {
		const actual =
			elementValue(received)?.textContent?.trim() ??
			componentValue(received)
				?.elements()
				.map((value) => value.textContent)
				.join(' ')
				.trim();
		const pass = matchesName(actual, expected);
		return result(
			pass,
			`Expected text ${String(expected)}, received ${actual}`,
			`Expected text not to match ${String(expected)}`
		);
	},
	toHaveAttribute(received: unknown, name: string, expected?: string) {
		const element = elementValue(received);
		const pass =
			!!element?.hasAttribute(name) &&
			(expected === undefined || element.getAttribute(name) === expected);
		return result(
			pass,
			`Expected attribute ${name}${expected === undefined ? '' : `=${expected}`}`,
			`Expected attribute ${name} not to match`
		);
	},
	toHaveValue(received: unknown, expected: unknown) {
		const pass = Object.is(
			(elementValue(received) as HTMLInputElement | undefined)?.value,
			expected
		);
		return result(
			pass,
			`Expected value ${String(expected)}`,
			`Expected value not to be ${String(expected)}`
		);
	},
	toBeChecked(received: unknown) {
		const pass = Boolean((elementValue(received) as HTMLInputElement | undefined)?.checked);
		return result(pass, 'Expected element to be checked', 'Expected element not to be checked');
	},
	toBeDisabled(received: unknown) {
		const pass = Boolean((elementValue(received) as HTMLButtonElement | undefined)?.disabled);
		return result(pass, 'Expected element to be disabled', 'Expected element not to be disabled');
	},
	toHaveFocus(received: unknown) {
		const element = elementValue(received);
		const pass = !!element && element.ownerDocument.activeElement === element;
		return result(pass, 'Expected element to have focus', 'Expected element not to have focus');
	}
};

export function installExactMatchers(expect: ExpectLike): void {
	expect.extend(
		exactMatchers as unknown as Record<
			string,
			(received: unknown, ...expected: unknown[]) => MatcherResult
		>
	);
}
function subset(actual: object, expected: object): boolean {
	return Object.entries(expected).every(([key, value]) =>
		Object.is((actual as Record<string, unknown>)[key], value)
	);
}
function withTimeout<T>(promise: Promise<T>, timeout: number, error: () => Error): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(error()), timeout);
		void promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(cause) => {
				clearTimeout(timer);
				reject(cause);
			}
		);
	});
}
function attachCleanupError(primary: unknown, cleanup: unknown): void {
	if (!primary || (typeof primary !== 'object' && typeof primary !== 'function')) return;
	try {
		Object.defineProperty(primary, 'cleanupError', { configurable: true, value: cleanup });
	} catch {}
}
