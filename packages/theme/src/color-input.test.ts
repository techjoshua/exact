import { verifyThemeSourceCapture } from '../../component-composition-corpus/test-support/theme-derivation-journey.mjs';
import { resolveTheme, builtInTemperaments } from './resolver.js';
import { describe, expect, it } from 'vitest';
import { parseThemeColor } from './color.js';
import type { ThemeColor } from './contracts.js';
import { ThemeResolutionError } from './errors.js';

describe('structured theme color capture', () => {
	it('matches the public cross-runtime source-capture journey', () => {
		expect(verifyThemeSourceCapture({ resolveTheme, builtInTemperaments })).toBe(true);
	});
	it.each(['srgb', 'display-p3', 'oklab', 'oklch'] as const)(
		'accepts captured %s components and omitted opacity',
		(colorSpace) => {
			expect(parseThemeColor({ colorSpace, components: [0.4, 0.05, 0.1] }).alpha).toBe(1);
		}
	);

	it.each(['unknown', 'constructor', { toString: () => 'srgb' }, undefined])(
		'rejects unsupported space %j',
		(colorSpace) => {
			expect(() => parseThemeColor({ colorSpace, components: [1, 0, 0] } as ThemeColor)).toThrow(
				ThemeResolutionError
			);
		}
	);

	it.each([null, NaN, Infinity, -0.1, 1.1])('rejects invalid explicit opacity %s', (alpha) => {
		expect(() =>
			parseThemeColor({ colorSpace: 'srgb', components: [1, 0, 0], alpha } as ThemeColor)
		).toThrow(ThemeResolutionError);
	});

	it('reads each structured field once and consumes the captured component tuple', () => {
		const reads = { colorSpace: 0, components: 0, alpha: 0 };
		const input: ThemeColor = {
			get colorSpace() {
				reads.colorSpace++;
				return 'srgb' as const;
			},
			get components(): readonly [number, number, number] {
				reads.components++;
				return reads.components === 1 ? [1, 0, 0] : [0, 0, 1];
			},
			get alpha() {
				reads.alpha++;
				return 1;
			}
		};
		expect(parseThemeColor(input)).toEqual(
			parseThemeColor({ colorSpace: 'srgb', components: [1, 0, 0] })
		);
		expect(reads).toEqual({ colorSpace: 1, components: 1, alpha: 1 });
	});

	it('ignores authored array methods and rejects sparse or non-finite native indices', () => {
		const valid: [number, number, number] = [1, 0, 0];
		valid.map = () => {
			throw new Error('authored map');
		};
		Object.defineProperty(valid, Symbol.iterator, {
			value: function* () {
				throw new Error('authored iterator');
			}
		});
		expect(parseThemeColor({ colorSpace: 'srgb', components: valid })).toEqual(
			parseThemeColor({ colorSpace: 'srgb', components: [1, 0, 0] })
		);
		const invalid: [number, number, number] = [NaN, 0, 0];
		Object.defineProperty(invalid, 'map', { value: () => [1, 0, 0] });
		const sparse: [number, number, number] = [1, 0, 0];
		Reflect.deleteProperty(sparse, '1');
		for (const components of [invalid, sparse])
			expect(() => parseThemeColor({ colorSpace: 'srgb', components })).toThrow(
				ThemeResolutionError
			);
	});

	it('retains none-component normalization and alpha boundary values', () => {
		for (const alpha of [0, 1])
			expect(
				parseThemeColor({ colorSpace: 'oklch', components: ['none', 'none', 'none'], alpha })
			).toEqual({ l: 0, c: 0, h: 0, alpha });
	});
});
