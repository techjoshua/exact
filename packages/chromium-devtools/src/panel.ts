import type { ExactInspectionRuntimeId } from '@exactjs/devtools-protocol';
import { loadExactDevtoolsPanelModel } from './panel-model.js';
import { createExactExtensionQueryClient } from './port-client.js';

const client = createExactExtensionQueryClient(chrome.devtools.inspectedWindow.tabId);
const status = document.querySelector('[data-status]')!;
const navigation = document.querySelector('[data-navigation]')!;
const output = document.querySelector('[data-output]')!;
let selected: ExactInspectionRuntimeId | undefined;
let activePanel = 'Components';

for (const panel of [
	'Components',
	'State & Context',
	'Tasks & Actions',
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
window.addEventListener('unload', () => void client.disconnect());
void refresh();

async function refresh(): Promise<void> {
	status.textContent = 'Connecting…';
	try {
		const model = await loadExactDevtoolsPanelModel(client, selected);
		selected = model.selected?.id;
		if (selected) await client.highlight(selected);
		status.textContent = `${model.components.length} components · ${model.microfrontends.length} microfrontends`;
		const projection =
			activePanel === 'Components'
				? model.components
				: activePanel === 'State & Context'
					? { state: model.state, contexts: model.contexts }
					: activePanel === 'Tasks & Actions'
						? { tasks: model.tasks, actions: model.actions }
						: activePanel === 'Dependencies'
							? model.dependency ?? { unavailable: 'catalog-not-built' }
							: activePanel === 'Timeline'
								? model.timeline
								: model.microfrontends;
		output.textContent = JSON.stringify(projection, null, 2);
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : 'Inspection unavailable';
		output.textContent = JSON.stringify({ unavailable: 'runtime-not-instrumented' }, null, 2);
	}
}
