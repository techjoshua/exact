import type { Component } from '@exactjs/core';
import { BoardContext } from '../context.js';
import { columns } from '../data.js';
import type { Status, Task } from '../types.js';

type TaskDetailsState = {
	taskId?: string;
};

type TaskDetailsDialogProps = {
	task?: Task;
};

/** Renders the kanban task details dialog for the selected task. */
export function TaskDetailsDialog(
	this: Component<TaskDetailsState>,
	props: TaskDetailsDialogProps
) {
	const board = this.getContext(BoardContext);
	const taskId = props.task?.id ?? '';
	const title = props.task?.title ?? '';
	const status = props.task?.status ?? 'todo';
	const notes = props.task?.notes ?? '';

	this.state.taskId = taskId;
	this.onMount(() => this.log.debug('details mount', { taskId }));
	this.onUnmount(() => this.log.debug('details unmount', { taskId }));

	return () => (
		<div className="dialog-backdrop" onClick={board.closeTask}>
			<section
				className="task-dialog"
				onClick={(event) => {
					event.stopPropagation();
				}}
				onFocusIn={(event) => {
					this.log.debug('details focusin', {
						taskId,
						target: eventTargetName(event.target),
						active: activeElementName()
					});
				}}
				onFocusOut={(event) => {
					this.log.debug('details focusout', {
						taskId,
						target: eventTargetName(event.target),
						relatedTarget: eventTargetName(event.relatedTarget),
						active: activeElementName()
					});
				}}
			>
				<header>
					<h2>Edit card</h2>
					<button type="button" className="quiet-button" onClick={board.closeTask}>
						Close
					</button>
				</header>

				<label>
					<span>Title</span>
					<input
						defaultValue={title}
						onFocusIn={(event) => {
							this.log.debug('title focusin', {
								taskId,
								target: eventTargetName(event.target),
								active: activeElementName()
							});
						}}
						onFocusOut={(event) => {
							this.log.debug('title focusout', {
								taskId,
								relatedTarget: eventTargetName(event.relatedTarget),
								active: activeElementName()
							});
						}}
						onInput={(event) => {
							const title = event.currentTarget.value;
							this.log.debug('title input', {
								taskId,
								value: title,
								active: activeElementName()
							});
							board.updateTask(taskId, {
								title
							});
						}}
					/>
				</label>

				<label>
					<span>Status</span>
					<select
						value={status}
						onChange={(event) => {
							board.updateTask(taskId, {
								status: event.currentTarget.value as Status
							});
						}}
					>
						{columns.map((column) => (
							<option value={column.id}>{column.title}</option>
						))}
					</select>
				</label>

				<label>
					<span>Notes</span>
					<textarea
						defaultValue={notes}
						rows={8}
						onFocusIn={(event) => {
							this.log.debug('notes focusin', {
								taskId,
								target: eventTargetName(event.target),
								active: activeElementName()
							});
						}}
						onFocusOut={(event) => {
							this.log.debug('notes focusout', {
								taskId,
								relatedTarget: eventTargetName(event.relatedTarget),
								active: activeElementName()
							});
						}}
						onInput={(event) => {
							const notes = event.currentTarget.value;
							this.log.debug('notes input', {
								taskId,
								length: notes.length,
								active: activeElementName()
							});
							board.updateTask(taskId, {
								notes
							});
						}}
					/>
				</label>
			</section>
		</div>
	);
}

function activeElementName(): string {
	const active = document.activeElement;
	return elementName(active);
}

function eventTargetName(target: EventTarget | null): string {
	return target instanceof Element ? elementName(target) : 'none';
}

function elementName(element: Element | null): string {
	if (!element) return 'none';
	const tag = element.tagName.toLowerCase();
	if (element instanceof HTMLInputElement) return `${tag}[type=${element.type}]`;
	if (element instanceof HTMLButtonElement)
		return `${tag}[text=${element.textContent?.trim() ?? ''}]`;
	return tag;
}
