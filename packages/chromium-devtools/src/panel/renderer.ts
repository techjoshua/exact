import type {
	ExactContextPreview,
	ExactInspectedMicrofrontend,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionEvent,
	ExactValuePreview
} from '@exactjs/devtools-protocol';
import type { ExactDevtoolsPanelModel } from './model.js';
import { renderComponentTreeNode } from './component-tree.js';
import { renderPartitionTree } from './partition-tree.js';
import { renderTaskSection } from './task-section.js';
import { setTreeBranchExpanded } from './tree-disclosure.js';
import { renderExactValuePreview } from './value-preview.js';
import {
	buildExactComponentForest,
	buildExactProfilerFrames,
	exactEventComponentName,
	exactPanelIdentityKey,
	exactPanelComponentTypeKey,
	formatExactProfilerDuration
} from './view-model.js';

/** Actions supplied by the panel controller to the presentation layer. */
export type ExactPanelRenderActions = Readonly<{
	selectComponent(id: ExactInspectionRuntimeId): void;
}>;

/** Renders the component hierarchy and selected instance details. */
export function renderExactComponentsView(
	container: Element,
	model: ExactDevtoolsPanelModel,
	actions: ExactPanelRenderActions
): void {
	const layout = node('div', 'components-layout');
	const sidebar = node('section', 'component-sidebar');
	const forest = buildExactComponentForest(model.components);
	sidebar.append(sectionHeading('Component tree', `${model.components.length} instances`));
	const tree = node('div', 'component-tree');
	tree.setAttribute('data-panel-scroll-key', 'component-tree');
	const selectedKey = model.selected ? exactPanelIdentityKey(model.selected.id) : undefined;
	for (const root of forest)
		tree.append(renderComponentTreeNode(root, selectedKey, actions.selectComponent));
	if (!model.components.length)
		tree.append(
			emptyState('No inspectable components', 'Reload the page with runtime inspection enabled.')
		);
	sidebar.append(tree);
	sidebar.append(...renderPartitionTree(model.partitions));
	layout.append(sidebar, renderComponentDetails(model));
	replacePanelView(container, layout, 'components');
}

/** Renders a bounded profiler capture as causal frames and component waterfall lanes. */
export function renderExactProfilerView(
	container: Element,
	model: ExactDevtoolsPanelModel,
	events: readonly ExactRuntimeInspectionEvent[],
	recording: boolean,
	actions: ExactPanelRenderActions,
	captureComplete = false
): void {
	if (!events.length) {
		const empty = emptyState(
			recording
				? 'Recording…'
				: captureComplete
					? 'No framework activity captured'
					: 'Record an interaction',
			recording
				? 'Use the application; frames and reactive changes will appear here.'
				: captureComplete
					? 'Try recording again and trigger state changes, interactions, navigation, or task work.'
					: 'Press Record, interact with the page, then press Stop to inspect the captured work.'
		);
		replacePanelView(container, empty, 'profiler');
		return;
	}
	const frames = buildExactProfilerFrames(events);
	const view = node('div', 'profiler');
	view.setAttribute('data-panel-scroll-key', 'profiler');
	const captureStart = Math.min(...events.map((event) => event.timestamp));
	const captureEnd = Math.max(...events.map((event) => event.timestamp));
	const captureDuration = Math.max(0, captureEnd - captureStart);
	const summary = node('div', 'profiler-summary');
	summary.append(
		metric(String(frames.length), 'frames'),
		metric(String(events.length), 'events'),
		metric(formatExactProfilerDuration(captureDuration), 'capture')
	);
	if (recording) summary.append(badge('Recording', 'recording'));
	view.append(summary);
	for (const frame of frames)
		view.append(
			renderProfilerFrame(frame, captureStart, Math.max(captureDuration, 0.1), model, actions)
		);
	replacePanelView(container, view, 'profiler');
}

/** Renders independently deployed roots as compact availability cards. */
export function renderExactMicrofrontendsView(
	container: Element,
	microfrontends: readonly ExactInspectedMicrofrontend[]
): void {
	if (!microfrontends.length) {
		const empty = emptyState(
			'No microfrontends',
			'This page currently exposes only its local execution root.'
		);
		replacePanelView(container, empty, 'microfrontends');
		return;
	}
	const grid = node('div', 'microfrontend-grid');
	grid.setAttribute('data-panel-scroll-key', 'microfrontends');
	for (const item of microfrontends) {
		const card = node('article', 'microfrontend-card');
		const title = document.createElement('h2');
		title.textContent = item.binding;
		card.append(
			title,
			labeledValue('Build', shortIdentity(item.buildKey)),
			labeledValue('Roots', item.executionRoots.join(', ')),
			labeledValue('Client', item.clientStatus),
			labeledValue('Server', item.serverStatus),
			labeledValue('Events', item.eventStream)
		);
		grid.append(card);
	}
	replacePanelView(container, grid, 'microfrontends');
}

