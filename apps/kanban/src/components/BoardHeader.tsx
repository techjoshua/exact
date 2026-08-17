import { ErrorContext, type Component } from '@exactjs/core';
import { BoardContext } from '../context.js';

type BoardHeaderProps = {
	draft: string;
	total: number;
};

/** Renders the kanban sample header and new-task controls. */
export function BoardHeader(this: Component<{}>, props: BoardHeaderProps) {
	const board = this.getContext(BoardContext);
	const errors = this.getContext(ErrorContext);
	const summary = `${props.total} ${props.total == 1 ? 'task' : 'tasks'} saved locally`;

	return () => (
		<header className="toolbar">
			<div>
				<h1 theme:text="display">eXact Kanban</h1>
				<p theme:text="supporting">{summary}</p>
			</div>
			<div className="toolbar-actions">
				<button
					theme:action="quiet"
					type="button"
					className="quiet-button"
					onClick={() => {
						errors.report(new Error('Sample reported error'), {
							source: 'component',
							phase: 'manual'
						});
					}}
				>
					Report error
				</button>
				<button
					theme:action="quiet"
					type="button"
					className="quiet-button"
					onClick={() => {
						throw new Error('Sample error boundary test');
					}}
				>
					Throw error
				</button>
				<form
					className="new-task"
					onSubmit={(event) => {
						event.preventDefault();
						board.addTask();
					}}
				>
					<input
						theme:field="default"
						value={props.draft}
						placeholder="Add a task"
						onInput={(event) => {
							board.setDraft(event.currentTarget.value);
						}}
					/>
					<button theme:action="primary" type="submit" disabled={props.draft.trim().length === 0}>
						Add
					</button>
				</form>
			</div>
		</header>
	);
}
