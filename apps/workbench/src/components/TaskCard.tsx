import type { Component } from '@exact/core';
import { WorkbenchContext } from '../context.js';
import { columns } from '../data.js';
import type { Status, Task } from '../types.js';

type TaskCardProps = {
	task: Task;
	compact?: boolean;
};

/** Renders a workbench task card with status controls and labels. */
export function TaskCard(this: Component<{}>, props: TaskCardProps) {
	const workbench = this.getContext(WorkbenchContext);

	return () => (
		<article className={['task-card', props.compact && 'compact']}>
			<span className={`task-priority priority ${props.task.priority}`}>{props.task.priority}</span>
			<button type="button" className="task-title" onClick={() => workbench.selectTask(props.task)}>
				{props.task.title}
			</button>
			<p className="task-owner">Owner: {props.task.owner}</p>
			<p>{props.task.notes || 'No notes yet.'}</p>
			<div className="move-row">
				{columns.map((column) => (
					<button
						type="button"
						className={props.task.status === column.id ? 'active' : ''}
						disabled={props.task.status === column.id}
						onClick={() => workbench.moveTask(props.task, column.id as Status)}
					>
						{column.title}
					</button>
				))}
			</div>
			{props.task.labels.length ? (
				<div className="label-row">
					{props.task.labels.map((label) => (
						<span>{label}</span>
					))}
				</div>
			) : null}
		</article>
	);
}
