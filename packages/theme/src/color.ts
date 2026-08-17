import colorNames from 'color-name';
import type { OklchColor, ResolvedColor, ThemeAppearance, ThemeColor } from './contracts.js';
import { ThemeResolutionError } from './errors.js';

/** Internal color before source-alpha compositing. */
export type ParsedColor = Readonly<{ l: number; c: number; h: number; alpha: number }>;

const radians = Math.PI / 180;
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Parses a context-free CSS Color 4 or DTCG color without consulting the browser. */
export function parseThemeColor(value: ThemeColor, path = 'color'): ParsedColor {
	try {
		const parsed = typeof value === 'string' ? parseCssColor(value) : parseDtcgColor(value);
		if (
			![parsed.l, parsed.c, parsed.h, parsed.alpha].every(Number.isFinite) ||
			parsed.alpha < 0 ||
			parsed.alpha > 1
		)
			throw new Error('non-finite or out-of-range component');
		const c = parsed.c < 0.000005 ? 0 : parsed.c;
		return Object.freeze({
			l: parsed.l,
			c,
			h: c === 0 ? 0 : normalizeHue(parsed.h),
			alpha: parsed.alpha
		});
	} catch (cause) {
		if (cause instanceof ThemeResolutionError) throw cause;
		throw new ThemeResolutionError(
			'invalid-color',
			path,
			`Invalid context-free theme color at ${path}`
		);
	}
}

function parseDtcgColor(value: Exclude<ThemeColor, string>): ParsedColor {
	if (!value || !Array.isArray(value.components) || value.components.length !== 3)
		throw new Error('components');
	const components = value.components.map((part) => (part === 'none' ? 0 : part));
	if (!components.every((part) => typeof part === 'number' && Number.isFinite(part)))
		throw new Error('components');
	const alpha = value.alpha ?? 1;
	if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error('alpha');
	const [a, b, c] = components as [number, number, number];
	if (value.colorSpace === 'oklch') return { l: a, c: b, h: c, alpha };
	if (value.colorSpace === 'oklab') return oklabToOklch(a, b, c, alpha);
	if (value.colorSpace === 'srgb') return srgbToOklch(a, b, c, alpha);
	return p3ToOklch(a, b, c, alpha);
}

