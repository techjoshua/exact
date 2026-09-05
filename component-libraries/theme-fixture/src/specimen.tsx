import { createEnhancementNode, type Child, type Component } from '@exactjs/core';
import {
	deriveDataColors,
	ThemeContext,
	ThemeSurfaceContext,
	type ResolvedTheme,
	type ThemeSurfaceBundle
} from '@exactjs/theme';

const values = [
	{ label: 'North', points: [18, 33, 27, 48, 42, 61] },
	{ label: 'Central', points: [35, 25, 45, 38, 58, 52] },
	{ label: 'South', points: [12, 29, 39, 31, 49, 66] }
] as const;
const dataTableStyle = {
	inlineSize: '100%',
	tableLayout: 'fixed',
	borderCollapse: 'collapse',
	fontSize: 'var(--exact-theme-font-size-sm)'
} as const;
const dataCellStyle = {
	padding: 'var(--exact-theme-space-2)',
	borderBlockEnd: 'var(--exact-theme-border-width) solid var(--exact-theme-surface-border)',
	textAlign: 'start',
	verticalAlign: 'middle'
} as const;
const separatedControlGroupStyle = {
	marginBlockStart: 'max(var(--exact-theme-control-gap), 0.25rem)'
} as const;
type DepthInteractionState = 'rest' | 'hover' | 'pressed' | 'dragging';
type DepthControlsState = { dragging: boolean; interaction: DepthInteractionState };

/** Portable acceptance specimen containing native controls, text, statuses, selection, and a derived chart. */
export function ThemeSpecimen(this: Component<{}>, props: { label: string }) {
	return () => (
		<section
			{...enhancementAttributes('surface', { surface: 'raised' })}
			aria-label={`${props.label} themed specimen`}
		>
			<h2 {...enhancementAttributes('text', { text: 'heading' })}>{props.label}</h2>
			<p {...enhancementAttributes('text', { text: 'supporting' })}>
				This component comes from an independently compiled package and owns no theme CSS.
			</p>
			<div className="theme-lab-statuses" aria-label="Notifications">
				<span {...enhancementAttributes('status', { status: 'info' })}>Information</span>
				<span {...enhancementAttributes('status', { status: 'success' })}>Confirmed</span>
				<span {...enhancementAttributes('status', { status: 'warning' })}>Warning</span>
				<span {...enhancementAttributes('status', { status: 'danger' })}>Invalid</span>
			</div>
			<div className="theme-lab-fields">
				<label>
					Name
					<input
						{...enhancementAttributes('field', { field: 'default' })}
						name={`${props.label}-name`}
						placeholder="Ada Lovelace"
					/>
				</label>
				<label>
					Region
					<select
						{...enhancementAttributes('field', { field: 'subtle' })}
						name={`${props.label}-region`}
					>
						<option>North</option>
						<option>Central</option>
						<option>South</option>
					</select>
				</label>
				<label>
					<input {...enhancementAttributes('field', { field: true })} type="checkbox" checked />{' '}
					Receive updates
				</label>
				<label>
					Invalid field
					<input
						{...enhancementAttributes('field', { field: 'default' })}
						value="Needs attention"
						aria-invalid="true"
					/>
				</label>
				<label>
					Confidence
					<progress
						{...enhancementAttributes('field', { field: true })}
						value={72}
						max={100}
						aria-label="Confidence"
					>
						72%
					</progress>
				</label>
			</div>
			<DepthControls />
			<div
				className="theme-lab-selection"
				role="tablist"
				aria-label="View"
				style={separatedControlGroupStyle}
			>
				<button
					{...enhancementAttributes('selection', { selection: 'strong' })}
					role="tab"
					aria-selected="true"
				>
					Overview
				</button>
				<button
					{...enhancementAttributes('selection', { selection: 'subtle' })}
					role="tab"
					aria-selected="false"
				>
					Details
				</button>
			</div>
			<hr {...enhancementAttributes('separator', { separator: 'strong' })} />
			<ThemeAreaChart label={`${props.label} overlapping area chart`} />
		</section>
	);
}

