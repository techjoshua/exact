import type { PageMarginPreset, PageSize, PuzzleStyle } from './types.js';

type PresetPageSize = Exclude<PageSize, 'custom'>;
type PresetPageMargin = Exclude<PageMarginPreset, 'custom'>;

/** Page dimensions are expressed in CSS pixels at the print-standard 96 pixels per inch. */
export const pageSizePresets: Readonly<Record<PresetPageSize, { width: number; height: number }>> =
	{
		letter: { width: 816, height: 1056 },
		'seven-by-ten': { width: 672, height: 960 },
		'six-by-nine': { width: 576, height: 864 }
	};

/** Uniform margin sizes offered as convenient print presets, in inches. */
export const pageMarginPresets: Readonly<Record<PresetPageMargin, number>> = {
	narrow: 0.25,
	standard: 0.5,
	wide: 1
};

/** Resolves a selected preset or validated custom page size to SVG dimensions. */
export function resolvePageDimensions(style: PuzzleStyle): { width: number; height: number } {
	if (style.pageSize !== 'custom') return pageSizePresets[style.pageSize] ?? pageSizePresets.letter;
	return {
		width: style.customPageWidth * 96,
		height: style.customPageHeight * 96
	};
}

/** Resolves the selected preset or custom uniform margin in inches. */
export function resolvePageMargin(style: PuzzleStyle): number {
	return style.pageMarginPreset === 'custom'
		? style.pageMargin
		: (pageMarginPresets[style.pageMarginPreset] ?? pageMarginPresets.standard);
}

/** Rejects dimensions that cannot produce a finite printable region. */
export function validatePageLayout(style: PuzzleStyle): string | undefined {
	const page = resolvePageDimensions(style);
	const margin = resolvePageMargin(style) * 96;
	if (
		!Number.isFinite(page.width) ||
		!Number.isFinite(page.height) ||
		page.width < 96 ||
		page.height < 96
	)
		return 'Custom page width and height must each be at least 1 inch.';
	if (page.width > 4608 || page.height > 4608)
		return 'Custom page width and height cannot exceed 48 inches.';
	if (!Number.isFinite(margin) || margin < 0)
		return 'Custom margins must be zero or a positive number of inches.';
	if (margin * 2 >= page.width || margin * 2 >= page.height)
		return 'Margins must leave printable space inside the selected page size.';
	return undefined;
}
