import type {
	ExactInspectionRuntimeId,
	ExactRuntimeSourceLocation
} from '@exactjs/devtools-protocol';
import { createExactDevtoolsPanelSession } from './panel-session.js';
import { createExactExtensionQueryClient } from './port-client.js';
import { chromiumResources, findExactChromiumSourceResource } from './source-provider.js';

const client = createExactExtensionQueryClient(chrome.devtools.inspectedWindow.tabId);
const status = document.querySelector('[data-status]')!;
const navigation = document.querySelector('[data-navigation]')!;
const output = document.querySelector('[data-output]')!;
const openSource = document.querySelector('[data-open-source]') as HTMLButtonElement;
let selected: ExactInspectionRuntimeId | undefined;
let selectedSource: ExactRuntimeSourceLocation | undefined;
let activePanel = 'Components';
let refreshQueued = false;
const panelSession = createExactDevtoolsPanelSession(client, queueRefresh);

for (const panel of [
	'Components',
	'State & Context',
	'Tasks',
	'Dependencies',
	'Timeline',
	'Microfrontends'
]) {
	const button = document.createElement('button');
	button.textContent = panel;
	button.addEventListener('click', () => {
		activePanel = panel;
		void refresh();
	});
	navigation.append(button);
}

document.querySelector('[data-select-element]')?.addEventListener('click', () => {
	chrome.devtools.inspectedWindow.eval(
		`globalThis[Symbol.for('@exactjs/devtools-hook')]?.ownerOfElement($0)`,
		(result, exception) => {
			if (!exception?.isException && result) {
				selected = result as ExactInspectionRuntimeId;
				void refresh();
			}
		}
	);
});
document.querySelector('[data-refresh]')?.addEventListener('click', () => void refresh());
openSource.addEventListener('click', () => void openSelectedSource());
window.addEventListener('unload', () => {
	void panelSession.dispose();
});
void refresh();

async function refresh(): Promise<void> {
	status.textContent = 'Connecting...';
	try {
		const model = await panelSession.load(selected);
		selected = model.selected?.id;
		selectedSource = dependencySource(model.dependency);
		openSource.hidden = !selectedSource;
		if (selected) await client.highlight(selected);
		status.textContent = `${model.components.length} components / ${model.microfrontends.length} microfrontends`;
		const projection =
			activePanel === 'Components'
				? model.components
				: activePanel === 'State & Context'
					? { state: model.state, contexts: model.contexts }
					: activePanel === 'Tasks'
						? model.tasks
						: activePanel === 'Dependencies'
							? (model.dependency ?? { unavailable: 'catalog-not-built' })
							: activePanel === 'Timeline'
								? model.timeline
								: model.microfrontends;
		output.textContent = JSON.stringify(projection, null, 2);
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : 'Inspection unavailable';
		output.textContent = JSON.stringify({ unavailable: 'runtime-not-instrumented' }, null, 2);
	}
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

function queueRefresh(): void {
	if (refreshQueued) return;
	refreshQueued = true;
	setTimeout(() => {
		refreshQueued = false;
		void refresh();
	}, 100);
}
