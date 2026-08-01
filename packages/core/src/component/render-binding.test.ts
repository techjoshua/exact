import { describe, expect, it } from 'vitest';
import { renderInstance } from './render.js';
import { createComponentInstance } from './runtime.js';

describe('component render binding', () => {
	it('preserves the render arrow lexical receiver', () => {
		const lexical = { label: 'lexical' };
		const Arrow = () => () => lexical.label;

		expect(renderInstance(createComponentInstance(Arrow, {}), () => undefined)).toEqual([
			'lexical'
		]);
	});

	it('rejects an uncompiled direct-view component at the runtime boundary', () => {
		const Direct = (() => 'view') as unknown as () => () => string;
		expect(() => createComponentInstance(Direct, {})).toThrow(
			'eXact runtime components must synchronously return their compiled render function'
		);
	});
});