function renderComponentDetails(model: ExactDevtoolsPanelModel): HTMLElement {
	const details = node('section', 'component-details');
	details.setAttribute(
		'data-panel-scroll-key',
		`component-details:${model.selected ? exactPanelIdentityKey(model.selected.id) : 'none'}`
	);
	const component = model.selected;
	if (!component) {
		details.append(emptyState('Select a component', 'Choose a node to inspect its live state.'));
		return details;
	}
	const heading = node('div', 'details-heading');
	const titleGroup = node('div');
	const title = document.createElement('h1');
	title.textContent = component.name;
	const subtitle = node('p', 'details-subtitle');
	subtitle.textContent = `${component.id.executionRoot} · ${component.id.side} · ${component.status}`;
	titleGroup.append(title, subtitle);
	heading.append(
		titleGroup,
		badge(shortIdentity(component.id.instanceId ?? 'instance'), 'neutral')
	);
	details.append(heading);

	const state = model.state?.state ?? component.state;
	const props = model.state?.props ?? component.props;
	const componentKey = exactPanelIdentityKey(component.id);
	details.append(
		previewSection('State', state, 'State is empty', [componentKey, 'State']),
		previewSection('Props', props, 'No props', [componentKey, 'Props']),
		contextSection(model.contexts, componentKey),
		renderTaskSection(model.tasks)
	);
	if (model.dependency !== undefined) {
		const dependency = document.createElement('details');
		dependency.className = 'detail-section';
		dependency.setAttribute('data-panel-disclosure-key', 'dependency');
		const summary = document.createElement('summary');
		summary.textContent = 'Reactive dependency';
		const content = node('pre', 'protocol-preview');
		content.setAttribute('data-panel-scroll-key', 'dependency-preview');
		content.textContent = JSON.stringify(model.dependency, null, 2);
		dependency.append(summary, content);
		details.append(dependency);
	}
	return details;
}

function previewSection(
	title: string,
	preview: ExactValuePreview,
	emptyLabel: string,
	path: readonly string[]
): HTMLElement {
	const section = document.createElement('details');
	section.className = 'detail-section';
	section.setAttribute('data-panel-disclosure-key', `preview:${title}`);
	section.open = title === 'State';
	const summary = document.createElement('summary');
	summary.textContent = title;
	section.append(summary);
	if (preview.kind === 'object' && !preview.entries.length) section.append(emptyState(emptyLabel));
	else section.append(renderExactValuePreview(preview, path, true));
	return section;
}

function contextSection(
	contexts: readonly ExactContextPreview[],
	componentKey: string
): HTMLElement {
	const section = document.createElement('details');
	section.className = 'detail-section';
	section.setAttribute('data-panel-disclosure-key', 'contexts');
	const summary = document.createElement('summary');
	summary.textContent = `Contexts (${contexts.length})`;
	section.append(summary);
	if (!contexts.length) section.append(emptyState('No contexts'));
	for (const context of contexts) {
		const row = node('div', 'context-row');
		row.append(
			labeledValue(context.name, context.scope),
			context.value
				? renderExactValuePreview(context.value, [
						componentKey,
						'Contexts',
						context.scope,
						context.name
					])
				: badge(context.availability, 'neutral')
		);
		section.append(row);
	}
	return section;
}

function renderProfilerFrame(
	frame: ReturnType<typeof buildExactProfilerFrames>[number],
	captureStart: number,
	captureDuration: number,
	model: ExactDevtoolsPanelModel,
	actions: ExactPanelRenderActions
): HTMLElement {
	const card = document.createElement('details');
	card.className = 'profile-frame';
	card.setAttribute(
		'data-panel-disclosure-key',
		`profile-frame:${frame.events[0]?.cursor ?? frame.label}`
	);
	card.open = true;
	const summary = document.createElement('summary');
	const title = node('strong');
	title.textContent = frame.label;
	const changes = frame.events.filter(
		(event) => event.kind === 'state.change' || event.kind === 'props.change'
	).length;
	summary.append(
		title,
		badge(`${frame.events.length} events`, 'neutral'),
		changes ? badge(`${changes} changes`, 'change') : document.createTextNode(''),
		nodeText('span', formatExactProfilerDuration(frame.end - frame.start), 'frame-duration')
	);
	card.append(summary);
	const lanes = node('div', 'waterfall');
	const grouped = new Map<string, ExactRuntimeInspectionEvent[]>();
	for (const event of frame.events) {
		const key = exactPanelComponentTypeKey(event.id);
		const lane = grouped.get(key);
		if (lane) lane.push(event);
		else grouped.set(key, [event]);
	}
	for (const events of grouped.values()) {
		const representative = events[0]!;
		const row = node('button', 'waterfall-row');
		row.type = 'button';
		row.addEventListener('click', () => actions.selectComponent(representative.id));
		const label = node('span', 'waterfall-label');
		const changes = events.filter(
			(event) => event.kind === 'state.change' || event.kind === 'props.change'
		).length;
		label.append(
			nodeText('strong', exactEventComponentName(representative, model.components)),
			nodeText('small', `${events.length} events${changes ? ` · ${changes} changes` : ''}`)
		);
		const track = node('span', 'waterfall-track');
		for (const event of events) {
			const bar = node('span', `waterfall-bar event-${event.kind.replaceAll('.', '-')}`);
			const position = ((event.timestamp - captureStart) / captureDuration) * 100;
			bar.style.setProperty('--event-left', `${Math.max(0, Math.min(99, position))}%`);
			bar.title = `${event.kind} · ${formatExactProfilerDuration(event.timestamp - captureStart)} into capture`;
			track.append(bar);
		}
		row.append(label, track);
		lanes.append(row);
	}
	card.append(lanes);
	return card;
}

