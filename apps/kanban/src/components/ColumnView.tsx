import type { Component } from '@exactjs/core';
import { _ } from '@exactjs/jsx';
import { BoardContext } from '../context.js';
import type { Column, DragPlacement, Task } from '../types.js';
import { TaskCard } from './TaskCard.jsx';

type ColumnViewProps = {
	column: Column;
	tasks: Task[];
	dragPlacement?: DragPlacement;
};

/** Renders one kanban status column and its task cards. */
export function ColumnView(this: Component<{}>, props: ColumnViewProps) {
	const board = this.getContext(BoardContext);

	const dropTask = (event: DragEvent) => {
		event.preventDefault();
		const taskId = event.dataTransfer?.getData('text/plain');
		this.log.debug('drop', {
			column: props.column.id,
			taskId,
			hasDataTransfer: Boolean(event.dataTransfer)
		});
		if (taskId) board.commitTaskDrop(taskId, props.column.id);
	};

	const allowDrop = (event: DragEvent) => {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		this.log.trace('dragover', {
			column: props.column.id,
			hasDataTransfer: Boolean(event.dataTransfer)
		});
	};

	const columnTasks = props.tasks.filter((task) => task.status === props.column.id);
	const countLabel = columnTasks.length === 1 ? '1 task' : `${columnTasks.length} tasks`;

	return () => (
		<article
			theme:surface="sunken"
			id={`column-${props.column.id}`}
			className="column"
			className:empty={columnTasks.length === 0}
			onDragEnter={(event) => allowDrop(event)}
			onDragOver={(event) => allowDrop(event)}
			onDrop={(event) => dropTask(event)}
		>
			<header>
				<h2>{props.column.title}</h2>
				<span>{countLabel}</span>
			</header>

			<div className="cards">
				{columnTasks.length === 0 ? (
					props.dragPlacement?.status === props.column.id ? (
						<div className="drop-marker" />
					) : (
						<p className="empty-state">Drop a card here</p>
					)
				) : (
					<>
						{columnTasks.map((task) => (
							<_ key={task.id}>
								{props.dragPlacement?.status === props.column.id &&
								props.dragPlacement.beforeTaskId === task.id ? (
									<div className="drop-marker" />
								) : null}
								<TaskCard task={task} />
							</_>
						))}
						{props.dragPlacement?.status === props.column.id &&
						props.dragPlacement.beforeTaskId === undefined ? (
							<div className="drop-marker" />
						) : null}
					</>
				)}
			</div>
		</article>
	);
}
