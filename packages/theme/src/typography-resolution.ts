import type { ResolvedThemeTypography, ThemeTypography, TypographyPreset } from './contracts.js';
import { ThemeResolutionError } from './errors.js';
import { freezeThemeValue } from './source-resolution.js';

const SYSTEM_CODE = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace';
const SYSTEM_BODY =
	'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const typographyStacks: Record<TypographyPreset, readonly [string, string, string]> = {
	system: [SYSTEM_BODY, SYSTEM_BODY, SYSTEM_CODE],
	humanist: [
		'Candara, "Segoe UI", Calibri, ui-sans-serif, system-ui, sans-serif',
		'Candara, "Segoe UI", Calibri, ui-sans-serif, system-ui, sans-serif',
		SYSTEM_CODE
	],
	geometric: [
		'"Avenir Next", Avenir, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif',
		'"Avenir Next", Avenir, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif',
		SYSTEM_CODE
	],
	editorial: [
		'Charter, "Bitstream Charter", "Sitka Text", Georgia, serif',
		'Georgia, "Times New Roman", serif',
		SYSTEM_CODE
	],
	monospace: [SYSTEM_CODE, SYSTEM_CODE, SYSTEM_CODE]
};

/** Inherits omitted typography fields, then validates the complete custom scale. */
export function resolveTypography(
	value: 'inherit' | TypographyPreset | Partial<ThemeTypography> | undefined,
	inherited?: ResolvedThemeTypography
): ResolvedThemeTypography {
	if (value === undefined || value === 'inherit') return inherited ?? resolveTypography('system');
	if (typeof value === 'string') {
		const stacks = typographyStacks[value];
		if (!stacks)
			throw new ThemeResolutionError(
				'invalid-typography',
				'source.typography',
				`Unknown typography preset ${value}`
			);
		return freezeThemeValue({
			id: value,
			body: stacks[0],
			display: stacks[1],
			code: stacks[2],
			baseSizeRem: 1,
			scaleRatio: 1.2,
			bodyLineHeight: 1.5,
			headingLineHeight: 1.2
		});
	}
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ThemeResolutionError(
			'invalid-typography',
			'source.typography',
			'Typography must be a preset or a partial object'
		);
	const base = inherited ?? resolveTypography('system');
	const custom = {
		body: value.body === undefined ? base.body : value.body,
		display: value.display === undefined ? base.display : value.display,
		code: value.code === undefined ? base.code : value.code,
		baseSizeRem: value.baseSizeRem === undefined ? base.baseSizeRem : value.baseSizeRem,
		scaleRatio: value.scaleRatio === undefined ? base.scaleRatio : value.scaleRatio,
		bodyLineHeight: value.bodyLineHeight === undefined ? base.bodyLineHeight : value.bodyLineHeight,
		headingLineHeight:
			value.headingLineHeight === undefined ? base.headingLineHeight : value.headingLineHeight
	};
	for (const name of ['body', 'display', 'code'] as const)
		validateFont(custom[name], `source.typography.${name}`);
	for (const [name, low, high] of [
		['baseSizeRem', 0.875, 1.25],
		['scaleRatio', 1.067, 1.333],
		['bodyLineHeight', 1.2, 2],
		['headingLineHeight', 1, 1.5]
	] as const) {
		const number = custom[name];
		if (!Number.isFinite(number) || number < low || number > high)
			throw new ThemeResolutionError(
				'invalid-typography',
				`source.typography.${name}`,
				`${name} is outside ${low}..${high}`
			);
	}
	return freezeThemeValue({ id: 'custom', ...custom });
}

function validateFont(value: string, path: string): void {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.length > 2048 ||
		/[{};\x00-\x1f\x7f]|\/\*/.test(value)
	)
		throw new ThemeResolutionError(
			'invalid-typography',
			path,
			`Unsafe or empty font stack at ${path}`
		);
}
