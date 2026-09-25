import { describe, expect, it } from 'vitest';
import { resolveTheme } from './resolver.js';

const environment = { appearance: 'light', contrast: 'standard', motion: 'full' } as const;

describe('partial typography sources', () => {
	it('inherits omitted fields and explicit inherit while allowing a preset reset', () => {
		const parent = resolveTheme({
			source: { typography: { body: '"Example Sans", sans-serif', baseSizeRem: 1.125 } },
			environment
		});
		const child = resolveTheme({
			source: { typography: { display: 'Georgia, serif' } },
			parent,
			environment
		});
		expect(child.source.typography).toEqual({
			...parent.source.typography,
			display: 'Georgia, serif'
		});
		expect(
			resolveTheme({ source: { typography: 'inherit' }, parent, environment }).source.typography
		).toBe(parent.source.typography);
		expect(
			resolveTheme({ source: { typography: 'system' }, parent, environment }).source.typography
				.baseSizeRem
		).toBe(1);
		expect(Object.isFrozen(child.source.typography)).toBe(true);
	});

	it('validates authored fields after inheritance and does not trust an authored id', () => {
		for (const typography of [
			{ body: 'serif; color:red' },
			{ baseSizeRem: 0 },
			{ id: 'system', body: 'serif; color:red' },
			{ scaleRatio: Number.NaN }
		])
			expect(() => resolveTheme({ source: { typography }, environment })).toThrow();
	});
});

it('inherits every omitted source setting from its parent', () => {
	const parent = resolveTheme({
		source: {
			keyColor: '#7357d9',
			neutralColor: '#666677',
			canvasColor: '#fafafa',
			temperament: 'soft',
			appearance: 'dark',
			contrast: 'more',
			motion: 'reduced',
			density: 'compact',
			shape: 'round',
			depth: 'elevated',
			typography: { body: 'Georgia, serif', baseSizeRem: 1.125 }
		},
		environment
	});
	const child = resolveTheme({ source: {}, parent, environment });
	expect(child.source).toEqual(parent.source);
	expect(child.fingerprint).toBe(parent.fingerprint);
});
