/** Produces a bounded plot-relative percentage for one tooltip coordinate. @exact pure */
export function tooltipCoordinate(value: number): number {
	return Math.min(99, Math.max(1, value));
}

/** Chooses inward tooltip alignment near each plot edge. @exact pure */
export function tooltipPlacement(
	mark: { readonly x: number; readonly y: number } | undefined,
	layout: { readonly width: number; readonly height: number }
): string {
	if (!mark) return 'exact-chart__tooltip--center exact-chart__tooltip--before';
	const inline = mark.x / layout.width;
	const block = mark.y / layout.height;
	return `exact-chart__tooltip--${inline < 0.34 ? 'start' : inline > 0.66 ? 'end' : 'center'} exact-chart__tooltip--${block < 0.34 ? 'after' : 'before'}`;
}
