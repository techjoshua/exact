/** Mutable chart-owned interaction state retained only by the plot component instance. */
export interface ChartInteractionState {
	activeIndex: number;
	tooltipIndex: number;
	pinned: boolean;
	hiddenSeries: string;
}

/** Selects a delegated chart mark from a pointer or focus event. */
export function selectChartMark(
	state: ChartInteractionState,
	event: Event,
	marks: readonly ChartInteractionMark[] = [],
	viewBoxWidth = 1,
	viewBoxHeight = 1
): void {
	const mark = (event.target as Element | null)?.closest<HTMLElement>('[data-chart-index]');
	if (mark) {
		selectIndex(state, Number(mark.dataset.chartIndex));
		return;
	}
	const line = (event.target as Element | null)?.closest<SVGElement>('[data-chart-series-hover]');
	const seriesId = line?.dataset.chartSeriesHover;
	const svg = line?.ownerSVGElement;
	if (!seriesId || !svg || !('clientX' in event) || !('clientY' in event)) return;
	const point = pointerToChart(
		svg,
		Number(event.clientX),
		Number(event.clientY),
		viewBoxWidth,
		viewBoxHeight
	);
	if (!point) return;
	let nearest: ChartInteractionMark | undefined;
	let distance = Number.POSITIVE_INFINITY;
	for (const candidate of marks) {
		if (candidate.seriesId !== seriesId) continue;
		const next = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
		if (next < distance) {
			distance = next;
			nearest = candidate;
		}
	}
	if (nearest) selectIndex(state, nearest.index);
}

/** Coordinates required to resolve the nearest datum on a delegated line hit region. */
export interface ChartInteractionMark {
	readonly index: number;
	readonly x: number;
	readonly y: number;
	readonly seriesId: string;
}

/** Toggles one series through a delegated legend control without per-series closures. */
export function toggleChartSeries(state: ChartInteractionState, event: Event): void {
	const control = (event.target as Element | null)?.closest<HTMLElement>('[data-chart-series]');
	const id = control?.dataset.chartSeries;
	if (!id) return;
	const hidden = new Set(state.hiddenSeries ? state.hiddenSeries.split('\u0000') : []);
	if (hidden.has(id)) hidden.delete(id);
	else hidden.add(id);
	state.hiddenSeries = [...hidden].join('\u0000');
	state.activeIndex = -1;
	state.tooltipIndex = -1;
	state.pinned = false;
}

/** Toggles persistent inspection for pointer and touch activation. */
export function toggleChartMark(state: ChartInteractionState, event: Event): void {
	selectChartMark(state, event);
	state.pinned = !state.pinned;
}

/** Clears transient inspection when focus or pointer leaves the complete chart. */
export function leaveChart(state: ChartInteractionState, event: FocusEvent | PointerEvent): void {
	if (state.pinned) return;
	const chart = (event.currentTarget as Element).closest('.exact-chart');
	const related = event.relatedTarget as Element | null;
	if (related?.closest('[role="tooltip"]')?.closest('.exact-chart') === chart) return;
	const departedTooltip = (event.target as Element | null)?.closest('[role="tooltip"]');
	if (departedTooltip && related?.closest('[role="tooltip"]') === departedTooltip) return;
	const departed = (event.target as Element | null)?.closest('[data-chart-index]');
	if (departed && related?.closest('[data-chart-index]') === departed) return;
	state.activeIndex = -1;
}

/** Traverses focusable marks in visual order without allocating per-datum handlers. */
export function navigateChartMarks(
	state: ChartInteractionState,
	event: KeyboardEvent,
	markCount: number,
	chartId: string
): void {
	if (event.key === 'Escape') {
		state.pinned = false;
		state.activeIndex = -1;
		return;
	}
	if (!markCount) return;
	let next = state.activeIndex < 0 ? 0 : state.activeIndex;
	if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (next + 1) % markCount;
	else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
		next = (next - 1 + markCount) % markCount;
	else if (event.key === 'Home') next = 0;
	else if (event.key === 'End') next = markCount - 1;
	else return;
	event.preventDefault();
	state.activeIndex = next;
	state.tooltipIndex = next;
	document.getElementById(`${chartId}-mark-${next}`)?.focus();
}

function selectIndex(state: ChartInteractionState, index: number): void {
	if (!Number.isInteger(index)) return;
	state.activeIndex = index;
	state.tooltipIndex = index;
}

function pointerToChart(
	svg: SVGSVGElement,
	clientX: number,
	clientY: number,
	viewBoxWidth: number,
	viewBoxHeight: number
): { readonly x: number; readonly y: number } | undefined {
	const matrix = svg.getScreenCTM?.();
	if (matrix && typeof DOMPoint === 'function') {
		const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
		return { x: point.x, y: point.y };
	}
	const bounds = svg.getBoundingClientRect();
	if (!bounds.width || !bounds.height) return undefined;
	return {
		x: ((clientX - bounds.left) / bounds.width) * viewBoxWidth,
		y: ((clientY - bounds.top) / bounds.height) * viewBoxHeight
	};
}