function parseCssColor(source: string): ParsedColor {
	const text = source.trim().toLowerCase();
	if (!text || /(?:var\(|currentcolor|color-mix\(|from\s)/.test(text)) throw new Error('context');
	if (text === 'transparent') return srgbToOklch(0, 0, 0, 0);
	const named = colorNames[text];
	if (named) return srgbToOklch(named[0] / 255, named[1] / 255, named[2] / 255, 1);
	if (text.startsWith('#')) return parseHex(text);
	const match = /^([a-z-]+)\((.*)\)$/.exec(text);
	if (!match) throw new Error('syntax');
	const name = match[1]!;
	const body = match[2]!.trim();
	if (name === 'rgb' || name === 'rgba') return parseRgb(body);
	if (name === 'hsl' || name === 'hsla') return parseHsl(body);
	if (name === 'hwb') return parseHwb(body);
	if (name === 'oklch') return parseOklch(body);
	if (name === 'oklab') return parseOklab(body);
	if (name === 'lab') return parseLab(body);
	if (name === 'lch') return parseLch(body);
	if (name === 'color') return parseColorFunction(body);
	throw new Error('unsupported');
}

function parseHex(text: string): ParsedColor {
	const value = text.slice(1);
	if (![3, 4, 6, 8].includes(value.length) || !/^[0-9a-f]+$/.test(value)) throw new Error('hex');
	const expanded = value.length < 5 ? [...value].map((x) => x + x).join('') : value;
	const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1;
	return srgbToOklch(
		Number.parseInt(expanded.slice(0, 2), 16) / 255,
		Number.parseInt(expanded.slice(2, 4), 16) / 255,
		Number.parseInt(expanded.slice(4, 6), 16) / 255,
		alpha
	);
}

function splitFunctional(body: string): { parts: string[]; alpha: number } {
	const slash = body.split('/');
	if (slash.length > 2) throw new Error('alpha');
	const comma = slash[0]!.includes(',');
	const parts = comma ? slash[0]!.split(',').map((x) => x.trim()) : slash[0]!.trim().split(/\s+/);
	let alphaText = slash[1]?.trim();
	if (comma && parts.length === 4) alphaText = parts.pop()!;
	const alpha = alphaText === undefined ? 1 : percentageOrNumber(alphaText, 1);
	if (parts.length !== 3 || alpha < 0 || alpha > 1) throw new Error('parts');
	return { parts, alpha };
}

function number(text: string): number {
	if (text === 'none') return 0;
	const value = Number(text);
	if (!Number.isFinite(value)) throw new Error('number');
	return value;
}
function percentageOrNumber(text: string, percentageScale: number): number {
	return text.endsWith('%') ? (number(text.slice(0, -1)) * percentageScale) / 100 : number(text);
}
function angle(text: string): number {
	if (text === 'none') return 0;
	const match = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(text);
	if (!match) throw new Error('angle');
	const value = Number(match[1]);
	return match[2] === 'rad'
		? value / radians
		: match[2] === 'grad'
			? value * 0.9
			: match[2] === 'turn'
				? value * 360
				: value;
}

function parseRgb(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	const channels = parts.map((x) => (x.endsWith('%') ? percentageOrNumber(x, 1) : number(x) / 255));
	return srgbToOklch(clamp(channels[0]!), clamp(channels[1]!), clamp(channels[2]!), alpha);
}
function parseHsl(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	const h = normalizeHue(angle(parts[0]!));
	const s = clamp(percentageOrNumber(parts[1]!, 1));
	const l = clamp(percentageOrNumber(parts[2]!, 1));
	const a = s * Math.min(l, 1 - l);
	const channel = (n: number) =>
		l - a * Math.max(-1, Math.min(((n + h / 30) % 12) - 3, 9 - ((n + h / 30) % 12), 1));
	return srgbToOklch(channel(0), channel(8), channel(4), alpha);
}
function parseHwb(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	const w = percentageOrNumber(parts[1]!, 1),
		b = percentageOrNumber(parts[2]!, 1);
	if (w + b >= 1) return srgbToOklch(w / (w + b), w / (w + b), w / (w + b), alpha);
	const pure = oklchToSrgb(parseHsl(`${parts[0]} 100% 50%`));
	const factor = 1 - w - b;
	return srgbToOklch(pure[0] * factor + w, pure[1] * factor + w, pure[2] * factor + w, alpha);
}
function parseOklch(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	return {
		l: percentageOrNumber(parts[0]!, 1),
		c: percentageOrNumber(parts[1]!, 0.4),
		h: angle(parts[2]!),
		alpha
	};
}
function parseOklab(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	return oklabToOklch(
		percentageOrNumber(parts[0]!, 1),
		percentageOrNumber(parts[1]!, 0.4),
		percentageOrNumber(parts[2]!, 0.4),
		alpha
	);
}
function parseLab(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	return labD50ToOklch(
		percentageOrNumber(parts[0]!, 100),
		percentageOrNumber(parts[1]!, 125),
		percentageOrNumber(parts[2]!, 125),
		alpha
	);
}
function parseLch(body: string): ParsedColor {
	const { parts, alpha } = splitFunctional(body);
	const l = percentageOrNumber(parts[0]!, 100),
		c = percentageOrNumber(parts[1]!, 150),
		h = angle(parts[2]!);
	return labD50ToOklch(l, c * Math.cos(h * radians), c * Math.sin(h * radians), alpha);
}
function parseColorFunction(body: string): ParsedColor {
	const firstSpace = body.search(/\s/);
	if (firstSpace < 0) throw new Error('color');
	const space = body.slice(0, firstSpace),
		rest = body.slice(firstSpace + 1);
	const { parts, alpha } = splitFunctional(rest);
	const channels = parts.map(number);
	if (space === 'srgb') return srgbToOklch(channels[0]!, channels[1]!, channels[2]!, alpha);
	if (space === 'display-p3') return p3ToOklch(channels[0]!, channels[1]!, channels[2]!, alpha);
	throw new Error('profile');
}

function srgbToLinear(value: number): number {
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(value: number): number {
	return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}
function srgbToOklch(r: number, g: number, b: number, alpha: number): ParsedColor {
	return linearSrgbToOklch(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), alpha);
}
function linearSrgbToOklch(r: number, g: number, b: number, alpha: number): ParsedColor {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return oklabToOklch(
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
		alpha
	);
}
function oklabToOklch(l: number, a: number, b: number, alpha: number): ParsedColor {
	const c = Math.hypot(a, b);
	return { l, c, h: c < 0.000005 ? 0 : normalizeHue(Math.atan2(b, a) / radians), alpha };
}
function p3ToOklch(r: number, g: number, b: number, alpha: number): ParsedColor {
	r = srgbToLinear(r);
	g = srgbToLinear(g);
	b = srgbToLinear(b);
	const x = 0.4865709486 * r + 0.2656676932 * g + 0.1982172852 * b;
	const y = 0.2289745641 * r + 0.6917385218 * g + 0.0792869141 * b;
	const z = 0 * r + 0.0451133819 * g + 1.0439443689 * b;
	return xyzD65ToOklch(x, y, z, alpha);
}
function xyzD65ToOklch(x: number, y: number, z: number, alpha: number): ParsedColor {
	return linearSrgbToOklch(
		3.240969942 * x - 1.5373831776 * y - 0.4986107603 * z,
		-0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z,
		0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z,
		alpha
	);
}
function labD50ToOklch(l: number, a: number, b: number, alpha: number): ParsedColor {
	const f1 = (l + 16) / 116,
		f0 = a / 500 + f1,
		f2 = f1 - b / 200;
	const inverse = (v: number) => (v ** 3 > 216 / 24389 ? v ** 3 : (116 * v - 16) / (24389 / 27));
	const x50 = inverse(f0) * 0.96422,
		y50 = inverse(f1),
		z50 = inverse(f2) * 0.82521;
	const x = 0.9555766 * x50 - 0.0230393 * y50 + 0.0631636 * z50;
	const y = -0.0282895 * x50 + 1.0099416 * y50 + 0.0210077 * z50;
	const z = 0.0122982 * x50 - 0.020483 * y50 + 1.3299098 * z50;
	return xyzD65ToOklch(x, y, z, alpha);
}

/** Converts an OKLCH triple to nonlinear sRGB without clamping. */
export function oklchToSrgb(lch: OklchColor | ParsedColor): readonly [number, number, number] {
	const a = lch.c * Math.cos(lch.h * radians),
		b = lch.c * Math.sin(lch.h * radians);
	const l = (lch.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lch.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lch.l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
	];
}

/** Applies exact-theme/1's fixed-iteration chroma gamut map. */
export function gamutMap(input: Pick<ParsedColor, 'l' | 'c' | 'h'>): OklchColor {
	const l = clamp(input.l),
		h = normalizeHue(input.h),
		initial = Math.max(0, input.c);
	const inGamut = (c: number) =>
		oklchToSrgb({ l, c, h, alpha: 1 }).every((x) => x >= -0.0000001 && x <= 1.0000001);
	let c = initial;
	if (!inGamut(c)) {
		let low = 0,
			high = c;
		for (let index = 0; index < 24; index++) {
			const mid = (low + high) / 2;
			if (inGamut(mid)) low = mid;
			else high = mid;
		}
		c = low;
	}
	if (c < 0.000005) return Object.freeze({ l, c: 0, h: 0, alpha: 1 as const });
	return Object.freeze({ l, c, h, alpha: 1 as const });
}

/** Creates the canonical inspected form of a gamut-mapped color. */
export function resolveColor(input: Pick<ParsedColor, 'l' | 'c' | 'h'>): ResolvedColor {
	const oklch = gamutMap(input);
	const rgb = oklchToSrgb(oklch).map((x) => Math.floor(clamp(x) * 255 + 0.5)) as [
		number,
		number,
		number
	];
	return Object.freeze({
		oklch,
		srgb: Object.freeze(rgb),
		css: `oklch(${decimal(oklch.l, 5)} ${decimal(oklch.c, 5)} ${decimal(oklch.h, 3)})`
	});
}

/** Composites a translucent source over an opaque background in linear-light sRGB. */
export function compositeColor(source: ParsedColor, background: ResolvedColor): ParsedColor {
	if (source.alpha === 1) return source;
	const foreground = oklchToSrgb(source).map(srgbToLinear);
	const behind = background.srgb.map((x) => srgbToLinear(x / 255));
	return linearSrgbToOklch(
		foreground[0]! * source.alpha + behind[0]! * (1 - source.alpha),
		foreground[1]! * source.alpha + behind[1]! * (1 - source.alpha),
		foreground[2]! * source.alpha + behind[2]! * (1 - source.alpha),
		1
	);
}

/** Computes WCAG relative contrast between canonical colors. */
export function contrastRatio(first: ResolvedColor, second: ResolvedColor): number {
	const luminance = (color: ResolvedColor) => {
		const [r, g, b] = color.srgb.map((x) => srgbToLinear(x / 255));
		return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
	};
	const a = luminance(first),
		b = luminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Deterministically adjusts lightness to meet contrast against every background. */
export function ensureColorContrast(
	requested: Pick<ParsedColor, 'l' | 'c' | 'h'>,
	backgrounds: readonly ResolvedColor[],
	ratio: number,
	appearance: ThemeAppearance
): { color: ResolvedColor; maximized: boolean } {
	let selected: { color: ResolvedColor; distance: number; minimum: number } | undefined;
	let fallback: { color: ResolvedColor; distance: number; minimum: number } | undefined;
	for (const candidate of orderedLightnessCandidates(requested.l)) {
		if (selected && candidate.distance > selected.distance) break;
		const color = resolveColor({ ...requested, l: candidate.lightness });
		const minimum = Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
		const tie = (candidate: { color: ResolvedColor }) =>
			appearance === 'light'
				? color.oklch.l < candidate.color.oklch.l
				: color.oklch.l > candidate.color.oklch.l;
		if (
			minimum >= ratio &&
			(!selected ||
				candidate.distance < selected.distance ||
				(candidate.distance === selected.distance && tie(selected)))
		)
			selected = { color, distance: candidate.distance, minimum };
		if (!fallback || minimum > fallback.minimum || (minimum === fallback.minimum && tie(fallback)))
			fallback = { color, distance: candidate.distance, minimum };
	}
	return selected
		? { color: selected.color, maximized: false }
		: { color: fallback!.color, maximized: true };
}

/**
 * Visits the exact-theme/1 lightness grid nearest-first without allocating or sorting it.
 * Equal-distance candidates remain adjacent so callers preserve appearance tie-breaking.
 */
export function* orderedLightnessCandidates(
	requested: number
): Generator<{ readonly lightness: number; readonly distance: number }> {
	let lower = Math.min(1000, Math.floor(requested * 1000));
	let upper = Math.max(0, Math.ceil(requested * 1000));
	while (lower >= 0 || upper <= 1000) {
		const lowerLightness = lower / 1000;
		const upperLightness = upper / 1000;
		const lowerDistance = lower >= 0 ? Math.abs(lowerLightness - requested) : Infinity;
		const upperDistance = upper <= 1000 ? Math.abs(upperLightness - requested) : Infinity;
		if (lowerDistance <= upperDistance) {
			yield { lightness: lowerLightness, distance: lowerDistance };
			if (lower === upper) upper++;
			lower--;
		} else {
			yield { lightness: upperLightness, distance: upperDistance };
			upper++;
		}
	}
}

/** Moves a hue toward another along the shortest deterministic arc. */
export function harmonizeHue(hue: number, keyHue: number, amount: number): number {
	let delta = ((keyHue - hue + 540) % 360) - 180;
	if (delta === -180) delta = 180;
	return normalizeHue(hue + delta * amount);
}

/** Canonical finite decimal serialization. */
export function decimal(value: number, places = 6): string {
	const scale = 10 ** places;
	const rounded = Math.floor(value * scale + 0.5) / scale;
	return Object.is(rounded, -0) ? '0' : String(rounded);
}

function normalizeHue(hue: number): number {
	return ((hue % 360) + 360) % 360;
}
