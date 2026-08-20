/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { jsx } from './test-support/native-vnode.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { percent, px, rem, render } from './index.js';

describe('@exactjs/dom styles', () => {
	it('updates className, boolean properties, and style props', () => {
		let instance!: Component<{ disabled: boolean; tone: string; compact: boolean }>;

		function Button(this: Component<{ disabled: boolean; tone: string; compact: boolean }>) {
			instance = this;
			this.state.disabled = true;
			this.state.tone = 'red';
			this.state.compact = false;

			return () =>
				jsx('button', {
					className: this.state.compact == true ? 'compact' : 'spacious',
					disabled: this.state.disabled,
					style: {
						color: this.state.tone,
						backgroundColor: this.state.compact == true ? 'black' : undefined
					},
					children: 'Save'
				});
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);
		const button = container.querySelector('button')!;

		expect(button.className).toBe('spacious');
		expect(button.disabled).toBe(true);
		expect(button.hasAttribute('disabled')).toBe(true);
		expect(button.style.color).toBe('red');
		expect(button.style.backgroundColor).toBe('');

		instance.state.disabled = false;
		instance.state.tone = 'blue';
		instance.state.compact = true;
		flushSync();

		expect(button.className).toBe('compact');
		expect(button.disabled).toBe(false);
		expect(button.hasAttribute('disabled')).toBe(false);
		expect(button.style.color).toBe('blue');
		expect(button.style.backgroundColor).toBe('black');
	});

	it('normalizes className strings, arrays, and truthy maps', () => {
		let instance!: Component<{ active: boolean; hidden: boolean }>;

		function Panel(this: Component<{ active: boolean; hidden: boolean }>) {
			instance = this;
			this.state.active = true;
			this.state.hidden = false;

			return () =>
				jsx('section', {
					className: ['panel', { active: this.state.active, hidden: this.state.hidden }]
				});
		}

		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		const section = container.querySelector('section')!;

		expect(section.className).toBe('panel active');

		instance.state.active = false;
		instance.state.hidden = true;
		flushSync();

		expect(section.className).toBe('panel hidden');
	});

	it('uses CSS unit helpers as reactive style binding points', () => {
		let instance!: Component<{ height: number; top: number; progress: number }>;
		const rendered = vi.fn();

		function Meter(this: Component<{ height: number; top: number; progress: number }>) {
			instance = this;
			this.state.height = 12;
			this.state.top = 1.5;
			this.state.progress = 50;

			return () => {
				rendered();
				const height = createExpression(() => px(this.state.height));
				const marginTop = createExpression(() => rem(this.state.top));
				const width = createExpression(() => percent(this.state.progress));

				return jsx('div', {
					style: {
						height,
						marginTop,
						width
					}
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(Meter, {}), container);
		const meter = container.querySelector('div')!;

		expect(meter.style.height).toBe('12px');
		expect(meter.style.marginTop).toBe('1.5rem');
		expect(meter.style.width).toBe('50%');

		instance.state.height = 24;
		instance.state.top = 2;
		instance.state.progress = 75;
		flushSync();

		expect(meter.style.height).toBe('24px');
		expect(meter.style.marginTop).toBe('2rem');
		expect(meter.style.width).toBe('75%');
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('uses reactive values in props and style entries', () => {
		let instance!: Component<{ first: string; last: string; color: string }>;
		const rendered = vi.fn();

		function Person(this: Component<{ first: string; last: string; color: string }>) {
			instance = this;
			this.state.first = 'Ada';
			this.state.last = 'Lovelace';
			this.state.color = 'red';
			const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);
			const tone = this.reactive(() => this.state.color);

			return () => {
				rendered();
				return jsx('span', {
					title: fullName,
					style: { color: tone },
					children: 'name'
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(Person, {}), container);
		const span = container.querySelector('span')!;
		expect(span.title).toBe('Ada Lovelace');
		expect(span.style.color).toBe('red');

		instance.state.last = 'Byron';
		instance.state.color = 'blue';
		flushSync();

		expect(span.title).toBe('Ada Byron');
		expect(span.style.color).toBe('blue');
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('does not rewrite unchanged reactive style entries', () => {
		let instance!: Component<{ color: string; padding: string }>;
		const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');

		function Box(this: Component<{ color: string; padding: string }>) {
			instance = this;
			this.state.color = 'red';
			this.state.padding = '4px';
			const color = this.reactive(() => this.state.color);
			const paddingTop = this.reactive(() => this.state.padding);

			return () =>
				jsx('div', {
					style: {
						color,
						paddingTop
					}
				});
		}

		const container = document.createElement('div');
		render(jsx(Box, {}), container);
		setProperty.mockClear();

		instance.state.color = 'blue';
		flushSync();

		expect(container.querySelector('div')!.style.color).toBe('blue');
		expect(container.querySelector('div')!.style.paddingTop).toBe('4px');
		expect(setProperty).toHaveBeenCalledTimes(1);
		expect(setProperty).toHaveBeenCalledWith('color', 'blue');
		setProperty.mockRestore();
	});
});