function sectionHeading(titleText: string, count: string): HTMLElement {
	const heading = node('div', 'section-heading');
	const title = document.createElement('h2');
	title.textContent = titleText;
	heading.append(title, badge(count, 'neutral'));
	return heading;
}

function metric(value: string, label: string): HTMLElement {
	const item = node('div', 'metric');
	item.append(nodeText('strong', value), nodeText('span', label));
	return item;
}

function labeledValue(label: string, value: string): HTMLElement {
	const row = node('div', 'labeled-value');
	row.append(nodeText('span', label), nodeText('strong', value));
	return row;
}

function badge(text: string, tone: string): HTMLElement {
	return nodeText('span', text, `badge badge-${tone}`);
}

function emptyState(titleText: string, description?: string): HTMLElement {
	const empty = node('div', 'empty-state');
	const title = document.createElement('strong');
	title.textContent = titleText;
	empty.append(title);
	if (description) empty.append(nodeText('p', description));
	return empty;
}

function replacePanelView(container: Element, view: HTMLElement, viewKey: string): void {
	const preserve = container.firstElementChild?.getAttribute('data-panel-view-key') === viewKey;
	const scrollPositions = new Map<string, Readonly<{ top: number; left: number }>>();
	const disclosureStates = new Map<string, boolean>();
	const collapseStates = new Map<string, boolean>();
	if (preserve) {
		for (const element of container.querySelectorAll<HTMLElement>('[data-panel-scroll-key]')) {
			const key = element.getAttribute('data-panel-scroll-key');
			if (key) scrollPositions.set(key, { top: element.scrollTop, left: element.scrollLeft });
		}
		for (const element of container.querySelectorAll<HTMLDetailsElement>(
			'details[data-panel-disclosure-key]'
		)) {
			const key = element.getAttribute('data-panel-disclosure-key');
			if (key) disclosureStates.set(key, element.open);
		}
		for (const element of container.querySelectorAll<HTMLElement>('[data-panel-collapse-key]')) {
			const key = element.getAttribute('data-panel-collapse-key');
			if (key) collapseStates.set(key, element.dataset.panelExpanded === 'true');
		}
	}
	view.setAttribute('data-panel-view-key', viewKey);
	container.replaceChildren(view);
	if (!preserve) return;
	for (const element of container.querySelectorAll<HTMLDetailsElement>(
		'details[data-panel-disclosure-key]'
	)) {
		const key = element.getAttribute('data-panel-disclosure-key');
		if (key && disclosureStates.has(key)) element.open = disclosureStates.get(key)!;
	}
	for (const element of container.querySelectorAll<HTMLElement>('[data-panel-collapse-key]')) {
		const key = element.getAttribute('data-panel-collapse-key');
		if (key && collapseStates.has(key)) setTreeBranchExpanded(element, collapseStates.get(key)!);
	}
	for (const element of container.querySelectorAll<HTMLElement>('[data-panel-scroll-key]')) {
		const key = element.getAttribute('data-panel-scroll-key');
		const position = key ? scrollPositions.get(key) : undefined;
		if (!position) continue;
		element.scrollTop = position.top;
		element.scrollLeft = position.left;
	}
}

function shortIdentity(value: string): string {
	return value.length > 16 ? `${value.slice(0, 12)}…` : value;
}

function node<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	if (className) element.className = className;
	return element;
}

function nodeText<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text: string,
	className?: string
): HTMLElementTagNameMap[K] {
	const element = node(tag, className);
	element.textContent = text;
	return element;
}
