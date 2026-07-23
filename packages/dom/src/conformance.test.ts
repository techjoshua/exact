/**
 * @vitest-environment jsdom
 */
import {
	ErrorContext,
	LoggerContext,
	createContext,
	createErrorContext,
	createRef,
	type Child,
	type Component,
	type ErrorReport,
	type LogEvent,
	type Logger
} from '@exactjs/core';
import { jsx } from '@exactjs/jsx';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';

describe('eXact conformance', () => {
	it('updates reactive text and props at their DOM binding points', () => {
		let instance!: Component<{ label: string; enabled: boolean }>;

		function Button(this: Component<{ label: string; enabled: boolean }>) {
			instance = this;
			this.state.label = 'Save';
			this.state.enabled = true;

			return () =>
				jsx('button', {
					title: this.state.label,
					disabled: this.state.enabled == false,
					children: this.state.label
				});
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);
		const button = container.querySelector('button')!;

		instance.state.label = 'Saved';
		instance.state.enabled = false;
		flushSync();

		expect(container.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('Saved');
		expect(button.title).toBe('Saved');
		expect(button.disabled).toBe(true);
	});

	it('preserves keyed list identity across reorders', () => {
		type Item = { id: string; label: string };
		let instance!: Component<{ items: Item[] }>;

		function List(this: Component<{ items: Item[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'Alpha' },
				{ id: 'b', label: 'Beta' }
			];

			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx('li', { children: item.label })
					)
				});
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);
		const alpha = container.querySelectorAll('li')[0]!;
		const beta = container.querySelectorAll('li')[1]!;

		instance.state.items.reverse();
		flushSync();

		expect(container.querySelectorAll('li')[0]).toBe(beta);
		expect(container.querySelectorAll('li')[1]).toBe(alpha);
		expect(container.textContent).toBe('BetaAlpha');
	});

	it('lets descendants consume overridden contexts', () => {
		const ThemeContext = createContext<{ tone: string }>('theme');

		function Parent(this: Component<{}>) {
			this.setContext(ThemeContext, { tone: 'calm' });
			return () => jsx(Child, {});
		}

		function Child(this: Component<{}>) {
			const theme = this.getContext(ThemeContext);
			return () => jsx('span', { children: theme.tone });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);

		expect(container.textContent).toBe('calm');
	});

	it('routes errors to nearest ErrorContext boundary', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let boundary!: Component<{ errors: ErrorReport[] }>;

		function Boundary(
			this: Component<{ errors: ErrorReport[] }>,
			props: { children?: Child | Child[] }
		) {
			boundary = this;
			this.state.errors = [];
			const errors = createErrorContext(this.state.errors);
			this.setContext(ErrorContext, errors);

			return () =>
				this.state.errors.length
					? jsx('section', { role: 'alert', children: 'Recovered' })
					: props.children;
		}

		function Broken() {
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('event failed');
					},
					children: 'Break'
				});
		}

		try {
			const container = document.createElement('div');
			render(jsx(Boundary, { children: jsx(Broken, {}) }), container);

			container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(boundary.state.errors).toHaveLength(1);
			expect(boundary.state.errors[0]!.source).toBe('event');
			expect(container.textContent).toBe('Recovered');
		} finally {
			errorLog.mockRestore();
		}
	});

	it('uses LoggerContext overrides for component logs', () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			log: (event) => events.push(event)
		};

		function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => jsx(Child, {});
		}

		function Child(this: Component<{}>) {
			this.log.info('ready', { component: 'Child' });
			return () => jsx('span', { children: 'ok' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);

		expect(events).toHaveLength(1);
		expect(events[0]!.message).toBe('ready');
		expect(events[0]!.data).toEqual({ component: 'Child' });
		expect(events[0]!.scope.component?.name).toBe('Child');
	});

	it('fulfills and clears DOM refs', () => {
		const buttonRef = createRef<HTMLButtonElement>('button');
		let instance!: Component<{ show: boolean }>;

		function RefDemo(this: Component<{ show: boolean }>) {
			instance = this;
			this.state.show = true;

			return () =>
				this.state.show == true
					? jsx('button', { ref: this.ref(buttonRef), children: 'Action' })
					: jsx('span', { children: 'gone' });
		}

		const container = document.createElement('div');
		render(jsx(RefDemo, {}), container);
		expect(instance.refs.get(buttonRef)).toBe(container.querySelector('button'));

		instance.state.show = false;
		flushSync();

		expect(instance.refs.get(buttonRef)).toBeUndefined();
		expect(container.textContent).toBe('gone');
	});
});
