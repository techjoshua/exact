import type {
	BuiltInTemperament,
	ResolvedColor,
	ThemeColor,
	ThemeAppearance,
	ThemeSource,
	ThemeResolutionInput,
	ThemeTemperament,
	ThemeWarning
} from './contracts.js';
import { compositeColor, gamutMap, parseThemeColor, resolveColor } from './color.js';
import { ThemeResolutionError } from './errors.js';

const temperamentData: Record<BuiltInTemperament, Omit<ThemeTemperament, 'id'>> = {
	balanced: temperament({
		accentChromaMultiplier: 1,
		accentChromaCap: 0.18,
		neutralChromaCap: 0.018,
		surfaceIntervals: [0.012, 0.014, 0.016],
		stateIntervals: [0.025, 0.05],
		statusHarmonization: 0.15,
		typeScaleMultiplier: 1,
		trackingInterval: 0.025,
		weightIntervals: [100, 300],
		lineHeightDelta: 0,
		spacingExponent: 1,
		controlScaleRatio: 1.2,
		radiusScaleRatio: 2,
		depthScaleRatio: 1,
		motionScaleRatio: 1.6,
		easingTension: 0.2
	}),
	restrained: temperament({
		accentChromaMultiplier: 0.72,
		accentChromaCap: 0.13,
		neutralChromaCap: 0.01,
		surfaceIntervals: [0.008, 0.009, 0.01],
		stateIntervals: [0.018, 0.036],
		statusHarmonization: 0.15,
		typeScaleMultiplier: 0.78,
		trackingInterval: 0.016,
		weightIntervals: [80, 240],
		lineHeightDelta: 0,
		spacingExponent: 0.9,
		controlScaleRatio: 1.12,
		radiusScaleRatio: 1.65,
		depthScaleRatio: 0.72,
		motionScaleRatio: 1.35,
		easingTension: 0.08
	}),
	expressive: temperament({
		accentChromaMultiplier: 1.35,
		accentChromaCap: 0.28,
		neutralChromaCap: 0.03,
		surfaceIntervals: [0.014, 0.019, 0.024],
		stateIntervals: [0.035, 0.075],
		statusHarmonization: 0.04,
		typeScaleMultiplier: 1.32,
		trackingInterval: 0.035,
		weightIntervals: [120, 340],
		lineHeightDelta: -0.03,
		spacingExponent: 1.08,
		controlScaleRatio: 1.3,
		radiusScaleRatio: 2.35,
		depthScaleRatio: 1.22,
		motionScaleRatio: 1.85,
		easingTension: 0.32
	}),
	// Dramatic expands hierarchy and cadence without simply maximizing chroma.
	dramatic: temperament({
		accentChromaMultiplier: 0.88,
		accentChromaCap: 0.18,
		neutralChromaCap: 0.012,
		surfaceIntervals: [0.012, 0.022, 0.034],
		stateIntervals: [0.05, 0.105],
		statusHarmonization: 0.08,
		typeScaleMultiplier: 1.5,
		trackingInterval: 0.045,
		weightIntervals: [120, 400],
		lineHeightDelta: -0.06,
		spacingExponent: 1.16,
		controlScaleRatio: 1.38,
		radiusScaleRatio: 2.7,
		depthScaleRatio: 1.48,
		motionScaleRatio: 2.1,
		easingTension: 0.42
	}),
	soft: temperament({
		accentChromaMultiplier: 0.55,
		accentChromaCap: 0.1,
		neutralChromaCap: 0.025,
		surfaceIntervals: [0.006, 0.007, 0.008],
		stateIntervals: [0.012, 0.024],
		statusHarmonization: 0.25,
		typeScaleMultiplier: 0.72,
		trackingInterval: 0.012,
		weightIntervals: [80, 220],
		lineHeightDelta: 0.1,
		spacingExponent: 0.82,
		controlScaleRatio: 1.1,
		radiusScaleRatio: 1.35,
		depthScaleRatio: 0.58,
		motionScaleRatio: 1.45,
		easingTension: 0.04
	}),
	stark: temperament({
		accentChromaMultiplier: 0.78,
		accentChromaCap: 0.14,
		neutralChromaCap: 0,
		surfaceIntervals: [0.014, 0.026, 0.04],
		stateIntervals: [0.065, 0.12],
		statusHarmonization: 0,
		typeScaleMultiplier: 1.58,
		trackingInterval: 0.05,
		weightIntervals: [150, 450],
		lineHeightDelta: -0.1,
		spacingExponent: 1.22,
		controlScaleRatio: 1.45,
		radiusScaleRatio: 3,
		depthScaleRatio: 1.62,
		motionScaleRatio: 2.25,
		easingTension: 0.5
	}),
	monochrome: temperament({
		accentChromaMultiplier: 0,
		accentChromaCap: 0,
		neutralChromaCap: 0,
		surfaceIntervals: [0.01, 0.016, 0.024],
		stateIntervals: [0.04, 0.08],
		statusHarmonization: 1,
		typeScaleMultiplier: 1.12,
		trackingInterval: 0.02,
		weightIntervals: [100, 300],
		lineHeightDelta: 0,
		spacingExponent: 1,
		controlScaleRatio: 1.22,
		radiusScaleRatio: 2.1,
		depthScaleRatio: 1.08,
		motionScaleRatio: 1.65,
		easingTension: 0.16
	})
};

