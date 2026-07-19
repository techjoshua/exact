import { findElementOwner } from '@exact/dom/testing';

import type { AccessibleName, ActionOptions, RoleQueryOptions } from '../contracts.js';
import type { TestComponent, TestView } from '../mounting/views.js';
import {
	accessibleName,
	isElementVisible,
	labelText,
	matchesName,
	minimalTextMatches,
	roleOf
} from './accessibility.js';
import { createEvent, setNativeValue, windowFor } from './events.js';

export abstract class QueryHost {
	constructor(
		private readonly candidates: () => Element[],
		private readonly runAction: (work: () => unknown, options?: ActionOptions) => Promise<void>
	) {}
	protected abstract ownerView(): TestView<any, any>;
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
		const view = this.ownerView();
		return elements.map((element) => new TestElement(view, element));
	}
	private one(elements: Element[], description: string): TestElement {
		return new TestElement(this.ownerView(), requireOne(elements, description));
	}
	private optional(elements: Element[], description: string): TestElement | undefined {
		if (elements.length > 1) requireOne(elements, description);
		return elements[0] ? new TestElement(this.ownerView(), elements[0]) : undefined;
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
	protected ownerView(): TestView<any, any> {
		return this.view;
	}
}

export type TestQuery = QueryHost;

export function allElements(container: Element): Element[] {
	return Array.from(container.querySelectorAll('*'));
}
export function assertElementLive(view: TestView<any, any>, element: Element): void {
	view.snapshot();
	if (element !== view.container && !view.container.contains(element))
		throw new Error('The test element is no longer mounted in this view');
}
export function elementCandidates(view: TestView<any, any>, element: Element): Element[] {
	assertElementLive(view, element);
	return [element, ...Array.from(element.querySelectorAll('*'))];
}

export function requireOne<T>(values: readonly T[], description: string): T {
	if (values.length !== 1)
		throw new Error(`Expected exactly one ${description}, found ${values.length}`);
	return values[0]!;
}
