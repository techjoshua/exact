import { createEnhancementNode, createVNode, type Component, type VNode } from '@exactjs/core';
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
	return () =>
		enhance(
			'surface',
			{ surface: 'raised' },
			createVNode(
				'section',
				{ 'aria-label': `${props.label} themed specimen` },
				enhance('text', { text: 'heading' }, createVNode('h2', null, props.label)),
				enhance(
					'text',
					{ text: 'supporting' },
					createVNode(
						'p',
						null,
						'This component comes from an independently compiled package and owns no theme CSS.'
					)
				),
				createVNode(
					'div',
					{ className: 'theme-lab-statuses', 'aria-label': 'Notifications' },
					enhance('status', { status: 'info' }, createVNode('span', null, 'Information')),
					enhance('status', { status: 'success' }, createVNode('span', null, 'Confirmed')),
					enhance('status', { status: 'warning' }, createVNode('span', null, 'Warning')),
					enhance('status', { status: 'danger' }, createVNode('span', null, 'Invalid'))
				),
				createVNode(
					'div',
					{ className: 'theme-lab-fields' },
					createVNode(
						'label',
						null,
						'Name',
						enhance(
							'field',
							{ field: 'default' },
							createVNode('input', { name: `${props.label}-name`, placeholder: 'Ada Lovelace' })
						)
					),
					createVNode(
						'label',
						null,
						'Region',
						enhance(
							'field',
							{ field: 'subtle' },
							createVNode(
								'select',
								{ name: `${props.label}-region` },
								createVNode('option', null, 'North'),
								createVNode('option', null, 'Central'),
								createVNode('option', null, 'South')
							)
						)
					),
					createVNode(
						'label',
						null,
						enhance(
							'field',
							{ field: true },
							createVNode('input', { type: 'checkbox', checked: true })
						),
						' Receive updates'
					),
					createVNode(
						'label',
						null,
						'Invalid field',
						enhance(
							'field',
							{ field: 'default' },
							createVNode('input', { value: 'Needs attention', 'aria-invalid': 'true' })
						)
					),
					createVNode(
						'label',
						null,
						'Confidence',
						enhance(
							'field',
							{ field: true },
							createVNode('progress', { value: 72, max: 100, 'aria-label': 'Confidence' }, '72%')
						)
					)
				),
					createVNode(DepthControls, {}),
				createVNode(
					'div',
					{
						className: 'theme-lab-selection',
						role: 'tablist',
						'aria-label': 'View',
						style: separatedControlGroupStyle
					},
					enhance(
						'selection',
						{ selection: 'strong' },
						createVNode('button', { role: 'tab', 'aria-selected': 'true' }, 'Overview')
					),
					enhance(
						'selection',
						{ selection: 'subtle' },
						createVNode('button', { role: 'tab', 'aria-selected': 'false' }, 'Details')
					)
				),
				enhance('separator', { separator: 'strong' }, createVNode('hr', null)),
				createVNode(ThemeAreaChart, { label: `${props.label} overlapping area chart` })
			)
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
): VNode {
	const palette = deriveDataColors(theme, {
			kind: 'categorical',
			count: values.length,
			surface
		});
	return createVNode(
			'figure',
			{ className: 'theme-lab-chart' },
			createVNode(
				'svg',
				{ viewBox: '0 0 600 260', role: 'img', 'aria-label': label },
				createVNode('title', null, label),
				...[20, 80, 140, 200].map((y) =>
					createVNode('line', {
						x1: 30,
						y1: y,
						x2: 580,
						y2: y,
						stroke: 'var(--exact-theme-surface-border)',
						'stroke-width': 1
					})
				),
				...values.map((series, index) =>
					createVNode('path', {
						d: areaPath(series.points),
						fill: translucent(palette.colors[index]!, 0.24),
						stroke: palette.strokes[index],
						'stroke-width': 4,
						'stroke-linejoin': 'round'
					})
				)
			),
			createVNode(
				'figcaption',
				null,
				createVNode('strong', null, 'Quarterly activity'),
				createVNode(
					'ul',
					{ className: 'theme-lab-legend' },
					...values.map((series, index) =>
						createVNode(
							'li',
							null,
							createVNode(
								'span',
								{
								className: `theme-lab-pattern pattern-${palette.recommendedPatterns[index]}`,
								style: `--series:${palette.colors[index]}`
								},
								'◆'
							),
							`${series.label}: ${series.points.at(-1)}`
						)
					)
				),
				createVNode(
					'details',
					null,
					createVNode('summary', null, 'View chart data'),
					createVNode(
						'table',
						{ style: dataTableStyle },
						createVNode(
							'thead',
							null,
							createVNode(
								'tr',
								null,
								themeTableHeader('Series'),
								...seriesColumns().map(themeTableHeader)
							)
						),
						createVNode(
							'tbody',
							null,
							...values.map((series) =>
								createVNode(
									'tr',
									null,
									themeTableHeader(series.label),
									...series.points.map((point) =>
										enhance(
											'text',
											{ text: 'body' },
											createVNode('td', { style: dataCellStyle }, point)
										)
									)
								)
							)
						)
					)
				)
			)
			);
}

function themeTableHeader(label: string): VNode {
	return enhance('text', { text: 'body' }, createVNode('th', { style: dataCellStyle }, label));
}

function enhance(name: string, props: Record<string, unknown>, vnode: VNode): VNode {
	return createVNode(
		vnode.type,
		{
			...vnode.props,
			__exactEnhancements: createEnhancementNode([
				{ identity: `@exactjs/theme/enhancements#${name}`, props }
			])
		},
		...vnode.children
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
