import type { ExactTaskRuntimeSnapshot } from '@exactjs/devtools-protocol';
import { formatExactProfilerDuration } from './view-model.js';

/** Renders the unified task list owned by one selected component instance. */
export function renderTaskSection(tasks: readonly ExactTaskRuntimeSnapshot[]): HTMLElement {
	const section = document.createElement('details');
	section.className = 'detail-section';
	section.setAttribute('data-panel-disclosure-key', 'tasks');
	const summary = document.createElement('summary');
	summary.textContent = `Tasks (${tasks.length})`;
	section.append(summary);
	if (!tasks.length) section.append(taskEmptyState());
	for (const task of tasks) {
		const row = document.createElement('div');
		row.className = 'task-row';
		const title = document.createElement('strong');
		title.textContent = task.name ?? task.kind ?? task.id.sourceEntityId ?? 'Task';
		const metadata = document.createElement('span');
		metadata.className = 'task-metadata';
		metadata.textContent = `${task.activation} · ${task.placement} · generation ${task.generation}`;
		row.append(title, taskBadge(task.status, task.status), metadata);
		if (task.startedAt !== undefined && task.settledAt !== undefined)
			row.append(
				taskBadge(formatExactProfilerDuration(task.settledAt - task.startedAt), 'neutral')
			);
		section.append(row);
	}
	return section;
}

function taskBadge(text: string, tone: string): HTMLElement {
	const element = document.createElement('span');
	element.className = `badge ${tone}`;
	element.textContent = text;
	return element;
}

function taskEmptyState(): HTMLElement {
	const element = document.createElement('p');
	element.className = 'empty-state';
	element.textContent = 'No owned tasks';
	return element;
}
