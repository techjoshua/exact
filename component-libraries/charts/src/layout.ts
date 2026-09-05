import type { ChartDimensions, ChartType } from './contracts.js';

/** Deterministic SVG layout shared by server output and initial hydration. */
export interface ChartLayout {
	readonly width: number;
	readonly height: number;
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
	readonly plotWidth: number;
	readonly plotHeight: number;
}

/** Resolves finite chart dimensions and the initial Cartesian plot rectangle. */
export function resolveChartLayout(dimensions: ChartDimensions): ChartLayout {
	const width = dimensions.width ?? 640;
	const height = dimensions.height ?? 360;
	const padding = dimensions.padding ?? 16;
	for (const [name, value] of [
		['width', width],
		['height', height],
		['padding', padding]
	] as const)
		if (!Number.isFinite(value) || value < 0)
			throw new RangeError(`Chart ${name} must be a finite non-negative number`);
	if (width < 160 || height < 120)
		throw new RangeError('Chart dimensions must be at least 160 by 120');
	const left = padding + 48;
	const right = width - padding;
	const top = padding;
	const bottom = height - padding - 36;
	return Object.freeze({
		width,
		height,
		left,
		right,
		top,
		bottom,
		plotWidth: Math.max(1, right - left),
		plotHeight: Math.max(1, bottom - top)
	});
}

/** Determines whether zero is semantically part of the default vertical domain. */
export function chartTypeUsesZeroBaseline(type: ChartType): boolean {
	return type === 'bar' || type === 'horizontal-bar' || type === 'stacked-bar';
}
