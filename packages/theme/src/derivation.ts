import type { ResolvedColor, ResolvedTheme, ThemeColor, ThemeTone } from './contracts.js';
import type {
	DataColorRequest,
	DataColorResult,
	ThemeDerivationContext,
	ThemeDeriver,
	TonalPalette
} from './derivation-contracts.js';
import {
	compositeColor,
	contrastRatio,
	ensureColorContrast,
	harmonizeHue,
	parseThemeColor,
	resolveColor
} from './color.js';

/** Validates and freezes a deterministic exterior theme-deriver definition. */
export function createThemeDeriver<Input, Output>(
	definition: ThemeDeriver<Input, Output>
): ThemeDeriver<Input, Output> {
	if (
		!definition ||
		typeof definition.id !== 'string' ||
		!definition.id ||
		definition.id.length > 256 ||
		/[\x00-\x1f\x7f]/.test(definition.id) ||
		!Number.isSafeInteger(definition.version) ||
		definition.version < 1 ||
		typeof definition.derive !== 'function'
	)
		throw new TypeError(
			'A theme deriver requires a bounded ID, positive safe-integer version, and derive function'
		);
	return Object.freeze({ ...definition });
}

/** Runs one exterior deriver against immutable exact-theme/1 primitives. */
export function deriveTheme<Input, Output>(
	theme: ResolvedTheme,
	deriver: ThemeDeriver<Input, Output>,
	input: Readonly<Input>
): Readonly<Output> {
	if (theme?.contract !== 'exact-theme/1')
		throw new TypeError('deriveTheme requires exact-theme/1');
	if (!deriver || typeof deriver.derive !== 'function')
		throw new TypeError('Invalid theme deriver');
	const output = deriver.derive(createContext(theme), input);
	validateDeriverOutput(output, new Set());
	return deepFreeze(output);
}

function createContext(theme: ResolvedTheme): ThemeDerivationContext {
	const parse = (value: ThemeColor | ResolvedColor, background?: ResolvedColor) => {
		if (isResolved(value)) return value;
		const parsed = parseThemeColor(value);
		return resolveColor(
			parsed.alpha < 1 ? compositeColor(parsed, background ?? theme.surfaces[0].background) : parsed
		);
	};
	return Object.freeze({
		contract: 'exact-theme/1' as const,
		sourceFingerprint: theme.fingerprint,
		appearance: theme.source.appearance,
		contrast: theme.source.contrast,
		key: theme.key,
		neutral: theme.neutral,
		surfaces: theme.surfaces,
		tones: theme.tones,
		tonalPalette(input: ResolvedColor | ThemeTone): TonalPalette {
			const color = typeof input === 'string' ? theme.tones[input].solid : input;
			return Object.freeze({
				hue: color.oklch.h,
				chroma: color.oklch.c,
				at(tone: number) {
					if (!Number.isFinite(tone) || tone < 0 || tone > 100)
						throw new RangeError('Palette tone must be within 0..100');
					return resolveColor({ l: tone / 100, c: color.oklch.c, h: color.oklch.h });
				}
			});
		},
		harmonize(color: ThemeColor | ResolvedColor, amount: number) {
			if (!Number.isFinite(amount) || amount < 0 || amount > 1)
				throw new RangeError('Harmonization amount must be within 0..1');
			const value = parse(color);
			return resolveColor({
				l: value.oklch.l,
				c: value.oklch.c,
				h: harmonizeHue(value.oklch.h, theme.key.oklch.h, amount)
			});
		},
		ensureContrast(
			foreground: ThemeColor | ResolvedColor,
			backgrounds: readonly (ThemeColor | ResolvedColor)[],
			ratio: number
		) {
			if (!backgrounds.length || !Number.isFinite(ratio) || ratio < 1 || ratio > 21)
				throw new RangeError('Contrast derivation requires backgrounds and a ratio within 1..21');
			const values = backgrounds.map((value) => parse(value));
			const color = parse(foreground, values[0]);
			return ensureColorContrast(color.oklch, values, ratio, theme.source.appearance).color;
		},
		toCss(color: ThemeColor | ResolvedColor) {
			return parse(color).css;
		}
	});
}