/** Builds one preset while keeping every cross-axis interval named at publication. */
function temperament(
	values: Omit<ThemeTemperament, 'id' | 'version'>
): Omit<ThemeTemperament, 'id'> {
	return {
		version: 1,
		...values
	};
}

/** Frozen built-in temperament definitions keyed by their public IDs. */
export const builtInTemperaments: Readonly<Record<BuiltInTemperament, ThemeTemperament>> =
	Object.freeze(
		Object.fromEntries(
			Object.entries(temperamentData).map(([id, values]) => [
				id,
				freezeThemeValue({
					id,
					...values
				})
			])
		) as Record<BuiltInTemperament, ThemeTemperament>
	);

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

/** Resolves relative appearance against the parent, or the browser at the root. */
export function selectThemeAppearance(
	value: ThemeSource['appearance'],
	inherited: ThemeAppearance | undefined,
	system: ThemeAppearance
): ThemeAppearance {
	const invert = (appearance: ThemeAppearance): ThemeAppearance =>
		appearance === 'light' ? 'dark' : 'light';
	if (value === 'inverse-system') return invert(system);
	if (value === 'inverse') return invert(inherited ?? system);
	if (value === undefined || value === 'inherit') return inherited ?? system;
	if (value === 'system') return system;
	if (value === 'light' || value === 'dark') return value;
	throw new ThemeResolutionError(
		'invalid-source',
		'source.appearance',
		'Unsupported theme appearance'
	);
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
		statusHarmonization: [0, 1],
		typeScaleMultiplier: [0.5, 1.75],
		trackingInterval: [0, 0.08],
		lineHeightDelta: [-0.2, 0.2],
		spacingExponent: [0.7, 1.35],
		controlScaleRatio: [1.05, 1.6],
		radiusScaleRatio: [1, 4],
		depthScaleRatio: [0.4, 2],
		motionScaleRatio: [1.1, 2.5],
		easingTension: [0, 0.6]
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
	validateIntervalTuple(value.surfaceIntervals, 3, 0.004, 0.06, 'surfaceIntervals');
	validateIntervalTuple(value.stateIntervals, 2, 0.008, 0.14, 'stateIntervals');
	validateIntervalTuple(value.weightIntervals, 2, 0, 500, 'weightIntervals');
	if (value.stateIntervals[1] <= value.stateIntervals[0])
		throw new ThemeResolutionError(
			'invalid-temperament',
			'source.temperament.stateIntervals',
			'Temperament active-state interval must exceed its hover interval'
		);
	return freezeThemeValue({ ...value });
}

/** Validates one fixed-length interval family before it participates in token arithmetic. */
function validateIntervalTuple(
	value: readonly number[],
	length: number,
	low: number,
	high: number,
	name: string
): void {
	if (
		!Array.isArray(value) ||
		value.length !== length ||
		value.some((number) => !Number.isFinite(number) || number < low || number > high)
	)
		throw new ThemeResolutionError(
			'invalid-temperament',
			`source.temperament.${name}`,
			`Temperament ${name} must contain ${length} values within ${low}..${high}`
		);
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

/** Recursively freezes a resolved theme value at its construction boundary. */
export function freezeThemeValue<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value as object)) freezeThemeValue(child);
		Object.freeze(value);
	}
	return value;
}
