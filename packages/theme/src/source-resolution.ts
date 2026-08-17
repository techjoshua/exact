import type {
	BuiltInTemperament,
	ResolvedColor,
	ResolvedThemeTypography,
	ThemeColor,
	ThemeResolutionInput,
	ThemeTemperament,
	ThemeTypography,
	ThemeWarning,
	TypographyPreset
} from './contracts.js';
import { compositeColor, gamutMap, parseThemeColor, resolveColor } from './color.js';
import { ThemeResolutionError } from './errors.js';

const SYSTEM_CODE = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace';
const SYSTEM_BODY =
	'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const temperamentData: Record<
	BuiltInTemperament,
	readonly [number, number, number, number, number, number]
> = {
	balanced: [1, 0.18, 0.018, 0.025, 0.04, 0.15],
	restrained: [0.72, 0.13, 0.01, 0.018, 0.03, 0.25],
	expressive: [1.22, 0.25, 0.03, 0.035, 0.055, 0.08],
	dramatic: [1.05, 0.21, 0.02, 0.055, 0.07, 0.12],
	soft: [0.62, 0.11, 0.022, 0.014, 0.025, 0.3],
	stark: [0.88, 0.16, 0, 0.07, 0.08, 0],
	monochrome: [0, 0, 0, 0.035, 0.05, 1]
};

/** Frozen built-in temperament definitions keyed by their public IDs. */
export const builtInTemperaments: Readonly<Record<BuiltInTemperament, ThemeTemperament>> =
	Object.freeze(
		Object.fromEntries(
			Object.entries(temperamentData).map(([id, values]) => [
				id,
				Object.freeze({
					id,
					version: 1,
					accentChromaMultiplier: values[0],
					accentChromaCap: values[1],
					neutralChromaCap: values[2],
					surfaceInterval: values[3],
					stateInterval: values[4],
					statusHarmonization: values[5]
				})
			])
		) as Record<BuiltInTemperament, ThemeTemperament>
	);

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

/** Validates the explicit environment boundary supplied to pure resolution. */
export function validateThemeEnvironment(environment: ThemeResolutionInput['environment']): void {
	if (
		!['light', 'dark'].includes(environment.appearance) ||
		!['standard', 'more'].includes(environment.contrast) ||
		!['full', 'reduced'].includes(environment.motion)
	)
		throw new ThemeResolutionError(
			'invalid-source',
			'environment',
			'Unsupported theme system preference'
		);
}

/** Selects one inherited, system, explicit, or root-default source axis. */
export function selectThemeAxis<T extends string>(
	value: T | 'inherit' | 'system' | undefined,
	inherited: T | undefined,
	fallback: T
): T {
	return value === undefined || value === 'inherit'
		? (inherited ?? fallback)
		: value === 'system'
			? fallback
			: value;
}

/** Resolves and validates a named or custom data-only temperament. */
export function resolveTemperament(value: BuiltInTemperament | ThemeTemperament): ThemeTemperament {
	if (typeof value === 'string') {
		const found = builtInTemperaments[value];
		if (!found)
			throw new ThemeResolutionError(
				'invalid-temperament',
				'source.temperament',
				`Unknown temperament ${value}`
			);
		return found;
	}
	const ranges = {
		accentChromaMultiplier: [0, 1.5],
		accentChromaCap: [0, 0.32],
		neutralChromaCap: [0, 0.06],
		surfaceInterval: [0.01, 0.1],
		stateInterval: [0.015, 0.12],
		statusHarmonization: [0, 1]
	} as const;
	if (
		!value ||
		!value.id ||
		value.id.length > 256 ||
		/[\x00-\x1f\x7f]/.test(value.id) ||
		!Number.isSafeInteger(value.version) ||
		value.version < 1
	)
		throw new ThemeResolutionError(
			'invalid-temperament',
			'source.temperament',
			'Invalid custom temperament identity'
		);
	for (const [name, [low, high]] of Object.entries(ranges)) {
		const number = value[name as keyof typeof ranges];
		if (typeof number !== 'number' || !Number.isFinite(number) || number < low || number > high)
			throw new ThemeResolutionError(
				'invalid-temperament',
				`source.temperament.${name}`,
				`Temperament ${name} is outside ${low}..${high}`
			);
	}
	return freezeThemeValue({ ...value });
}

/** Resolves one system-safe typography preset or validates a complete custom scale. */
export function resolveTypography(
	value: 'inherit' | TypographyPreset | ThemeTypography | ResolvedThemeTypography
): ResolvedThemeTypography {
	if (typeof value === 'string') {
		if (value === 'inherit') value = 'system';
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
	if ('id' in value) return value;
	for (const name of ['body', 'display', 'code'] as const)
		validateFont(value[name], `source.typography.${name}`);
	for (const [name, low, high] of [
		['baseSizeRem', 0.875, 1.25],
		['scaleRatio', 1.067, 1.333],
		['bodyLineHeight', 1.2, 2],
		['headingLineHeight', 1, 1.5]
	] as const) {
		const number = value[name];
		if (!Number.isFinite(number) || number < low || number > high)
			throw new ThemeResolutionError(
				'invalid-typography',
				`source.typography.${name}`,
				`${name} is outside ${low}..${high}`
			);
	}
	return freezeThemeValue({ id: 'custom', ...value });
}

/** Parses, composites, gamut-maps, and diagnoses one authored source color. */
export function resolveSourceColor(
	value: ThemeColor,
	path: string,
	background: ResolvedColor | undefined,
	warnings: ThemeWarning[]
): ResolvedColor {
	const parsed = parseThemeColor(value, path);
	if (parsed.alpha < 1 && !background)
		throw new ThemeResolutionError(
			'invalid-color',
			path,
			`Translucent root ${path} requires an explicit opaque canvasColor`
		);
	const composited = parsed.alpha < 1 ? compositeColor(parsed, background!) : parsed;
	const mapped = gamutMap(composited);
	if (composited.c - mapped.c >= 0.000005)
		warnings.push(
			Object.freeze({
				code: 'source-gamut-mapped',
				path,
				message: `${path} chroma was reduced to fit sRGB`
			})
		);
	return resolveColor(mapped);
}

/** Recognizes an already canonical color inherited from a resolved parent source. */
export function isResolvedColor(value: unknown): value is ResolvedColor {
	return !!value && typeof value === 'object' && 'oklch' in value && 'css' in value;
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

/** Recursively freezes a resolved theme value at its construction boundary. */
export function freezeThemeValue<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value as object)) freezeThemeValue(child);
		Object.freeze(value);
	}
	return value;
}
