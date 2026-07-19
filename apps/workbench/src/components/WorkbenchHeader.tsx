import type { Component } from '@exact/core';
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
				<h1>Project Workbench</h1>
				<p>
					{props.visible} of {props.total} tasks visible · {syncLabel(props.syncState)}
				</p>
			</div>

			<div className="header-controls">
				<input
					type="search"
					placeholder="Search tasks, owners, labels"
					value={props.query}
					onInput={(event) => workbench.setQuery((event.currentTarget as HTMLInputElement).value)}
				/>
				<div className="segmented" role="group" aria-label="View mode">
					<button
						type="button"
						className={props.view === 'board' ? 'active' : ''}
						onClick={() => workbench.setView('board')}
					>
						Board
					</button>
					<button
						type="button"
						className={props.view === 'list' ? 'active' : ''}
						onClick={() => workbench.setView('list')}
					>
						List
					</button>
				</div>
				<button type="button" className="quiet-button" onClick={() => workbench.openPalette()}>
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
						type="text"
						placeholder="New task"
						value={props.draftTitle}
						onInput={(event) =>
							workbench.setDraftTitle((event.currentTarget as HTMLInputElement).value)
						}
					/>
					<button type="submit">Add</button>
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
