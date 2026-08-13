import type { ExactTaskRuntimeSnapshot } from '@exactjs/devtools-protocol';
import { formatExactProfilerDuration } from './view-model.js';
import { renderExactValuePreview } from './value-preview.js';

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
		const execution = document.createElement('details');
		execution.className = 'task-execution';
		execution.setAttribute('data-panel-disclosure-key', taskDisclosureKey(task));
		const row = document.createElement('summary');
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
		execution.append(row);
		if (task.arguments)
			execution.append(
				taskValue('Arguments', task.arguments, [taskDisclosureKey(task), 'arguments'])
			);
		if (task.result)
			execution.append(taskValue('Result', task.result, [taskDisclosureKey(task), 'result']));
		if (task.error)
			execution.append(taskValue('Error', task.error, [taskDisclosureKey(task), 'error']));
		section.append(execution);
	}
	return section;
}

function taskValue(
	label: string,
	preview: NonNullable<ExactTaskRuntimeSnapshot['result']>,
	path: readonly string[]
): HTMLElement {
	const row = document.createElement('div');
	row.className = 'task-value';
	const heading = document.createElement('span');
	heading.className = 'task-value-label';
	heading.textContent = label;
	row.append(heading, renderExactValuePreview(preview, path));
	return row;
}

function taskDisclosureKey(task: ExactTaskRuntimeSnapshot): string {
	return `task:${task.id.sourceEntityId ?? task.kind ?? 'anonymous'}:${task.generation}`;
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
