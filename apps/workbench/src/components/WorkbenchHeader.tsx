import type { Component } from '@exactjs/core';
import { WorkbenchContext } from '../context.js';
import type { SyncState, ViewMode } from '../types.js';

type WorkbenchHeaderProps = {
	query: string;
	draftTitle: string;
	view: ViewMode;
	total: number;
	visible: number;
	syncState: SyncState;
};

/** Renders workbench search, view, action, and new-task controls. */
export function WorkbenchHeader(this: Component<{}>, props: WorkbenchHeaderProps) {
	const workbench = this.getContext(WorkbenchContext);

	return () => (
		<header className="workbench-header">
			<div>
				<a className="docs-link" href="../">
					Documentation
				</a>
				<h1 theme:text="display">Project Workbench</h1>
				<p theme:text="supporting">
					{props.visible} of {props.total} tasks visible · {syncLabel(props.syncState)}
				</p>
			</div>

			<div className="header-controls">
				<input
					theme:field="subtle"
					type="search"
					placeholder="Search tasks, owners, labels"
					value={props.query}
					onInput={(event) => workbench.setQuery(event.currentTarget.value)}
				/>
				<div theme:surface="sunken" className="segmented" role="group" aria-label="View mode">
					<button
						theme:selection="strong"
						type="button"
						className:active={props.view === 'board'}
						onClick={() => workbench.setView('board')}
					>
						Board
					</button>
					<button
						theme:selection="strong"
						type="button"
						className:active={props.view === 'list'}
						onClick={() => workbench.setView('list')}
					>
						List
					</button>
				</div>
				<button theme:action="quiet" type="button" onClick={() => workbench.openPalette()}>
					Actions
				</button>
				<form
					className="new-task"
					onSubmit={(event) => {
						event.preventDefault();
						workbench.createTask();
					}}
				>
					<input
						theme:field="default"
						type="text"
						placeholder="New task"
						value={props.draftTitle}
						onInput={(event) => workbench.setDraftTitle(event.currentTarget.value)}
					/>
					<button theme:action="primary" type="submit">
						Add
					</button>
				</form>
			</div>
		</header>
	);
}

function syncLabel(state: SyncState): string {
	if (state === 'saving') return 'saving';
	if (state === 'synced') return 'saved';
	if (state === 'failed') return 'sync failed';
	return 'idle';
}