/** Owns the specimen's interactive depth demonstration as one compiled reactive range. */
function DepthControls(this: Component<DepthControlsState>) {
	const theme = this.getContext(ThemeContext);
	this.state.dragging = false;
	this.state.interaction = 'rest';
	return () => (
		<>
			<div className="theme-lab-actions">
				<button
					{...enhancementAttributes('action', { action: 'primary' })}
					type="button"
					onPointerOver={() => (this.state.interaction = 'hover')}
					onPointerOut={() => (this.state.interaction = 'rest')}
					onPointerDown={() => (this.state.interaction = 'pressed')}
					onPointerUp={() => (this.state.interaction = 'hover')}
					onPointerCancel={() => (this.state.interaction = 'rest')}
					onKeyDown={(event: KeyboardEvent) => {
						if (event.key === 'Enter' || event.key === ' ') this.state.interaction = 'pressed';
					}}
					onKeyUp={(event: KeyboardEvent) => {
						if (event.key === 'Enter' || event.key === ' ') this.state.interaction = 'rest';
					}}
				>
					Save changes
				</button>
				<button {...enhancementAttributes('action', { action: 'secondary' })} type="button">
					Preview
				</button>
				<button
					{...enhancementAttributes('action', { action: 'quiet', tone: 'danger' })}
					type="button"
				>
					Delete
				</button>
				<button
					{...enhancementAttributes('action', { action: 'secondary' })}
					type="button"
					disabled
				>
					Unavailable
				</button>
				<button
					{...enhancementAttributes('action', { action: 'secondary' })}
					type="button"
					draggable
					data-exact-theme-dragging={this.state.dragging ? 'true' : undefined}
					onDragStart={() => {
						this.state.dragging = true;
						this.state.interaction = 'dragging';
					}}
					onDragEnd={() => {
						this.state.dragging = false;
						this.state.interaction = 'rest';
					}}
				>
					Drag me
				</button>
			</div>
			<output
				{...enhancementAttributes('text', { text: 'supporting' })}
				aria-label="Current depth demonstration state"
			>
				{depthStateDescription(theme.current.source.depth, this.state.interaction)}
			</output>
		</>
	);
}

/** Accessible translucent area chart derived from the nearest theme and surface contexts. */
export function ThemeAreaChart(this: Component<{}>, props: { label: string }) {
	const theme = this.getContext(ThemeContext),
		surface = this.getContext(ThemeSurfaceContext);
	return () => themeAreaChartView(props.label, theme.current, surface.bundle);
}

function themeAreaChartView(
	label: string,
	theme: ResolvedTheme,
	surface: ThemeSurfaceBundle
): Child {
	const palette = deriveDataColors(theme, {
		kind: 'categorical',
		count: values.length,
		surface
	});
	return (
		<figure className="theme-lab-chart">
			<svg viewBox="0 0 600 260" role="img" aria-label={label}>
				<title>{label}</title>
				{[20, 80, 140, 200].map((y) => (
					<line
						key={`${y}`}
						x1={30}
						y1={y}
						x2={580}
						y2={y}
						stroke="var(--exact-theme-surface-border)"
						stroke-width={1}
					/>
				))}
				{values.map((series, index) => (
					<path
						key={series.label}
						d={areaPath(series.points)}
						fill={translucent(palette.colors[index]!, 0.24)}
						stroke={palette.strokes[index]}
						stroke-width={4}
						stroke-linejoin="round"
					/>
				))}
			</svg>
			<figcaption>
				<strong>Quarterly activity</strong>
				<ul className="theme-lab-legend">
					{values.map((series, index) => (
						<li key={series.label}>
							<span
								className={`theme-lab-pattern pattern-${palette.recommendedPatterns[index]}`}
								style={`--series:${palette.colors[index]}`}
							>
								◆
							</span>
							{`${series.label}: ${series.points.at(-1)}`}
						</li>
					))}
				</ul>
				<details>
					<summary>View chart data</summary>
					<table style={dataTableStyle}>
						<thead>
							<tr>
								{themeTableHeader('Series')}
								{seriesColumns().map(themeTableHeader)}
							</tr>
						</thead>
						<tbody>
							{values.map((series) => (
								<tr key={series.label}>
									{themeTableHeader(series.label)}
									{series.points.map((point, index) => (
										<td
											key={`${series.label}-${index}`}
											{...enhancementAttributes('text', { text: 'body' })}
											style={dataCellStyle}
										>
											{point}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</details>
			</figcaption>
		</figure>
	);
}

function themeTableHeader(label: string): Child {
	return (
		<th key={label} {...enhancementAttributes('text', { text: 'body' })} style={dataCellStyle}>
			{label}
		</th>
	);
}

function enhancementAttributes(name: string, props: Record<string, unknown>) {
	return {
		__exactEnhancements: createEnhancementNode([
			{ identity: `@exactjs/theme/enhancements#${name}`, props }
		])
	};
}
function areaPath(points: readonly number[]): string {
	const coordinates = points.map((point, index) => `${30 + index * 110},${230 - point * 3}`);
	return `M30,230 L${coordinates.join(' L')} L580,230 Z`;
}
function translucent(color: string, alpha: number): string {
	return color.replace(/\)$/, ` / ${alpha})`);
}
function seriesColumns(): readonly string[] {
	return ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
}
function depthStateDescription(
	depth: 'flat' | 'bordered' | 'elevated',
	state: DepthInteractionState
): string {
	const shadow =
		depth === 'elevated'
			? {
					rest: 'shadow-sm',
					hover: 'shadow-md',
					pressed: 'surface-sunken-shadow',
					dragging: 'shadow-lg'
				}[state]
			: 'none';
	return `Depth demo: ${state} → ${shadow}. Hover or press Save changes; drag Drag me.`;
}