/** Derives deterministic categorical, sequential, or diverging chart colors. */
export function deriveDataColors(theme: ResolvedTheme, request: DataColorRequest): DataColorResult {
	if (theme?.contract !== 'exact-theme/1')
		throw new TypeError('deriveDataColors requires exact-theme/1');
	validateRequest(request);
	const surface = theme.surfaces[request.surface ?? 0];
	let colors: ResolvedColor[],
		warnings: Array<{ code: 'categorical-distance'; message: string }> = [];
	if (request.kind === 'categorical')
		({ colors, warnings } = categorical(
			theme,
			request.count,
			surface.background,
			request.emphasis
		));
	else if (request.kind === 'sequential')
		colors = sequential(
			theme,
			request.steps,
			request.source ?? 'accent',
			surface.background,
			request.direction
		);
	else colors = diverging(theme, request, surface.background);
	const strokes = colors.map((color, index) =>
		request.kind === 'diverging' && index === Math.floor(colors.length / 2)
			? surface.borderStrong
			: color
	);
	const foregrounds = colors.map(foregroundFor);
	const patterns = ['solid', 'diagonal', 'crosshatch', 'dots'] as const;
	return deepFreeze({
		colors: colors.map((x) => x.css),
		foregrounds: foregrounds.map((x) => x.css),
		strokes: strokes.map((x) => x.css),
		recommendedPatterns: colors.map((_, index) => patterns[index % patterns.length]!),
		warnings
	});
}

