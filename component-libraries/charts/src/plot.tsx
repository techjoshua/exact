import type { Component } from '@exactjs/core';
import { IntlEnvironmentContext } from '@exactjs/intl';
import { _ } from '@exactjs/jsx';
import { ThemeContext, ThemeSurfaceContext } from '@exactjs/theme';
import { ChartContext } from './contexts.js';
import { chartAxisLabelX, chartAxisLabelY } from './layout.js';
import {
	leaveChart,
	navigateChartMarks,
	selectChartMark,
	toggleChartMark,
	toggleChartSeries
} from './interaction.js';
import { createChartPresentation } from './presentation.js';
import { tooltipCoordinate, tooltipPlacement } from './tooltip-position.js';

interface ChartPlotState {
	activeIndex: number;
	tooltipIndex: number;
	pinned: boolean;
	hiddenSeries: string;
	revision: number;
}

/** Internal focused plot operation mounted after declarative chart registrations. */
export function ChartPlot(this: Component<ChartPlotState>) {
	const chart = this.getContext(ChartContext);
	const environment = this.hasContext(IntlEnvironmentContext)
		? this.getContext(IntlEnvironmentContext)
		: undefined;
	const theme = this.hasContext(ThemeContext) ? this.getContext(ThemeContext) : undefined;
	const surface = this.hasContext(ThemeSurfaceContext)
		? this.getContext(ThemeSurfaceContext)
		: undefined;
	this.state.activeIndex = -1;
	this.state.tooltipIndex = -1;
	this.state.pinned = false;
	this.state.hiddenSeries = '';
	this.state.revision = 0;
	const releaseInvalidator = chart.model.attachInvalidator(() => this.state.revision++);
	this.onUnmount(releaseInvalidator);
	const presentation = createChartPresentation(
		chart,
		environment,
		theme?.current,
		surface?.bundle,
		this.state.revision,
		chart.model.presentationRevision,
		environment?.state.generation,
		this.state.hiddenSeries
	);
	const inspect = (event: Event) =>
		selectChartMark(
			this.state,
			event,
			presentation.marks,
			presentation.layout.width,
			presentation.layout.height
		);
	const toggle = (event: Event) => toggleChartMark(this.state, event);
	const leave = (event: FocusEvent | PointerEvent) => leaveChart(this.state, event);
	const navigate = (event: KeyboardEvent) =>
		navigateChartMarks(this.state, event, presentation.marks.length, chart.id);
	const toggleSeries = (event: Event) => toggleChartSeries(this.state, event);
	const active = presentation.marks[this.state.activeIndex];
	const tooltip = active ?? presentation.marks[this.state.tooltipIndex];
	return () => (
		<>
			{presentation.legend.length > 0 && (
				<ul
					id={`${chart.id}-legend`}
					className={`exact-chart__legend exact-chart__legend--${chart.model.legendProps?.position ?? 'top'}`}
					aria-label={chart.model.legendProps?.label}
					onClick={chart.model.legendProps?.interactive ? toggleSeries : undefined}
				>
					{presentation.legend.map((item) => (
						<li key={item.id}>
							{chart.model.legendProps?.interactive ? (
								<button
									type="button"
									data-chart-series={item.id}
									aria-pressed={item.hidden ? 'false' : 'true'}
								>
									<span
										className={`exact-chart__legend-swatch exact-chart__pattern-${item.pattern}`}
										style={`--exact-chart-series-current:${item.color}`}
										aria-hidden="true"
									/>
									{item.label}
								</button>
							) : (
								<span>
									<span
										className={`exact-chart__legend-swatch exact-chart__pattern-${item.pattern}`}
										style={`--exact-chart-series-current:${item.color}`}
										aria-hidden="true"
									/>
									{item.label}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
			<div className="exact-chart__plot-region">
				<svg
					className="exact-chart__plot"
					viewBox={`0 0 ${presentation.layout.width} ${presentation.layout.height}`}
					role="img"
					aria-labelledby={`${chart.id}-title`}
					aria-describedby={`${chart.id}-description ${chart.id}-tooltip`}
					onPointerOver={inspect}
					onPointerMove={inspect}
					onPointerOut={leave}
					onFocusIn={inspect}
					onFocusOut={leave}
					onClick={toggle}
					onKeyDown={navigate}
				>
					<defs>
						{presentation.legend.map((item) => (
							<pattern
								key={item.id}
								id={`${chart.id}-pattern-${safeToken(item.id)}`}
								width={8}
								height={8}
								patternUnits="userSpaceOnUse"
								patternTransform={`rotate(${item.pattern % 2 ? 45 : -45})`}
							>
								<rect width={8} height={8} fill={item.color} />
								<line
									x1={0}
									x2={0}
									y1={0}
									y2={8}
									stroke="Canvas"
									stroke-opacity="0.45"
									stroke-width={2}
								/>
							</pattern>
						))}
					</defs>
					<g className="exact-chart__grid" aria-hidden="true">
						{presentation.ticks.map((tick) => (
							<line
								key={tick.id}
								x1={presentation.orientation === 'horizontal' ? tick.x : presentation.layout.left}
								x2={presentation.orientation === 'horizontal' ? tick.x : presentation.layout.right}
								y1={presentation.orientation === 'horizontal' ? presentation.layout.top : tick.y}
								y2={presentation.orientation === 'horizontal' ? presentation.layout.bottom : tick.y}
							/>
						))}
					</g>
					<g className="exact-chart__axis" aria-hidden="true">
						<line
							x1={presentation.layout.left}
							x2={presentation.layout.left}
							y1={presentation.layout.top}
							y2={presentation.layout.bottom}
						/>
						<line
							x1={presentation.layout.left}
							x2={presentation.layout.right}
							y1={presentation.layout.bottom}
							y2={presentation.layout.bottom}
						/>
					</g>
					<g className="exact-chart__ticks" aria-hidden="true">
						{presentation.ticks.map((tick) => (
							<text
								key={tick.id}
								x={
									presentation.orientation === 'horizontal' ? tick.x : presentation.layout.left - 8
								}
								y={
									presentation.orientation === 'horizontal'
										? presentation.layout.bottom + 22
										: tick.y + 4
								}
								text-anchor={presentation.orientation === 'horizontal' ? 'middle' : 'end'}
							>
								{tick.value}
							</text>
						))}
						{presentation.categories.map((category) => (
							<text
								key={category.id}
								x={
									presentation.orientation === 'horizontal'
										? presentation.layout.left - 8
										: category.x
								}
								y={
									presentation.orientation === 'horizontal'
										? category.y + 4
										: presentation.layout.bottom + 22
								}
								text-anchor={presentation.orientation === 'horizontal' ? 'end' : 'middle'}
							>
								{category.value}
							</text>
						))}
					</g>
					<g className="exact-chart__axis-labels" aria-hidden="true">
						{presentation.axisLabels.map((label) => (
							<text
								key={label.id}
								x={chartAxisLabelX(label.position, presentation.layout)}
								y={chartAxisLabelY(label.position, presentation.layout)}
								text-anchor="middle"
								transform={
									label.position === 'left' || label.position === 'right'
										? `rotate(-90 ${chartAxisLabelX(label.position, presentation.layout)} ${chartAxisLabelY(label.position, presentation.layout)})`
										: undefined
								}
							>
								{label.value}
							</text>
						))}
					</g>
					{presentation.lines.map((series) => (
						<g
							key={series.id}
							className="exact-chart__series"
							aria-labelledby={series.labelId}
							style={`--exact-chart-series-current:${series.color}`}
						>
							{series.area && (
								<path
									d={series.area}
									fill="var(--exact-chart-series-current)"
									fill-opacity="0.18"
								/>
							)}
							<path
								d={series.path}
								stroke="var(--exact-chart-series-current)"
								stroke-dasharray={
									series.pattern === 1
										? '8 4'
										: series.pattern === 2
											? '2 3'
											: series.pattern === 3
												? '10 3 2 3'
												: undefined
								}
							/>
							<path
								className="exact-chart__line-hit"
								data-chart-series-hover={series.id}
								d={series.path}
								aria-hidden="true"
							/>
							{series.points.map((point) => (
								<circle
									key={point.id}
									id={`${chart.id}-mark-${point.index}`}
									className="exact-chart__datum"
									data-chart-index={point.index}
									cx={point.x}
									cy={point.y}
									r={4}
									fill="var(--exact-chart-series-current)"
									tabIndex={0}
									aria-label={accessibleMarkLabel(point)}
									aria-describedby={point.descriptionId}
								/>
							))}
						</g>
					))}
					{presentation.bars.map((bar) => (
						<rect
							key={bar.id}
							id={`${chart.id}-mark-${bar.index}`}
							className="exact-chart__datum"
							data-chart-index={bar.index}
							x={bar.x}
							y={bar.y}
							width={bar.width}
							height={bar.height}
							fill={
								presentation.legend.length
									? `url(#${chart.id}-pattern-${safeToken(bar.seriesId)})`
									: bar.color
							}
							tabIndex={0}
							aria-label={accessibleMarkLabel(bar)}
							aria-describedby={bar.descriptionId}
						/>
					))}
					{presentation.ranges.map((range) => (
						<g
							key={range.id}
							id={`${chart.id}-mark-${range.index}`}
							className="exact-chart__datum"
							data-chart-index={range.index}
							tabIndex={0}
							aria-label={accessibleMarkLabel(range)}
							aria-describedby={range.descriptionId}
						>
							<line
								x1={range.x1}
								x2={range.x2}
								y1={range.y}
								y2={range.y}
								stroke={range.color}
								stroke-width={8}
							/>
							{range.marks.map((mark) => (
								<line
									key={mark.id}
									x1={mark.x}
									x2={mark.x}
									y1={range.y - 6}
									y2={range.y + 6}
									stroke={range.color}
									stroke-width={2}
								/>
							))}
							<line
								x1={range.marker}
								x2={range.marker}
								y1={range.y - 8}
								y2={range.y + 8}
								stroke={range.color}
								stroke-width={3}
							/>
						</g>
					))}
				</svg>
				<div
					id={`${chart.id}-tooltip`}
					className={`exact-chart__tooltip ${tooltipPlacement(tooltip, presentation.layout)}`}
					role="tooltip"
					hidden={!active && !chart.props.motion}
					aria-hidden={active ? undefined : 'true'}
					data-visible={active ? 'true' : 'false'}
					tabIndex={active ? 0 : undefined}
					onPointerOut={leave}
					onFocusOut={leave}
					onKeyDown={navigate}
					style={
						tooltip
							? `inset-inline-start:${tooltipCoordinate((tooltip.x / presentation.layout.width) * 100)}%;inset-block-start:${tooltipCoordinate((tooltip.y / presentation.layout.height) * 100)}%`
							: undefined
					}
				>
					<strong>{tooltip?.label ?? ''}</strong>
					{tooltip?.description && <span>{tooltip.description}</span>}
				</div>
			</div>
			<details className="exact-chart__data-view">
				<summary>{environment ? <_ intl:message>View chart data</_> : 'View chart data'}</summary>
				<table>
					<thead>
						<tr>
							<th>{environment ? <_ intl:message>Series</_> : 'Series'}</th>
							<th>{environment ? <_ intl:message>Category</_> : 'Category'}</th>
							<th>{environment ? <_ intl:message>Value</_> : 'Value'}</th>
							<th>{environment ? <_ intl:message>Description</_> : 'Description'}</th>
						</tr>
					</thead>
					<tbody>
						{presentation.rows.map((row) => (
							<tr key={row.id}>
								<th>{row.series}</th>
								<td>{row.category}</td>
								<td>{row.value}</td>
								<td>{row.description ?? ''}</td>
							</tr>
						))}
					</tbody>
				</table>
			</details>
		</>
	);
}

function safeToken(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]+/gu, '-');
}

function accessibleMarkLabel(mark: {
	readonly label: string;
	readonly description?: string;
	readonly descriptionId?: string;
}): string {
	return mark.description && !mark.descriptionId
		? `${mark.label}. ${mark.description}`
		: mark.label;
}
