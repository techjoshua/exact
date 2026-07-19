import type { Component } from '@exact/core';
import type { Task } from '../types.js';
import { TaskCard } from './TaskCard.jsx';

type ListViewProps = {
	tasks: Task[];
};

/** Renders the workbench list view for visible tasks. */
export function ListView(this: Component<{}>, props: ListViewProps) {
	return () => (
		<section className="list-view" aria-label="Task list">
			{props.tasks.length ? (
				props.tasks.map((task) => <TaskCard task={task} compact={true} />)
			) : (
				<p className="empty-state">No matching tasks.</p>
			)}
		</section>
	);
}