function categorical(
	theme: ResolvedTheme,
	count: number,
	background: ResolvedColor,
	emphasis: 'balanced' | 'accent-first' = 'balanced'
): { colors: ResolvedColor[]; warnings: Array<{ code: 'categorical-distance'; message: string }> } {
	const candidates: Array<{ index: number; color: ResolvedColor }> = [],
		accepted: Array<{ index: number; color: ResolvedColor }> = [];
	for (let k = 0; k < 72; k++) {
		const hue = harmonizeHue(
			theme.tones.accent.solid.oklch.h +
				(emphasis === 'balanced' ? 137.507764 / 2 : 0) +
				k * 137.507764,
			theme.key.oklch.h,
			theme.source.temperament.statusHarmonization
		);
		// Both appearances move the alternating band toward higher lightness. Moving light themes
		// downward made the second golden-angle hue muddy brown or olive for most tonic presets.
		const lightness = (theme.source.appearance === 'light' ? [0.48, 0.62] : [0.68, 0.82])[k % 2]!;
		const color = ensureColorContrast(
			{ l: lightness, c: theme.tones.accent.solid.oklch.c, h: hue },
			[background],
			3,
			theme.source.appearance
		).color;
		const candidate = { index: k, color };
		candidates.push(candidate);
		if (accepted.length === 0 || accepted.every((item) => oklabDistance(item.color, color) >= 0.08))
			accepted.push(candidate);
		if (accepted.length === count) return { colors: accepted.map((x) => x.color), warnings: [] };
	}
	const remaining = candidates.filter((candidate) => !accepted.includes(candidate));
	while (accepted.length < count && remaining.length) {
		remaining.sort(
			(a, b) =>
				minimumDistance(
					b.color,
					accepted.map((x) => x.color)
				) -
					minimumDistance(
						a.color,
						accepted.map((x) => x.color)
					) || a.index - b.index
		);
		accepted.push(remaining.shift()!);
	}
	return {
		colors: accepted.slice(0, count).map((x) => x.color),
		warnings: [
			{
				code: 'categorical-distance',
				message:
					'Requested series exceed the exact-theme/1 categorical distance target; use patterns or labels.'
			}
		]
	};
}
function sequential(
	theme: ResolvedTheme,
	steps: number,
	source: ThemeTone | ThemeColor,
	background: ResolvedColor,
	direction: 'low-to-high' | 'high-to-low' = 'low-to-high'
): ResolvedColor[] {
	const base =
		typeof source === 'string' && source in theme.tones
			? theme.tones[source as ThemeTone].solid
			: resolveColor(compositeColor(parseThemeColor(source as ThemeColor), background));
	const findBoundary = (start: number, direction: 1 | -1) => {
		for (let index = start; index >= 0 && index <= 1000; index += direction) {
			const color = resolveColor({ l: index / 1000, c: base.oklch.c, h: base.oklch.h });
			if (contrastRatio(color, background) >= 3) return color;
		}
		return undefined;
	};
	const first = findBoundary(0, 1) ?? resolveColor({ l: 0, c: base.oklch.c, h: base.oklch.h }),
		last = findBoundary(1000, -1) ?? resolveColor({ l: 1, c: base.oklch.c, h: base.oklch.h });
	const output = Array.from({ length: steps }, (_, index) =>
		resolveColor({
			l: first.oklch.l + ((last.oklch.l - first.oklch.l) * index) / (steps - 1),
			c: base.oklch.c,
			h: base.oklch.h
		})
	);
	return direction === 'high-to-low' ? output.reverse() : output;
}
function diverging(
	theme: ResolvedTheme,
	request: Extract<DataColorRequest, { kind: 'diverging' }>,
	background: ResolvedColor
): ResolvedColor[] {
	const side = (request.steps - 1) / 2,
		negative = sequential(
			theme,
			side + 1,
			request.negative ?? 'danger',
			background,
			'high-to-low'
		).slice(0, side),
		positive = sequential(theme, side + 1, request.positive ?? 'success', background).slice(1);
	const midpoint =
		request.midpoint === undefined || request.midpoint === 'surface'
			? background
			: resolveColor(compositeColor(parseThemeColor(request.midpoint), background));
	return [...negative, midpoint, ...positive];
}
function foregroundFor(color: ResolvedColor): ResolvedColor {
	const white = resolveColor({ l: 0.98, c: 0, h: 0 }),
		black = resolveColor({ l: 0.12, c: 0, h: 0 });
	return contrastRatio(color, white) >= contrastRatio(color, black) ? white : black;
}
function oklab(color: ResolvedColor): readonly [number, number, number] {
	const angle = (color.oklch.h * Math.PI) / 180;
	return [color.oklch.l, color.oklch.c * Math.cos(angle), color.oklch.c * Math.sin(angle)];
}
function oklabDistance(a: ResolvedColor, b: ResolvedColor): number {
	const x = oklab(a),
		y = oklab(b);
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
function minimumDistance(color: ResolvedColor, values: ResolvedColor[]): number {
	return Math.min(...values.map((value) => oklabDistance(color, value)));
}
function validateRequest(request: DataColorRequest): void {
	if (
		!request ||
		typeof request !== 'object' ||
		!['categorical', 'sequential', 'diverging'].includes(request.kind)
	)
		throw new TypeError('Data color request is required');
	const count = request.kind === 'categorical' ? request.count : request.steps;
	const valid =
		request.kind === 'categorical'
			? Number.isInteger(count) && count >= 1 && count <= 12
			: request.kind === 'sequential'
				? Number.isInteger(count) && count >= 2 && count <= 12
				: [3, 5, 7, 9, 11].includes(count);
	if (!valid) throw new RangeError('Data color count is outside the supported range');
	if (request.surface !== undefined && ![0, 1, 2, 3, 'sunken', 'overlay'].includes(request.surface))
		throw new RangeError('Unknown data-color surface');
	if (
		request.kind === 'categorical' &&
		request.emphasis !== undefined &&
		!['balanced', 'accent-first'].includes(request.emphasis)
	)
		throw new TypeError('Unknown categorical emphasis');
	if (
		request.kind === 'sequential' &&
		request.direction !== undefined &&
		!['low-to-high', 'high-to-low'].includes(request.direction)
	)
		throw new TypeError('Unknown sequential direction');
}
function validateDeriverOutput(value: unknown, seen: Set<object>): void {
	if (!value || typeof value !== 'object') return;
	if (seen.has(value)) throw new TypeError('Theme deriver output must be an acyclic data value');
	if ((value as { contract?: unknown }).contract === 'exact-theme/1')
		throw new TypeError('Theme derivers may not return mutable theme objects');
	seen.add(value);
	for (const [key, child] of Object.entries(value)) {
		if (key.startsWith('--exact-theme-'))
			throw new TypeError('Theme derivers may not publish reserved CSS variables');
		validateDeriverOutput(child, seen);
	}
	seen.delete(value);
}
function isResolved(value: unknown): value is ResolvedColor {
	return !!value && typeof value === 'object' && 'oklch' in value && 'css' in value;
}
function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value as object)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
