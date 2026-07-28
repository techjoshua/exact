import { describe, expect, it } from 'vitest';
import type { Component } from './contracts.js';
import { renderInstance } from './render.js';
import { createComponentInstance } from './runtime.js';

describe('component render binding', () => {
	it('invokes a returned regular render function with its component instance', () => {
		function sharedRender(this: Component<{ label: string }>) {
			return this.state.label;
		}
		function Label(this: Component<{ label: string }>) {
			this.state.label = 'bound';
			return sharedRender;
		}

		const instance = createComponentInstance(Label, {});

		expect(renderInstance(instance, () => undefined)).toEqual(['bound']);
	});

	it('does not replace lexical or explicitly bound receivers', () => {
		const lexical = { label: 'lexical' };
		const bound = { label: 'bound' };
		const Arrow = () => () => lexical.label;
		const Bound = () =>
			function render(this: typeof bound) {
				return this.label;
			}.bind(bound);

		expect(renderInstance(createComponentInstance(Arrow, {}), () => undefined)).toEqual([
			'lexical'
		]);
		expect(renderInstance(createComponentInstance(Bound, {}), () => undefined)).toEqual(['bound']);
	});
});
