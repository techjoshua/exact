import type { ResolvedThemeSource, ThemeTokenName } from './contracts.js';
import { decimal } from './color.js';

/** Populates density, shape, typography, depth, and motion tokens. */
export function structuralTokens(
	tokens: Record<ThemeTokenName, string>,
	source: ResolvedThemeSource
): void {
	const unit = { compact: 0.2, comfortable: 0.25, spacious: 0.3 }[source.density];
	const height = { compact: 2, comfortable: 2.5, spacious: 3 }[source.density];
	for (let index = 0; index <= 8; index++)
		tokens[`space-${index}` as ThemeTokenName] = rem(unit * index);
	for (const [name, multiplier] of [
		['sm', 0.8],
		['md', 1],
		['lg', 1.2]
	] as const)
		tokens[`control-height-${name}` as ThemeTokenName] = rem(Math.max(1.5, height * multiplier));
	for (const [name, multiplier] of [
		['sm', 2],
		['md', 3],
		['lg', 4]
	] as const)
		tokens[`control-padding-inline-${name}` as ThemeTokenName] = rem(unit * multiplier);
	tokens['control-gap'] = rem(unit * 2);
	if (source.shape === 'pill') {
		tokens['radius-sm'] = '9999px';
		tokens['radius-md'] = '9999px';
		tokens['radius-lg'] = '1.5rem';
	} else {
		const mediumRadius = { square: 0, soft: 0.375, round: 0.75 }[source.shape];
		tokens['radius-sm'] = rem(mediumRadius / 2);
		tokens['radius-md'] = rem(mediumRadius);
		tokens['radius-lg'] = rem(mediumRadius * 2);
	}
	tokens['radius-pill'] = '9999px';
	const typography = source.typography,
		sizePowers = [-2, -1, 0, 1, 2, 3, 4];
	for (const [index, name] of ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'].entries())
		tokens[`font-size-${name}` as ThemeTokenName] = rem(
			typography.baseSizeRem * typography.scaleRatio ** sizePowers[index]!
		);
	tokens['font-body'] = typography.body;
	tokens['font-display'] = typography.display;
	tokens['font-code'] = typography.code;
	tokens['line-height-tight'] = decimal(typography.headingLineHeight);
	tokens['line-height-body'] = decimal(typography.bodyLineHeight);
	tokens['line-height-loose'] = decimal(Math.min(2, typography.bodyLineHeight + 0.25));
	tokens['font-weight-regular'] = '400';
	tokens['font-weight-medium'] = '500';
	tokens['font-weight-strong'] = '700';
	tokens['letter-spacing-tight'] = '-0.015em';
	tokens['letter-spacing-normal'] = '0em';
	tokens['letter-spacing-wide'] = '0.025em';
	tokens['border-width'] = source.depth === 'flat' ? '0rem' : '0.0625rem';
	tokens['focus-width'] = source.contrast === 'more' ? '0.1875rem' : '0.125rem';
	tokens['focus-offset'] = '0.125rem';
	tokens['shadow-sm'] = source.depth === 'elevated' ? tokens['surface-1-shadow'] : 'none';
	tokens['shadow-md'] = source.depth === 'elevated' ? tokens['surface-2-shadow'] : 'none';
	tokens['shadow-lg'] = source.depth === 'elevated' ? tokens['surface-3-shadow'] : 'none';
	for (const [name, duration] of [
		['fast', 100],
		['base', 180],
		['slow', 280]
	] as const)
		tokens[`duration-${name}` as ThemeTokenName] =
			`${source.motion === 'reduced' ? 0 : duration}ms`;
	tokens['easing-standard'] = 'cubic-bezier(0.2, 0, 0, 1)';
	tokens['easing-emphasized'] = 'cubic-bezier(0.2, 0, 0, 1.2)';
}

function rem(value: number): string {
	return `${decimal(value, 3)}rem`;
}
