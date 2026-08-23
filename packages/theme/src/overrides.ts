import type {
	ThemeCustomProperty,
	ThemeDimension,
	ThemeEasing,
	ThemeOverrideTokens,
	ThemeShadow,
	ThemeTokenDescriptor,
	ThemeTokenName,
	ThemeVariableMap
} from './contracts.js';
import { decimal, parseThemeColor, resolveColor } from './color.js';
import { ThemeResolutionError } from './errors.js';
import { exactThemeContract } from './token-contract.js';

/** Validates and serializes a sparse override as an atomic custom-property map. */
export function serializeThemeOverrides(tokens: ThemeOverrideTokens): Partial<ThemeVariableMap> {
	if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens))
		throw invalid('tokens', 'Theme override tokens must be an object');
	const output = Object.create(null) as Record<ThemeCustomProperty, string>;
	for (const name of Object.keys(tokens).sort()) {
		const descriptor = exactThemeContract.tokens[name as ThemeTokenName];
		if (!descriptor) throw invalid(`tokens.${name}`, `Unknown exact-theme/1 token ${name}`);
		output[descriptor.cssName] = serializeValue(
			name as ThemeTokenName,
			descriptor,
			(tokens as Record<string, unknown>)[name]
		);
	}
	return Object.freeze(output);
}

/** Creates the validated style payload accepted by the `theme:override` enhancement. */
export function createThemeOverride(tokens: ThemeOverrideTokens): string {
	return themeStyleAttribute(serializeThemeOverrides(tokens));
}

function serializeValue(
	name: ThemeTokenName,
	descriptor: ThemeTokenDescriptor,
	value: unknown
): string {
	switch (descriptor.kind) {
		case 'color': {
			const parsed = parseThemeColor(value as never, `tokens.${name}`);
			if (parsed.alpha !== 1)
				throw invalid(`tokens.${name}`, 'Standalone color overrides must be opaque');
			return resolveColor(parsed).css;
		}
		case 'dimension':
			return serializeDimension(value as ThemeDimension, name, descriptor.minimum !== undefined);
		case 'number': {
			if (
				typeof value !== 'number' ||
				!Number.isFinite(value) ||
				value < (descriptor.minimum ?? -Infinity) ||
				value > (descriptor.maximum ?? Infinity) ||
				(name.startsWith('font-weight-') && !Number.isInteger(value))
			)
				throw invalid(`tokens.${name}`, `Invalid numeric override for ${name}`);
			return decimal(value);
		}
		case 'font-family': {
			if (
				typeof value !== 'string' ||
				!value.trim() ||
				value.length > 2048 ||
				/[{};\x00-\x1f\x7f]|\/\*/.test(value)
			)
				throw invalid(`tokens.${name}`, `Unsafe font-family override for ${name}`);
			return value.trim();
		}
		case 'duration': {
			const milliseconds = (value as { milliseconds?: unknown })?.milliseconds;
			if (
				typeof milliseconds !== 'number' ||
				!Number.isFinite(milliseconds) ||
				milliseconds < 0 ||
				milliseconds > 10000
			)
				throw invalid(`tokens.${name}`, `Invalid duration override for ${name}`);
			return `${decimal(milliseconds)}ms`;
		}
		case 'easing':
			return serializeEasing(value as ThemeEasing, name);
		case 'shadow':
			return serializeShadow(value as ThemeShadow, name);
	}
}

function serializeDimension(value: ThemeDimension, name: string, nonnegative: boolean): string {
	if (
		!value ||
		typeof value.value !== 'number' ||
		!Number.isFinite(value.value) ||
		Math.abs(value.value) > 1000 ||
		!['px', 'rem', 'em'].includes(value.unit) ||
		(nonnegative && value.value < 0)
	)
		throw invalid(`tokens.${name}`, `Invalid dimension override for ${name}`);
	return `${decimal(value.value)}${value.unit}`;
}
function serializeEasing(value: ThemeEasing, name: string): string {
	if (
		!value ||
		value.kind !== 'cubic-bezier' ||
		![value.x1, value.y1, value.x2, value.y2].every(Number.isFinite) ||
		value.x1 < 0 ||
		value.x1 > 1 ||
		value.x2 < 0 ||
		value.x2 > 1 ||
		value.y1 < -10 ||
		value.y1 > 10 ||
		value.y2 < -10 ||
		value.y2 > 10
	)
		throw invalid(`tokens.${name}`, `Invalid easing override for ${name}`);
	return `cubic-bezier(${decimal(value.x1)}, ${decimal(value.y1)}, ${decimal(value.x2)}, ${decimal(value.y2)})`;
}
function serializeShadow(value: ThemeShadow, name: string): string {
	if (value === 'none') return value;
	if (!Array.isArray(value) || value.length > 8)
		throw invalid(`tokens.${name}`, `Shadow ${name} must have at most eight layers`);
	return value
		.map((layer, index) => {
			const path = `tokens.${name}.${index}`;
			if (!layer || typeof layer !== 'object') throw invalid(path, 'Invalid shadow layer');
			const parsed = parseThemeColor(layer.color, `${path}.color`),
				color = resolveColor(parsed);
			const colorCss =
				parsed.alpha === 1 ? color.css : color.css.replace(/\)$/, ` / ${decimal(parsed.alpha)})`);
			return [
				layer.inset ? 'inset' : '',
				serializeDimension(layer.x, `${path}.x`, false),
				serializeDimension(layer.y, `${path}.y`, false),
				serializeDimension(layer.blur, `${path}.blur`, true),
				serializeDimension(
					layer.spread ?? { value: 0, unit: layer.blur.unit },
					`${path}.spread`,
					false
				),
				colorCss
			]
				.filter(Boolean)
				.join(' ');
		})
		.join(', ');
}
function invalid(path: string, message: string): ThemeResolutionError {
	return new ThemeResolutionError('invalid-override', path, message);
}

/**
 * Joins a sorted variable map into the single style attribute owned by a theme scope.
 * @exact pure
 */
export function themeStyleAttribute(map: Readonly<Record<string, string>>): string {
	return Object.keys(map)
		.sort()
		.map((name) => `${name}:${map[name]}`)
		.join(';');
}
