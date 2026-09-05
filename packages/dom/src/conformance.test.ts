/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import {
	LoggerContext,
	createContext,
	type Component,
	type LogEvent,
	type Logger
} from '@exactjs/core';
import { jsx } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	CompiledBrokenButton,
	CompiledErrorBoundary,
	CompiledRefDemo,
	ConformanceButton,
	compiledErrorBoundaryInstance,
	compiledRefDemoInstance,
	conformanceButtonInstance,
	conformanceButtonRef
} from './dom-behavior.fixtures.js';

describe('eXact conformance', () => {
	it('updates reactive text and props at their DOM binding points', () => {
		const container = document.createElement('div');
		render(jsx(ConformanceButton, {}), container);
		const instance = conformanceButtonInstance();
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
		try {
			const container = document.createElement('div');
			render(jsx(CompiledErrorBoundary, { children: jsx(CompiledBrokenButton, {}) }), container);
			const boundary = compiledErrorBoundaryInstance();

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
		const container = document.createElement('div');
		render(jsx(CompiledRefDemo, {}), container);
		const instance = compiledRefDemoInstance();
		expect(instance.refs.get(conformanceButtonRef)).toBe(container.querySelector('button'));

		instance.state.show = false;
		flushSync();

		expect(instance.refs.get(conformanceButtonRef)).toBeUndefined();
		expect(container.textContent).toBe('gone');
	});
});
import '@exactjs/core/runtime/contexts';
