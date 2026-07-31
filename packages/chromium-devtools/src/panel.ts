import type {
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionEvent,
	ExactRuntimeSourceLocation
} from '@exactjs/devtools-protocol';
import { loadExactProfilerCapture, type ExactDevtoolsPanelModel } from './panel/model.js';
import {
	renderExactComponentsView,
	renderExactMicrofrontendsView,
	renderExactProfilerView
} from './panel/renderer.js';
import { createExactDevtoolsPanelSession } from './panel/session.js';
import { createExactExtensionQueryClient } from './port-client.js';
import { chromiumResources, findExactChromiumSourceResource } from './source-provider.js';

type PanelView = 'Components' | 'Profiler' | 'Microfrontends';

const client = createExactExtensionQueryClient(chrome.devtools.inspectedWindow.tabId);
const status = document.querySelector('[data-status]')!;
const navigation = document.querySelector('[data-navigation]')!;
const output = document.querySelector('[data-output]')!;
const openSource = document.querySelector('[data-open-source]') as HTMLButtonElement;
const record = document.querySelector('[data-record]') as HTMLButtonElement;
const clear = document.querySelector('[data-clear]') as HTMLButtonElement;
let selected: ExactInspectionRuntimeId | undefined;
let selectedSource: ExactRuntimeSourceLocation | undefined;
let activeView: PanelView = 'Components';
let currentModel: ExactDevtoolsPanelModel | undefined;
let recording = false;
let finalizingProfile = false;
let profileCaptured = false;
let profileStartCursor: string | undefined;
let capturedEvents: ExactRuntimeInspectionEvent[] = [];
const capturedCursors = new Set<string>();
let refreshQueued = false;
const navigationButtons = new Map<PanelView, HTMLButtonElement>();
const panelSession = createExactDevtoolsPanelSession(client, receiveEvent);

for (const view of ['Components', 'Profiler', 'Microfrontends'] as const) {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = view;
	button.addEventListener('click', () => {
		activeView = view;
		renderCurrentView();
	});
	navigationButtons.set(view, button);
	navigation.append(button);
}

document.querySelector('[data-select-element]')?.addEventListener('click', () => {
	chrome.devtools.inspectedWindow.eval(
		`globalThis[Symbol.for('@exactjs/devtools-hook')]?.ownerOfElement($0)`,
		(result, exception) => {
			if (!exception?.isException && result) selectComponent(result as ExactInspectionRuntimeId);
		}
	);
});
document.querySelector('[data-refresh]')?.addEventListener('click', () => void refresh());
record.addEventListener('click', () => void toggleRecording());
clear.addEventListener('click', () => {
	capturedEvents = [];
	capturedCursors.clear();
	profileCaptured = false;
	renderCurrentView();
});
openSource.addEventListener('click', () => void openSelectedSource());
window.addEventListener('unload', () => {
	void panelSession.dispose();
});
void refresh();

async function refresh(): Promise<void> {
	status.textContent = 'Connecting…';
	try {
		const model = await panelSession.load(selected);
		currentModel = model;
		selected = model.selected?.id;
		selectedSource = dependencySource(model.dependency);
		openSource.hidden = !selectedSource;
		status.textContent = `${componentTypeCount(model)} component types · ${model.components.length} live instances`;
		renderCurrentView();
		if (selected) await client.highlight(selected);
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : 'Inspection unavailable';
		output.replaceChildren(
			message('Inspection unavailable', 'Reload the page with runtime inspection enabled.')
		);
	}
}

function renderCurrentView(): void {
	for (const [view, button] of navigationButtons) {
		const active = view === activeView;
		button.classList.toggle('active', active);
		button.setAttribute('aria-selected', String(active));
	}
	record.hidden = activeView !== 'Profiler';
	clear.hidden = activeView !== 'Profiler' || (!capturedEvents.length && !recording);
	record.disabled = finalizingProfile;
	record.textContent = finalizingProfile ? 'Loading…' : recording ? 'Stop' : 'Record';
	record.classList.toggle('recording', recording);
	if (!currentModel) return;
	const actions = {
		selectComponent(id: ExactInspectionRuntimeId) {
			selectComponent(id);
		}
	};
	if (activeView === 'Components') renderExactComponentsView(output, currentModel, actions);
	else if (activeView === 'Profiler')
		renderExactProfilerView(
			output,
			currentModel,
			capturedEvents,
			recording,
			actions,
			profileCaptured
		);
	else renderExactMicrofrontendsView(output, currentModel.microfrontends);
}

