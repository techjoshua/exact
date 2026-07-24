import type { ComponentInstance } from '@exactjs/core';
import { findElementOwner } from '@exactjs/dom/testing';

import type { AccessibleName, ActionOptions, RoleQueryOptions } from '../contracts.js';
import type { TestComponent } from '../mounting/views.js';
import {
	accessibleName,
	isElementVisible,
	labelText,
	matchesName,
	minimalTextMatches,
	roleOf
} from './accessibility.js';
import { createEvent, setNativeValue, windowFor } from './events.js';

/** Defines the query host class contract. */
export abstract class QueryHost {
	constructor(
		private readonly candidates: () => Element[],
		private readonly runAction: (work: () => unknown, options?: ActionOptions) => Promise<void>
	) {}
	protected abstract ownerView(): TestElementView;
	/** Resolves a by selector for this query host instance. */
	getBySelector(selector: string): TestElement {
		return this.one(
			this.all().filter((element) => element.matches(selector)),
			`selector ${selector}`
		);
	}
	/** Performs the query by selector domain operation for this query host instance. */
	queryBySelector(selector: string): TestElement | undefined {
		return this.optional(
			this.all().filter((element) => element.matches(selector)),
			`selector ${selector}`
		);
	}
	/** Resolves an all by selector for this query host instance. */
	getAllBySelector(selector: string): TestElement[] {
		return this.wrap(this.all().filter((element) => element.matches(selector)));
	}
	/** Resolves a by role for this query host instance. */
	getByRole(role: string, options: RoleQueryOptions = {}): TestElement {
		return this.one(this.role(role, options), `role ${role}`);
	}
	/** Performs the query by role domain operation for this query host instance. */
	queryByRole(role: string, options: RoleQueryOptions = {}): TestElement | undefined {
		return this.optional(this.role(role, options), `role ${role}`);
	}
	/** Resolves an all by role for this query host instance. */
	getAllByRole(role: string, options: RoleQueryOptions = {}): TestElement[] {
		return this.wrap(this.role(role, options));
	}
	/** Resolves a by label text for this query host instance. */
	getByLabelText(text: AccessibleName): TestElement {
		return this.one(
			this.all().filter((element) => matchesName(labelText(element), text)),
			`label ${String(text)}`
		);
	}
	/** Performs the query by label text domain operation for this query host instance. */
	queryByLabelText(text: AccessibleName): TestElement | undefined {
		return this.optional(
			this.all().filter((element) => matchesName(labelText(element), text)),
			`label ${String(text)}`
		);
	}
	/** Resolves an all by label text for this query host instance. */
	getAllByLabelText(text: AccessibleName): TestElement[] {
		return this.wrap(this.all().filter((element) => matchesName(labelText(element), text)));
	}
	/** Resolves a by text for this query host instance. */
	getByText(text: AccessibleName): TestElement {
		return this.one(minimalTextMatches(this.all(), text), `text ${String(text)}`);
	}
	/** Performs the query by text domain operation for this query host instance. */
	queryByText(text: AccessibleName): TestElement | undefined {
		return this.optional(minimalTextMatches(this.all(), text), `text ${String(text)}`);
	}
	/** Resolves an all by text for this query host instance. */
	getAllByText(text: AccessibleName): TestElement[] {
		return this.wrap(minimalTextMatches(this.all(), text));
	}
	/** Resolves a by test id for this query host instance. */
	getByTestId(id: string): TestElement {
		return this.one(
			this.all().filter((element) => element.getAttribute('data-testid') === id),
			`test id ${id}`
		);
	}
	/** Performs the query by test id domain operation for this query host instance. */
	queryByTestId(id: string): TestElement | undefined {
		return this.optional(
			this.all().filter((element) => element.getAttribute('data-testid') === id),
			`test id ${id}`
		);
	}
	/** Resolves an all by test id for this query host instance. */
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

/** Defines the test element class contract. */
export class TestElement<E extends Element = Element> extends QueryHost {
	constructor(
		readonly view: TestElementView,
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
	/** Performs the text domain operation for this test element instance. */
	text(): string {
		this.assertLive();
		return this.element.textContent ?? '';
	}
	/** Performs the html domain operation for this test element instance. */
	html(): string {
		this.assertLive();
		return this.element.innerHTML;
	}
	/** Performs the attribute domain operation for this test element instance. */
	attribute(name: string): string | null {
		this.assertLive();
		return this.element.getAttribute(name);
	}
	/** Performs the property domain operation for this test element instance. */
	property<T = unknown>(name: string): T {
		this.assertLive();
		return (this.element as unknown as Record<string, T>)[name];
	}
	/** Performs the value domain operation for this test element instance. */
	value(): unknown {
		return this.property('value');
	}
	/** Performs the checked domain operation for this test element instance. */
	checked(): boolean {
		return Boolean(this.property('checked'));
	}
	/** Performs the disabled domain operation for this test element instance. */
	disabled(): boolean {
		return Boolean(this.property('disabled'));
	}
	/** Performs the focused domain operation for this test element instance. */
	focused(): boolean {
		this.assertLive();
		return this.element.ownerDocument.activeElement === this.element;
	}
	/** Performs the visible domain operation for this test element instance. */
	visible(): boolean {
		this.assertLive();
		return isElementVisible(this.element);
	}
	/** Performs the owner domain operation for this test element instance. */
	owner(): TestComponent<any, any> | undefined {
		this.assertLive();
		const owner = findElementOwner(this.element);
		return owner ? this.view.componentFor(owner) : undefined;
	}
	/** Performs the dispatch domain operation for this test element instance. */
	async dispatch(type: string, init: EventInit = {}, options?: ActionOptions): Promise<this> {
		await this.view.action(
			() => this.element.dispatchEvent(createEvent(this.element, type, init)),
			options
		);
		return this;
	}
	/** Performs the click domain operation for this test element instance. */
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
	/** Performs the input domain operation for this test element instance. */
	async input(value: unknown, options?: ActionOptions): Promise<this> {
		setNativeValue(this.element, value);
		return this.dispatch('input', { bubbles: true, cancelable: true }, options);
	}
	/** Performs the change domain operation for this test element instance. */
	async change(value: unknown, options?: ActionOptions): Promise<this> {
		setNativeValue(this.element, value);
		return this.dispatch('change', { bubbles: true, cancelable: true }, options);
	}
	/** Performs the submit domain operation for this test element instance. */
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
	/** Performs the focus domain operation for this test element instance. */
	async focus(options?: ActionOptions): Promise<this> {
		await this.view.action(() => (this.element as unknown as HTMLElement).focus(), options);
		return this;
	}
	/** Performs the blur domain operation for this test element instance. */
	async blur(options?: ActionOptions): Promise<this> {
		await this.view.action(() => (this.element as unknown as HTMLElement).blur(), options);
		return this;
	}
	/** Performs the key down domain operation for this test element instance. */
	async keyDown(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		return this.keyboard('keydown', key, init, options);
	}
	/** Performs the key up domain operation for this test element instance. */
	async keyUp(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		return this.keyboard('keyup', key, init, options);
	}
	/** Performs the key domain operation for this test element instance. */
	async key(key: string, init: KeyboardEventInit = {}, options?: ActionOptions): Promise<this> {
		return this.keyDown(key, init, options);
	}
	/** Performs the press domain operation for this test element instance. */
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
	protected ownerView(): TestElementView {
		return this.view;
	}
}

/** Defines the test query type contract. */
export type TestQuery = QueryHost;
/** Defines the view surface required by element queries and interactions. */
export type TestElementView = {
	readonly container: Element;
	snapshot(): unknown;
	action(work: () => unknown, options?: ActionOptions): Promise<void>;
	componentFor(instance: ComponentInstance<any>): TestComponent<any, any>;
};

/** Performs the all elements domain operation. */
export function allElements(container: Element): Element[] {
	return Array.from(container.querySelectorAll('*'));
}
/** Validates element live and throws when the contract is violated. */
export function assertElementLive(view: TestElementView, element: Element): void {
	view.snapshot();
	if (element !== view.container && !view.container.contains(element))
		throw new Error('The test element is no longer mounted in this view');
}
/** Performs the element candidates domain operation. */
export function elementCandidates(view: TestElementView, element: Element): Element[] {
	assertElementLive(view, element);
	return [element, ...Array.from(element.querySelectorAll('*'))];
}

/** Validates one and throws when the contract is violated. */
export function requireOne<T>(values: readonly T[], description: string): T {
	if (values.length !== 1)
		throw new Error(`Expected exactly one ${description}, found ${values.length}`);
	return values[0]!;
}
