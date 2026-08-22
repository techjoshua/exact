/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import {
	createErrorContext,
	currentInteraction,
	ErrorBoundary,
	ErrorContext,
	type Component,
	type ErrorContextValue,
	type ErrorReport
} from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { createCompiledVNode, jsx } from './test-support/native-vnode.js';
import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import { directInteractionKey } from './events.js';
import { eventHandlers } from './state.js';

describe('@exactjs/dom events-errors', () => {
	it('runs compiler-owned event handlers without materializing an interaction frame', () => {
		const container = document.createElement('div');
		let activeInteraction: unknown = 'not called';
		function Button(this: Component<{}>) {
			return () =>
				jsx('button', {
					'__exactDirectInteraction:onClick': () => {
						activeInteraction = currentInteraction();
					},
					children: 'Click'
				});
		}
		render(jsx(Button, {}), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(activeInteraction).toBeUndefined();
	});

	it('does not redefine currentTarget for compiler-proven argument-free handlers', () => {
		const container = document.createElement('div');
		let calls = 0;
		function Button(this: Component<{}>) {
			return () =>
				jsx('button', {
					'__exactClosedInteraction:onClick': () => calls++,
					children: 'Click'
				});
		}
		render(jsx(Button, {}), container);
		const event = new MouseEvent('click', { bubbles: true });
		const defineProperty = vi.spyOn(Object, 'defineProperty');

		container.querySelector('button')!.dispatchEvent(event);

		expect(calls).toBe(1);
		expect(
			defineProperty.mock.calls.some(([target, key]) => target === event && key === 'currentTarget')
		).toBe(false);
	});

	it('keeps compiled interaction selection local to one event binding', () => {
		const container = document.createElement('div');
		const handler = () => undefined;
		function Buttons(this: Component<{}>) {
			return () =>
				jsx('div', {
					children: [
						jsx('button', {
							'__exactDirectInteraction:onClick': handler,
							children: 'Compiled'
						}),
						jsx('button', { onClick: handler, children: 'Runtime' })
					]
				});
		}
		render(jsx(Buttons, {}), container);
		const buttons = container.querySelectorAll('button');
		expect(eventHandlers.get(buttons[0]!)?.has(directInteractionKey('click'))).toBe(true);
		expect(eventHandlers.get(buttons[1]!)?.has(directInteractionKey('click'))).toBe(false);
	});

	it('runs binding listeners before delegated user handlers and removes them on unmount', () => {
		const container = document.createElement('div');
		const calls: string[] = [];
		const binding = vi.fn(() => calls.push('binding'));
		render(
			jsx('input', {
				__exactBindChange: binding,
				onChange: () => calls.push('user')
			}),
			container
		);
		const input = container.querySelector('input')!;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(calls).toEqual(['binding', 'user']);

		unmount(container);
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(binding).toHaveBeenCalledOnce();
	});

	it('normalizes JSX double-click handlers to the browser dblclick event', () => {
		const container = document.createElement('div');
		let calls = 0;
		render(jsx('button', { onDoubleClick: () => calls++, children: 'Double' }), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(calls).toBe(1);
	});

	it('preserves the delegated event path when an inner handler removes DOM', () => {
		const container = document.createElement('div');
		const calls: string[] = [];
		render(
			jsx('section', {
				onClick: () => calls.push('outer'),
				children: jsx('button', {
					onClick: () => {
						calls.push('inner');
						container.querySelector('section')!.remove();
					},
					children: 'remove'
				})
			}),
			container
		);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(calls).toEqual(['inner', 'outer']);
	});

	it('publishes all synchronous event writes as one reactive transition', () => {
		const container = document.createElement('div');
		const scheduled = vi.fn();
		function Form(this: Component<{ first: number; second: number }>) {
			this.state.first = 0;
			this.state.second = 0;
			watch(() => void `${this.state.first}:${this.state.second}`, undefined, {
				onSchedule: scheduled
			});
			return () =>
				jsx('button', {
					onClick: () => {
						this.state.first = 1;
						this.state.second = 2;
					},
					children: createExpression(() => `${this.state.first}:${this.state.second}`)
				});
		}
		render(jsx(Form, {}), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(scheduled).toHaveBeenCalledTimes(1);
		expect(container.textContent).toBe('1:2');
	});

	it('runs capture handlers without relying on bubbling delegation', () => {
		const container = document.createElement('div');
		const calls: string[] = [];
		render(
			jsx('section', {
				onClickCapture: () => calls.push('capture'),
				children: jsx('button', { children: 'Click' })
			}),
			container
		);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(calls).toEqual(['capture']);
	});

	it('uses direct listeners for non-bubbling events and cleans them on unmount', () => {
		const container = document.createElement('div');
		let calls = 0;
		render(jsx('input', { onFocus: () => calls++ }), container);
		const input = container.querySelector('input')!;
		input.dispatchEvent(new FocusEvent('focus'));
		render(jsx('p', { children: 'removed' }), container);
		input.dispatchEvent(new FocusEvent('focus'));
		expect(calls).toBe(1);
	});

	it('keeps pointer lifecycle handlers direct across keyed movement', () => {
		const container = document.createElement('div');
		let list!: Component<{ items: string[] }>;
		const moves = vi.fn();
		function List(this: Component<{ items: string[] }>) {
			list = this;
			this.state.items = ['a', 'b'];
			return () =>
				jsx('section', {
					children: this.map(
						this.state.items,
						(item) => item,
						(item) => jsx('button', { onPointerMove: moves, children: item })
					)
				});
		}
		render(jsx(List, {}), container);
		const button = container.querySelectorAll('button')[0]!;
		list.state.items.splice(0, 2, 'b', 'a');
		flushSync();
		button.dispatchEvent(new Event('pointermove', { bubbles: true }));
		expect(moves).toHaveBeenCalledTimes(1);
	});

	it('normalizes pointer-capture lifecycle events without treating them as capture-phase handlers', () => {
		const container = document.createElement('div');
		const lost = vi.fn();
		render(jsx('button', { onLostPointerCapture: lost, children: 'drag' }), container);
		container.querySelector('button')!.dispatchEvent(new Event('lostpointercapture'));
		expect(lost).toHaveBeenCalledTimes(1);
	});

	it('replaces direct event handlers without retaining the previous callback', () => {
		const container = document.createElement('div');
		const first = vi.fn();
		const second = vi.fn();
		render(jsx('input', { onFocus: first }), container);
		render(jsx('input', { onFocus: second }), container);
		container.querySelector('input')!.dispatchEvent(new FocusEvent('focus'));
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('uses a direct listener for scroll handlers', () => {
		const container = document.createElement('div');
		const scrolled = vi.fn();
		render(jsx('div', { onScroll: scrolled, children: 'Scroll' }), container);
		container.firstElementChild!.dispatchEvent(new Event('scroll'));
		expect(scrolled).toHaveBeenCalledTimes(1);
	});

	it.each([
		['pointerenter', 'onPointerEnter'],
		['invalid', 'onInvalid'],
		['toggle', 'onToggle'],
		['ended', 'onEnded']
	])('delivers non-bubbling %s events through direct listeners', (type, prop) => {
		const container = document.createElement('div');
		const handled = vi.fn();
		render(
			jsx(type === 'ended' ? 'video' : type === 'invalid' ? 'input' : 'div', {
				[prop]: handled
			}),
			container
		);

		container.firstElementChild!.dispatchEvent(new Event(type, { bubbles: false }));

		expect(handled).toHaveBeenCalledTimes(1);
	});

	it('does not retain delegated event handlers after DOM replacement', () => {
		let instance!: Component<{ asButton: boolean }>;
		const clicked = vi.fn();

		function Switcher(this: Component<{ asButton: boolean }>) {
			instance = this;
			this.state.asButton = true;

			return () =>
				this.state.asButton == true
					? jsx('button', { onClick: clicked, children: 'Old' })
					: jsx('span', { children: 'New' });
		}

		const container = document.createElement('div');
		render(jsx(Switcher, {}), container);
		const oldButton = container.querySelector('button')!;

		instance.state.asButton = false;
		flushSync();
		container.appendChild(oldButton);
		oldButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(clicked).not.toHaveBeenCalled();
	});

	it('delegates events and preserves instance access', () => {
		let clicked = 0;

		function Button(this: Component<{}>) {
			return () => jsx('button', { onClick: () => clicked++, children: 'Click' });
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);
		container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		container
			.querySelector('button')
			?.firstChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(clicked).toBe(2);
	});

	it('respects stopPropagation in delegated event handlers', () => {
		const childClicked = vi.fn();
		const parentClicked = vi.fn();

		function Panel() {
			return () =>
				jsx('section', {
					onClick: parentClicked,
					children: jsx('button', {
						onClick: (event: Event) => {
							event.stopPropagation();
							childClicked();
						},
						children: 'Close'
					})
				});
		}

		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		container
			.querySelector('button')!
			.firstChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(childClicked).toHaveBeenCalledTimes(1);
		expect(parentClicked).not.toHaveBeenCalled();
	});

	it('delegates dragstart events from text node targets', () => {
		const started = vi.fn();

		function Card() {
			return () =>
				jsx('div', {
					draggable: true,
					onDragStart: started,
					children: 'Drag'
				});
		}

		const container = document.createElement('div');
		render(jsx(Card, {}), container);
		container
			.querySelector('div')!
			.firstChild!.dispatchEvent(new Event('dragstart', { bubbles: true }));

		expect(started).toHaveBeenCalledTimes(1);
	});

	it('routes event handler failures to the nearest error context', () => {
		let panel!: Component<{ errors: ErrorReport[] }>;

		function Panel(this: Component<{ errors: ErrorReport[] }>) {
			panel = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));

			return () =>
				this.state.errors.length
					? jsx('p', { children: 'Recovered' })
					: jsx('button', {
							onClick: () => {
								throw new Error('click failed');
							},
							children: 'Break'
						});
		}

		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(panel.state.errors).toHaveLength(1);
		expect(panel.state.errors[0]!.source).toBe('event');
		expect(container.textContent).toBe('Recovered');
		expect(container.querySelector('button')).toBeNull();
	});

	it('routes direct event handler failures to the nearest error context', () => {
		let panel!: Component<{ errors: ErrorReport[] }>;
		function Panel(this: Component<{ errors: ErrorReport[] }>) {
			panel = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			return () =>
				this.state.errors.length
					? jsx('p', { children: 'Recovered' })
					: jsx('input', {
							onFocus: () => {
								throw new Error('focus failed');
							}
						});
		}
		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		container.querySelector('input')!.dispatchEvent(new FocusEvent('focus'));
		flushSync();
		expect(panel.state.errors[0]!.source).toBe('event');
		expect(container.textContent).toBe('Recovered');
	});

	it('routes failures to the nearest nested error context only', () => {
		let parent!: Component<{ errors: ErrorReport[] }>;
		let child!: Component<{ errors: ErrorReport[] }>;

		function ChildBoundary(this: Component<{ errors: ErrorReport[] }>) {
			child = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));

			return () =>
				this.state.errors.length
					? jsx('p', { children: 'Child recovered' })
					: jsx('button', {
							onClick: () => {
								throw new Error('child failed');
							},
							children: 'Break child'
						});
		}

		function ParentBoundary(this: Component<{ errors: ErrorReport[] }>) {
			parent = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));

			return () =>
				this.state.errors.length
					? jsx('p', { children: 'Parent recovered' })
					: jsx('section', { children: jsx(ChildBoundary, {}) });
		}

		const container = document.createElement('div');
		render(jsx(ParentBoundary, {}), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(parent.state.errors).toHaveLength(0);
		expect(child.state.errors).toHaveLength(1);
		expect(container.textContent).toBe('Child recovered');
	});

	it('routes child construction failures to the nearest parent error context', () => {
		let parent!: Component<{ errors: ErrorReport[] }>;

		function Broken(): never {
			throw new Error('construct failed');
		}

		function Parent(this: Component<{ errors: ErrorReport[] }>) {
			parent = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));

			return () =>
				this.state.errors.length
					? jsx('p', { children: 'Child failed' })
					: jsx('section', {
							children: jsx(Broken, {})
						});
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
		flushSync();

		expect(parent.state.errors).toHaveLength(1);
		expect(parent.state.errors[0]!.source).toBe('construct');
		expect(container.textContent).toBe('Child failed');
	});

	it('provides a default error boundary that can retry a failed subtree', () => {
		let shouldFail = true;
		let constructions = 0;

		function Child() {
			constructions++;
			if (shouldFail) throw new Error('construct failed');
			return () => jsx('p', { children: 'Recovered' });
		}

		const container = document.createElement('div');
		render(jsx(ErrorBoundary, { children: jsx(Child, {}) }), container);
		flushSync();

		expect(container.textContent).toContain('Application error');
		expect(container.textContent).toContain('construct failed');

		shouldFail = false;
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(container.textContent).toBe('Recovered');
		expect(constructions).toBe(2);
	});

	it('supplies captured reports and reset to a custom error boundary fallback', () => {
		let reset!: () => void;

		function Broken() {
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('event failed');
					},
					children: 'Break'
				});
		}

		const container = document.createElement('div');
		render(
			jsx(ErrorBoundary, {
				fallback: ({ error, reset: retry }) => {
					reset = retry;
					return jsx('p', { children: `${error.source}:${String(error.error)}` });
				},
				children: jsx(Broken, {})
			}),
			container
		);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(container.textContent).toContain('event:Error: event failed');
		reset();
		flushSync();
		expect(container.textContent).toBe('Break');
	});

	it('routes a failing fallback to the next enclosing error boundary', () => {
		function Broken() {
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('child failed');
					},
					children: 'Break'
				});
		}

		const container = document.createElement('div');
		render(
			jsx(ErrorBoundary, {
				fallback: ({ error }) => jsx('p', { children: `Outer: ${String(error.error)}` }),
				children: jsx(ErrorBoundary, {
					fallback: () => {
						throw new Error('fallback failed');
					},
					children: jsx(Broken, {})
				})
			}),
			container
		);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(container.textContent).toContain('Outer: Error: fallback failed');
	});

	it('renders the root default error view for unclaimed event failures', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let errors!: ErrorContextValue;

		function Panel(this: Component<{}>) {
			errors = this.getContext(ErrorContext);
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('root failed');
					},
					children: 'Break'
				});
		}

		try {
			const container = document.createElement('div');
			render(jsx(Panel, {}), container);
			container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(errors.errors).toHaveLength(1);
			expect(container.textContent).toContain('Application error');
			expect(container.textContent).toContain('root failed');
		} finally {
			errors.clearAll();
			errorLog.mockRestore();
		}
	});

	it('keeps root default error contexts isolated per container', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let firstErrors!: ErrorContextValue;
		let secondErrors!: ErrorContextValue;

		function First(this: Component<{}>) {
			firstErrors = this.getContext(ErrorContext);
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('first failed');
					},
					children: 'First'
				});
		}

		function Second(this: Component<{}>) {
			secondErrors = this.getContext(ErrorContext);
			return () => jsx('p', { children: 'Second ok' });
		}

		try {
			const first = document.createElement('div');
			const second = document.createElement('div');
			render(jsx(First, {}), first);
			render(jsx(Second, {}), second);

			first.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(firstErrors).not.toBe(secondErrors);
			expect(firstErrors.errors).toHaveLength(1);
			expect(secondErrors.errors).toHaveLength(0);
			expect(first.textContent).toContain('first failed');
			expect(second.textContent).toBe('Second ok');
		} finally {
			firstErrors?.clearAll();
			secondErrors?.clearAll();
			errorLog.mockRestore();
		}
	});

	it('replaces delegated event handlers', () => {
		let button!: Component<{ mode: 'a' | 'b' }>;
		const first = vi.fn();
		const second = vi.fn();

		function Button(this: Component<{ mode: 'a' | 'b' }>) {
			button = this;
			this.state.mode = 'a';

			return () =>
				jsx('button', {
					onClick: this.state.mode == 'a' ? first : second,
					children: 'Click'
				});
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);
		const element = container.querySelector('button')!;

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		button.state.mode = 'b';
		flushSync();
		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('removes delegated event handlers', () => {
		let button!: Component<{ enabled: boolean }>;
		const clicked = vi.fn();

		function Button(this: Component<{ enabled: boolean }>) {
			button = this;
			this.state.enabled = true;

			return () =>
				this.state.enabled == true
					? jsx('button', { onClick: clicked, children: 'Click' })
					: jsx('button', { children: 'Click' });
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);
		const element = container.querySelector('button')!;

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		button.state.enabled = false;
		flushSync();
		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(clicked).toHaveBeenCalledTimes(1);
	});

	it('keeps compiled controlled select values stable through change events', () => {
		let instance!: Component<{ priority: 'low' | 'medium' | 'high'; label: string }>;

		function PrioritySelect(
			this: Component<{ priority: 'low' | 'medium' | 'high'; label: string }>
		) {
			instance = this;
			this.state.priority = 'medium';
			this.state.label = 'Ready';

			return () =>
				createCompiledVNode(
					'label',
					{},
					createCompiledVNode(
						'span',
						{},
						createExpression(() => this.state.label)
					),
					createCompiledVNode(
						'select',
						{
							value: createExpression(() => this.state.priority),
							onChange: (event: Event) => {
								this.state.priority = (event.currentTarget as HTMLSelectElement).value as
									| 'low'
									| 'medium'
									| 'high';
							}
						},
						createCompiledVNode('option', { value: 'low' }, 'low'),
						createCompiledVNode('option', { value: 'medium' }, 'medium'),
						createCompiledVNode('option', { value: 'high' }, 'high')
					)
				);
		}

		const container = document.createElement('div');
		render(createCompiledVNode(PrioritySelect, {}), container);
		const select = container.querySelector('select')!;

		expect(select.value).toBe('medium');

		select.value = 'high';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();

		expect(instance.state.priority).toBe('high');
		expect(select.value).toBe('high');

		instance.state.label = 'Updated';
		flushSync();

		expect(instance.state.priority).toBe('high');
		expect(select.value).toBe('high');
	});
});
