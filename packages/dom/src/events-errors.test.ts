/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import { currentInteraction, type Component } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { createCompiledOperation, jsx } from './test-support/native-operations.js';
import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import {
	ConstructionFailureBoundary,
	CustomFallbackBoundary,
	DefaultRetryBoundary,
	DelegatedReplacement,
	DirectEventFailureBoundary,
	EventFailureBoundary,
	NestedFailingFallbackBoundary,
	NestedParentBoundary,
	RemovingEventHandler,
	ReplacingEventHandler,
	allowRetrySuccess,
	constructionFailureBoundaryInstance,
	delegatedReplacementInstance,
	directEventFailureBoundaryInstance,
	eventCounts,
	eventFailureBoundaryInstance,
	nestedBoundaryInstances,
	removingEventHandlerInstance,
	replacingEventHandlerInstance,
	resetCustomFallback,
	resetEventErrorFixtures,
	retryConstructionCount
} from './events-errors.fixtures.js';
import { directEventHandlers, eventHandlers } from './state.js';

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

	it('retains published compiled-event mutations when a later statement fails', () => {
		const container = document.createElement('div');
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let owner!: Component<{ count: number }>;
		function Button(this: Component<{ count: number }>) {
			owner = this;
			this.state.count = 0;
			return () =>
				jsx('button', {
					'__exactDirectInteraction:onClick': () => {
						this.state.count = 1;
						throw new Error('event failed');
					},
					children: 'Fail'
				});
		}
		try {
			render(jsx(Button, {}), container);
			container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(owner.state.count).toBe(1);
		} finally {
			unmount(container);
			errorLog.mockRestore();
		}
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
		expect(eventHandlers.get(container.querySelector('button')!)?.has('click')).not.toBe(true);
		expect(
			directEventHandlers
				.get(container.querySelector('button')!)
				?.has('__exactClosedInteraction:onClick')
		).toBe(true);
	});

	it('removes compiler-proven direct handlers with their mounted element', () => {
		const container = document.createElement('div');
		const calls = vi.fn();
		render(
			jsx('button', {
				'__exactClosedInteraction:onClick': calls,
				children: 'Click'
			}),
			container
		);
		const button = container.querySelector('button')!;

		button.click();
		expect(calls).toHaveBeenCalledOnce();
		expect(unmount(container)).toBe(true);
		button.click();
		expect(calls).toHaveBeenCalledOnce();
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
		expect(eventHandlers.get(buttons[0]!)?.get('click')?.[1]).toBe(1);
		expect(eventHandlers.get(buttons[1]!)?.get('click')?.[1]).toBe(0);
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
		resetEventErrorFixtures();
		const container = document.createElement('div');
		render(jsx(DelegatedReplacement, {}), container);
		const instance = delegatedReplacementInstance();
		const oldButton = container.querySelector('button')!;

		instance.state.asButton = false;
		flushSync();
		container.appendChild(oldButton);
		oldButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(eventCounts.replaced).toBe(0);
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
		const container = document.createElement('div');
		render(jsx(EventFailureBoundary, {}), container);
		const panel = eventFailureBoundaryInstance();
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(panel.state.errors).toHaveLength(1);
		expect(panel.state.errors[0]!.source).toBe('event');
		expect(container.textContent).toBe('Recovered');
		expect(container.querySelector('button')).toBeNull();
	});

	it('routes direct event handler failures to the nearest error context', () => {
		const container = document.createElement('div');
		render(jsx(DirectEventFailureBoundary, {}), container);
		const panel = directEventFailureBoundaryInstance();
		container.querySelector('input')!.dispatchEvent(new FocusEvent('focus'));
		flushSync();
		expect(panel.state.errors[0]!.source).toBe('event');
		expect(container.textContent).toBe('Recovered');
	});

	it('routes failures to the nearest nested error context only', () => {
		const container = document.createElement('div');
		render(jsx(NestedParentBoundary, {}), container);
		const [parent, child] = nestedBoundaryInstances();
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(parent.state.errors).toHaveLength(0);
		expect(child.state.errors).toHaveLength(1);
		expect(container.textContent).toBe('Child recovered');
	});

	it('routes child construction failures to the nearest parent error context', () => {
		const container = document.createElement('div');
		render(jsx(ConstructionFailureBoundary, {}), container);
		const parent = constructionFailureBoundaryInstance();
		flushSync();

		expect(parent.state.errors).toHaveLength(1);
		expect(parent.state.errors[0]!.source).toBe('construct');
		expect(container.textContent).toBe('Child failed');
	});

	it('provides a default error boundary that can retry a failed subtree', () => {
		resetEventErrorFixtures();
		const container = document.createElement('div');
		render(jsx(DefaultRetryBoundary, {}), container);
		flushSync();

		expect(container.textContent).toContain('Application error');
		expect(container.textContent).toContain('construct failed');

		allowRetrySuccess();
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(container.textContent).toBe('Recovered');
		expect(retryConstructionCount()).toBe(2);
	});

	it('supplies captured reports and reset to a custom error boundary fallback', () => {
		resetEventErrorFixtures();
		const container = document.createElement('div');
		render(jsx(CustomFallbackBoundary, {}), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(container.textContent).toContain('event:Error: event failed');
		resetCustomFallback();
		flushSync();
		expect(container.textContent).toBe('Break');
	});

	it('routes a failing fallback to the next enclosing error boundary', () => {
		const container = document.createElement('div');
		render(jsx(NestedFailingFallbackBoundary, {}), container);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();

		expect(container.textContent).toContain('Outer: Error: fallback failed');
	});

	it('replaces delegated event handlers', () => {
		resetEventErrorFixtures();
		const container = document.createElement('div');
		render(jsx(ReplacingEventHandler, {}), container);
		const button = replacingEventHandlerInstance();
		const element = container.querySelector('button')!;

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		button.state.mode = 'b';
		flushSync();
		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(eventCounts.first).toBe(1);
		expect(eventCounts.second).toBe(1);
	});

	it('removes delegated event handlers', () => {
		resetEventErrorFixtures();
		const container = document.createElement('div');
		render(jsx(RemovingEventHandler, {}), container);
		const button = removingEventHandlerInstance();
		const element = container.querySelector('button')!;

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		button.state.enabled = false;
		flushSync();
		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(eventCounts.removable).toBe(1);
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
				createCompiledOperation(
					'label',
					{},
					createCompiledOperation(
						'span',
						{},
						createExpression(() => this.state.label)
					),
					createCompiledOperation(
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
						createCompiledOperation('option', { value: 'low' }, 'low'),
						createCompiledOperation('option', { value: 'medium' }, 'medium'),
						createCompiledOperation('option', { value: 'high' }, 'high')
					)
				);
		}

		const container = document.createElement('div');
		render(createCompiledOperation(PrioritySelect, {}), container);
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
import '@exactjs/core/runtime/contexts';
