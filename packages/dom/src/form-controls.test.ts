/**
 * @vitest-environment jsdom
 */
import { createCompiledVNode, createExpression, type Component } from '@exactjs/core';
import { jsx } from '@exactjs/jsx';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';

describe('@exactjs/dom form-controls', () => {
	it('does not rewrite a control value after its binding copies the browser value to state', () => {
		function BoundInput(this: Component<{ name: string }>) {
			this.state.name = 'before';
			return () =>
				createCompiledVNode('input', {
					value: createExpression(() => this.state.name),
					__exactBindInput: (event: Event) => {
						this.state.name = (event.currentTarget as HTMLInputElement).value;
					}
				});
		}
		const container = document.createElement('div');
		render(jsx(BoundInput, {}), container);
		const input = container.querySelector('input')!;
		const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
		const writes: string[] = [];
		Object.defineProperty(input, 'value', {
			get() {
				return descriptor.get!.call(this);
			},
			set(value: string) {
				writes.push(value);
				descriptor.set!.call(this, value);
			},
			configurable: true
		});

		descriptor.set!.call(input, 'after');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(writes).toEqual([]);
	});

	it('projects Date and multiple-select reactive values through their native control APIs', () => {
		let instance!: Component<{ date: Date | null; tags: string[] }>;
		function BoundControls(this: Component<{ date: Date | null; tags: string[] }>) {
			instance = this;
			this.state.date = new Date('2026-07-23T00:00:00.000Z');
			this.state.tags = ['a', 'c'];
			return () =>
				jsx('section', {
					children: [
						jsx('input', {
							type: 'date',
							value: createExpression(() => this.state.date)
						}),
						jsx('select', {
							multiple: true,
							value: createExpression(() => this.state.tags),
							children: ['a', 'b', 'c'].map((value) => jsx('option', { value, children: value }))
						})
					]
				});
		}
		const container = document.createElement('div');
		render(jsx(BoundControls, {}), container);
		const input = container.querySelector('input')!;
		const select = container.querySelector('select')!;
		expect(input.value).toBe('2026-07-23');
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['a', 'c']);

		instance.state.date = null;
		instance.state.tags = ['b'];
		flushSync();
		expect(input.value).toBe('');
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['b']);
	});

	it('applies select value after options are mounted and can return to the first option', () => {
		let instance!: Component<{ status: 'todo' | 'doing' | 'done' }>;

		function StatusSelect(this: Component<{ status: 'todo' | 'doing' | 'done' }>) {
			instance = this;
			this.state.status = 'done';

			return () =>
				jsx('select', {
					value: this.state.status,
					children: [
						jsx('option', { value: 'todo', children: 'To do' }),
						jsx('option', { value: 'doing', children: 'Doing' }),
						jsx('option', { value: 'done', children: 'Done' })
					]
				});
		}

		const container = document.createElement('div');
		render(jsx(StatusSelect, {}), container);
		const select = container.querySelector('select')!;

		expect(select.value).toBe('done');

		instance.state.status = 'todo';
		flushSync();

		expect(select.value).toBe('todo');
	});

	it('does not rewrite unchanged select and option values during rerender', () => {
		let instance!: Component<{ label: string; status: 'todo' | 'doing' | 'done' }>;

		function StatusSelect(this: Component<{ label: string; status: 'todo' | 'doing' | 'done' }>) {
			instance = this;
			this.state.label = 'Ready';
			this.state.status = 'todo';

			return () =>
				jsx('label', {
					children: [
						jsx('span', { children: this.state.label }),
						jsx('select', {
							value: this.state.status,
							children: [
								jsx('option', { value: 'todo', children: 'To do' }),
								jsx('option', { value: 'doing', children: 'Doing' }),
								jsx('option', { value: 'done', children: 'Done' })
							]
						})
					]
				});
		}

		const container = document.createElement('div');
		render(jsx(StatusSelect, {}), container);
		const select = container.querySelector('select')!;
		const options = Array.from(container.querySelectorAll('option'));
		const selectWrites: string[] = [];
		const optionWrites: string[] = [];
		const selectDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
		const optionDescriptor = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'value')!;

		Object.defineProperty(select, 'value', {
			get() {
				return selectDescriptor.get!.call(this);
			},
			set(value: string) {
				selectWrites.push(value);
				selectDescriptor.set!.call(this, value);
			},
			configurable: true
		});

		for (const option of options) {
			Object.defineProperty(option, 'value', {
				get() {
					return optionDescriptor.get!.call(this);
				},
				set(value: string) {
					optionWrites.push(value);
					optionDescriptor.set!.call(this, value);
				},
				configurable: true
			});
		}

		instance.state.label = 'Updated';
		flushSync();

		expect(select.value).toBe('todo');
		expect(Array.from(container.querySelectorAll('option'))).toEqual(options);
		expect(selectWrites).toEqual([]);
		expect(optionWrites).toEqual([]);
	});

	it('keeps focused textarea stable while input updates reactive state', () => {
		let instance!: Component<{ notes: string }>;

		function Notes(this: Component<{ notes: string }>) {
			instance = this;
			this.state.notes = 'Initial';

			return () =>
				jsx('textarea', {
					value: this.state.notes,
					onInput: (event: Event) => {
						this.state.notes = (event.target as HTMLTextAreaElement).value;
					}
				});
		}

		const container = document.createElement('div');
		document.body.appendChild(container);
		render(jsx(Notes, {}), container);
		const textarea = container.querySelector('textarea')!;
		const valueWrites: string[] = [];
		const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
		Object.defineProperty(textarea, 'value', {
			get() {
				return descriptor.get!.call(this);
			},
			set(value: string) {
				valueWrites.push(value);
				descriptor.set!.call(this, value);
			},
			configurable: true
		});

		textarea.value = 'Initial!';
		textarea.focus();
		valueWrites.length = 0;
		textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
		flushSync();

		expect(instance.state.notes).toBe('Initial!');
		expect(container.querySelector('textarea')).toBe(textarea);
		expect(valueWrites).toEqual([]);
		expect(document.activeElement).toBe(textarea);
		container.remove();
	});

	it('does not rewrite defaultValue on a focused text control', () => {
		let instance!: Component<{ title: string }>;

		function Editor(this: Component<{ title: string }>) {
			instance = this;
			this.state.title = 'Initial';

			return () =>
				jsx('input', {
					defaultValue: this.state.title,
					onInput: (event: Event) => {
						this.state.title = (event.target as HTMLInputElement).value;
					}
				});
		}

		const container = document.createElement('div');
		document.body.appendChild(container);
		render(jsx(Editor, {}), container);
		const input = container.querySelector('input')!;
		const defaultValueWrites: string[] = [];
		const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'defaultValue')!;
		Object.defineProperty(input, 'defaultValue', {
			get() {
				return descriptor.get!.call(this);
			},
			set(value: string) {
				defaultValueWrites.push(value);
				descriptor.set!.call(this, value);
			},
			configurable: true
		});

		input.value = 'Initial!';
		input.focus();
		defaultValueWrites.length = 0;
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		flushSync();

		expect(instance.state.title).toBe('Initial!');
		expect(container.querySelector('input')).toBe(input);
		expect(defaultValueWrites).toEqual([]);
		expect(document.activeElement).toBe(input);
		container.remove();
	});

	it('keeps compiled textarea stable when a reactive object prop is replaced during input', () => {
		let parent!: Component<{ task: { id: string; notes: string } }>;

		function Editor(
			this: Component<{}>,
			props: {
				task: { id: string; notes: string };
				update(id: string, notes: string): void;
			}
		) {
			return () => {
				const task = props.task;
				return createCompiledVNode('textarea', {
					value: createExpression(() => task.notes),
					onInput: (event: Event) => {
						props.update(task.id, (event.target as HTMLTextAreaElement).value);
					}
				});
			};
		}

		function Parent(this: Component<{ task: { id: string; notes: string } }>) {
			parent = this;
			this.state.task = { id: 'a', notes: 'Initial' };
			return () =>
				createCompiledVNode(Editor, {
					task: createExpression(() => this.state.task),
					update: (id: string, notes: string) => {
						this.state.task = { id, notes };
					}
				});
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);
		const textarea = container.querySelector('textarea')!;
		const insertBefore = vi.spyOn(Node.prototype, 'insertBefore');
		const valueWrites: string[] = [];
		const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
		Object.defineProperty(textarea, 'value', {
			get() {
				return descriptor.get!.call(this);
			},
			set(value: string) {
				valueWrites.push(value);
				descriptor.set!.call(this, value);
			},
			configurable: true
		});

		textarea.value = 'Initial!';
		textarea.focus();
		valueWrites.length = 0;
		textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
		flushSync();

		expect(parent.state.task.notes).toBe('Initial!');
		expect(container.querySelector('textarea')).toBe(textarea);
		expect(valueWrites).toEqual([]);
		expect(insertBefore).not.toHaveBeenCalled();
		insertBefore.mockRestore();
	});
});