function selectComponent(identity: ExactInspectionRuntimeId): void {
	selected = identity;
	activeView = 'Components';
	void refresh();
}

async function toggleRecording(): Promise<void> {
	if (recording) {
		recording = false;
		finalizingProfile = true;
		renderCurrentView();
		try {
			const retained = await loadExactProfilerCapture(client, profileStartCursor);
			mergeCapturedEvents(retained);
		} catch (error) {
			status.textContent =
				error instanceof Error
					? `Profile capture: ${error.message}`
					: 'Profile capture unavailable';
		} finally {
			finalizingProfile = false;
			profileCaptured = true;
			status.textContent = `Profile ready · ${capturedEvents.length} events`;
			renderCurrentView();
		}
		return;
	}
	capturedEvents = [];
	capturedCursors.clear();
	profileCaptured = false;
	profileStartCursor = currentModel?.timelineCursor;
	recording = true;
	activeView = 'Profiler';
	renderCurrentView();
}

function receiveEvent(event: ExactRuntimeInspectionEvent): void {
	if (recording) mergeCapturedEvents([event]);
	queueRefresh();
}

function mergeCapturedEvents(events: readonly ExactRuntimeInspectionEvent[]): void {
	for (const event of events) {
		const key = captureEventKey(event);
		if (capturedCursors.has(key)) continue;
		capturedCursors.add(key);
		capturedEvents.push(event);
		if (capturedEvents.length > 5_000) {
			const removed = capturedEvents.shift();
			if (removed) capturedCursors.delete(captureEventKey(removed));
		}
	}
	capturedEvents.sort((left, right) => left.sequence - right.sequence);
}

function captureEventKey(event: ExactRuntimeInspectionEvent): string {
	return [
		event.id.side,
		event.id.binding ?? '',
		event.id.buildKey,
		event.id.executionRoot,
		event.cursor,
		event.sequence
	].join('\u001f');
}

async function openSelectedSource(): Promise<void> {
	if (!selected || !selectedSource) return;
	const resource = await findExactChromiumSourceResource(selectedSource, await chromiumResources());
	if (resource) {
		chrome.devtools.panels.openResource(resource.url, Math.max(0, selectedSource.start.line - 1));
		return;
	}
	const response = await client.request({
		protocol: 1,
		id: 'panel:source.excerpt',
		method: 'source.excerpt',
		params: {
			identity: selected,
			path: selectedSource.path,
			sourceHash: selectedSource.sourceHash
		}
	});
	if (!response.ok) {
		status.textContent = 'Matching source is unavailable';
		return;
	}
	chrome.devtools.panels.openResource(
		selectedSource.path,
		Math.max(0, selectedSource.start.line - 1)
	);
}

function dependencySource(value: unknown): ExactRuntimeSourceLocation | undefined {
	if (!value || typeof value !== 'object' || !('source' in value)) return undefined;
	const source = (value as { source?: unknown }).source;
	if (
		!source ||
		typeof source !== 'object' ||
		typeof (source as { path?: unknown }).path !== 'string' ||
		typeof (source as { sourceHash?: unknown }).sourceHash !== 'string' ||
		typeof (source as { start?: { line?: unknown } }).start?.line !== 'number'
	)
		return undefined;
	return source as ExactRuntimeSourceLocation;
}

function componentTypeCount(model: ExactDevtoolsPanelModel): number {
	return new Set(
		model.components.map(
			(component) =>
				`${component.id.buildKey}\u001f${component.id.executionRoot}\u001f${component.id.componentTypeId}`
		)
	).size;
}

function queueRefresh(): void {
	if (refreshQueued) return;
	refreshQueued = true;
	setTimeout(() => {
		refreshQueued = false;
		void refresh();
	}, 100);
}

function message(titleText: string, description: string): HTMLElement {
	const element = document.createElement('div');
	element.className = 'empty-state';
	const title = document.createElement('strong');
	title.textContent = titleText;
	const detail = document.createElement('p');
	detail.textContent = description;
	element.append(title, detail);
	return element;
}
