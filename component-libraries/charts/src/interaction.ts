/** Mutable chart-owned interaction state retained only by the plot component instance. */
export interface ChartInteractionState {
	activeIndex: number;
	pinned: boolean;
	hiddenSeries: string;
}

/** Selects a delegated chart mark from a pointer or focus event. */
export function selectChartMark(state: ChartInteractionState, event: Event): void {
	const mark = (event.target as Element | null)?.closest<HTMLElement>('[data-chart-index]');
	if (!mark) return;
	const index = Number(mark.dataset.chartIndex);
	if (Number.isInteger(index)) state.activeIndex = index;
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
	if ((event.relatedTarget as Element | null)?.closest('.exact-chart') === chart) return;
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
	document.getElementById(`${chartId}-mark-${next}`)?.focus();
}
