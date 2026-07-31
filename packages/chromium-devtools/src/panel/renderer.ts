import type {
	ExactContextPreview,
	ExactInspectedMicrofrontend,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionEvent,
	ExactTaskRuntimeSnapshot,
	ExactValuePreview
} from '@exactjs/devtools-protocol';
import type { ExactDevtoolsPanelModel } from './model.js';
import {
	buildExactComponentForest,
	buildExactProfilerFrames,
	exactEventComponentName,
	exactPanelIdentityKey,
	exactPanelComponentTypeKey,
	formatExactProfilerDuration,
	type ExactComponentTreeNode
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
	const selectedKey = model.selected ? exactPanelIdentityKey(model.selected.id) : undefined;
	for (const root of forest) tree.append(renderTreeNode(root, selectedKey, actions));
	if (!model.components.length)
		tree.append(
			emptyState('No inspectable components', 'Reload the page with runtime inspection enabled.')
		);
	sidebar.append(tree);
	layout.append(sidebar, renderComponentDetails(model));
	container.replaceChildren(layout);
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
		container.replaceChildren(
			emptyState(
				recording
					? 'Recording…'
					: captureComplete
						? 'No framework activity captured'
						: 'Record an interaction',
				recording
					? 'Use the application; frames and reactive changes will appear here.'
					: captureComplete
						? 'Try recording again and trigger state changes, actions, navigation, or task work.'
						: 'Press Record, interact with the page, then press Stop to inspect the captured work.'
			)
		);
		return;
	}
	const frames = buildExactProfilerFrames(events);
	const view = node('div', 'profiler');
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
	container.replaceChildren(view);
}

/** Renders independently deployed roots as compact availability cards. */
export function renderExactMicrofrontendsView(
	container: Element,
	microfrontends: readonly ExactInspectedMicrofrontend[]
): void {
	if (!microfrontends.length) {
		container.replaceChildren(
			emptyState('No microfrontends', 'This page currently exposes only its local execution root.')
		);
		return;
	}
	const grid = node('div', 'microfrontend-grid');
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
	container.replaceChildren(grid);
}

function renderTreeNode(
	treeNode: ExactComponentTreeNode,
	selectedKey: string | undefined,
	actions: ExactPanelRenderActions
): HTMLElement {
	const branch = node('div', 'tree-branch');
	const component = treeNode.component;
	const button = node('button', 'tree-node');
	button.type = 'button';
	button.classList.toggle('selected', exactPanelIdentityKey(component.id) === selectedKey);
	button.title = `${component.name} · ${component.id.instanceId ?? 'runtime instance'}`;
	const disclosure = node('span', 'tree-disclosure');
	disclosure.textContent = treeNode.children.length ? '▾' : '';
	const status = node('span', `status-dot status-${component.status}`);
	const name = node('span', 'tree-name');
	name.textContent = component.name;
	button.append(disclosure, status, name);
	if (component.id.instanceId)
		button.append(badge(shortIdentity(component.id.instanceId), 'neutral'));
	if (component.tasks.some((task) => task.status === 'running' || task.status === 'queued'))
		button.append(badge('working', 'busy'));
	button.addEventListener('click', () => actions.selectComponent(component.id));
	branch.append(button);
	if (treeNode.children.length) {
		const children = node('div', 'tree-children');
		for (const child of treeNode.children)
			children.append(renderTreeNode(child, selectedKey, actions));
		branch.append(children);
	}
	return branch;
}

function renderComponentDetails(model: ExactDevtoolsPanelModel): HTMLElement {
	const details = node('section', 'component-details');
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
	details.append(
		previewSection('State', state, 'State is empty'),
		previewSection('Props', props, 'No props'),
		contextSection(model.contexts),
		taskSection(model.tasks)
	);
	if (model.dependency !== undefined) {
		const dependency = document.createElement('details');
		dependency.className = 'detail-section';
		const summary = document.createElement('summary');
		summary.textContent = 'Reactive dependency';
		const content = node('pre', 'protocol-preview');
		content.textContent = JSON.stringify(model.dependency, null, 2);
		dependency.append(summary, content);
		details.append(dependency);
	}
	return details;
}

function previewSection(
	title: string,
	preview: ExactValuePreview,
	emptyLabel: string
): HTMLElement {
	const section = document.createElement('details');
	section.className = 'detail-section';
	section.open = title === 'State';
	const summary = document.createElement('summary');
	summary.textContent = title;
	section.append(summary);
	if (preview.kind === 'object' && !preview.entries.length) section.append(emptyState(emptyLabel));
	else section.append(renderPreview(preview));
	return section;
}

function renderPreview(preview: ExactValuePreview): HTMLElement {
	if (preview.kind === 'object') {
		const list = node('dl', 'preview-object');
		for (const entry of preview.entries) {
			const key = document.createElement('dt');
			key.textContent = entry.key;
			const value = document.createElement('dd');
			value.append(renderPreview(entry.value));
			list.append(key, value);
		}
		if (preview.truncated) list.append(labeledValue('', '… preview truncated'));
		return list;
	}
	const value = node('span', `preview-value preview-${preview.kind}`);
	value.textContent =
		preview.kind === 'scalar'
			? typeof preview.value === 'string'
				? JSON.stringify(preview.value)
				: String(preview.value)
			: preview.kind === 'function'
				? `ƒ ${preview.name ?? 'anonymous'}`
				: preview.kind === 'dom'
					? `<${preview.tag}${preview.id ? `#${preview.id}` : ''}>`
					: preview.kind === 'redacted'
						? `redacted (${preview.reason})`
						: `unavailable (${preview.reason})`;
	return value;
}

function contextSection(contexts: readonly ExactContextPreview[]): HTMLElement {
	const section = document.createElement('details');
	section.className = 'detail-section';
	const summary = document.createElement('summary');
	summary.textContent = `Contexts (${contexts.length})`;
	section.append(summary);
	if (!contexts.length) section.append(emptyState('No contexts'));
	for (const context of contexts) {
		const row = node('div', 'context-row');
		row.append(
			labeledValue(context.name, context.scope),
			context.value ? renderPreview(context.value) : badge(context.availability, 'neutral')
		);
		section.append(row);
	}
	return section;
}

function taskSection(tasks: readonly ExactTaskRuntimeSnapshot[]): HTMLElement {
	const section = document.createElement('details');
	section.className = 'detail-section';
	const summary = document.createElement('summary');
	summary.textContent = `Tasks & actions (${tasks.length})`;
	section.append(summary);
	if (!tasks.length) section.append(emptyState('No owned tasks or actions'));
	for (const task of tasks) {
		const row = node('div', 'task-row');
		const identity = task.name ?? task.kind ?? task.id.sourceEntityId ?? 'Task';
		const title = node('strong');
		title.textContent = identity;
		const metadata = node('span', 'task-metadata');
		metadata.textContent = `${task.activation} · ${task.placement} · generation ${task.generation}`;
		row.append(title, badge(task.status, task.status), metadata);
		if (task.startedAt !== undefined && task.settledAt !== undefined)
			row.append(badge(formatExactProfilerDuration(task.settledAt - task.startedAt), 'neutral'));
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
