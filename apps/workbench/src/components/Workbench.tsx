import {
	createConsoleLogger,
	ErrorContext,
	LoggerContext,
	type Component,
	type Logger
} from '@exactjs/core';
import { WorkbenchContext } from '../context.js';
import {
	columns,
	createTask,
	loadTasks,
	parseTaskImport,
	priorities,
	seedTasks,
	statuses,
	storageKey
} from '../data.js';
import type { Status, Task, WorkbenchServices, WorkbenchState } from '../types.js';
import { BoardView } from './BoardView.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { DetailPanel, EmptyDetailPanel } from './DetailPanel.jsx';
import { ImportDialog } from './ImportDialog.jsx';
import { ListView } from './ListView.jsx';
import { WorkbenchHeader } from './WorkbenchHeader.jsx';

type WorkbenchProps = {
	logger?: Logger;
};

/** Renders the project workbench sample and owns its task state/services. */
export function Workbench(this: Component<WorkbenchState>, props: WorkbenchProps) {
	this.setContext(LoggerContext, props.logger ?? createConsoleLogger({ level: 'debug' }));

	this.state.tasks = loadTasks();
	this.state.query = '';
	this.state.draftTitle = '';
	this.state.draftLabel = '';
	this.state.view = 'board';
	this.state.selectedTaskId = undefined;
	this.state.activity = [];
	this.state.paletteOpen = false;
	this.state.importOpen = false;
	this.state.importText = '';
	this.state.importError = undefined;
	this.state.syncState = 'idle';
	const errors = this.getContext(ErrorContext);

	const persistTasks = async (tasksJson: string) => {
		this.state.syncState = 'saving';
		await delay(160);
		localStorage.setItem(storageKey, tasksJson);
		this.state.syncState = 'synced';
	};
	void persistTasks(JSON.stringify(this.state.tasks));

	const remember = (message: string) => {
		this.state.activity = [
			{ id: crypto.randomUUID(), message, at: new Date().toISOString() },
			...this.state.activity.slice(0, 9)
		];
	};

	const touch = (task: Task): Task => {
		return {
			...task,
			updatedAt: new Date().toISOString()
		};
	};

	const updateTask = (
		taskId: string,
		patch: Partial<Pick<Task, 'title' | 'notes' | 'priority' | 'owner' | 'status' | 'labels'>>
	) => {
		const task = this.state.tasks.find((item) => item.id === taskId);
		if (!task) return;
		const safePatch = {
			...patch,
			status: patch.status && statuses.includes(patch.status) ? patch.status : undefined,
			priority: patch.priority && priorities.includes(patch.priority) ? patch.priority : undefined
		};
		const nextTask = touch({
			...task,
			...safePatch,
			status: safePatch.status ?? task.status,
			priority: safePatch.priority ?? task.priority
		});
		this.state.tasks = this.state.tasks.map((item) => (item.id === taskId ? nextTask : item));
		remember(`Updated ${nextTask.title}`);
	};

	const services: WorkbenchServices = {
		setQuery: (value) => {
			this.state.query = value;
		},
		setDraftTitle: (value) => {
			this.state.draftTitle = value;
		},
		setDraftLabel: (value) => {
			this.state.draftLabel = value;
		},
		setView: (value) => {
			this.state.view = value;
		},
		createTask: () => {
			const title = this.state.draftTitle.trim();
			if (!title) return;
			const task = createTask(title);
			this.state.tasks = [task, ...this.state.tasks];
			this.state.draftTitle = '';
			this.state.selectedTaskId = task.id;
			remember(`Created ${task.title}`);
		},
		selectTask: (task) => {
			this.state.selectedTaskId = task.id;
		},
		closeTask: () => {
			this.state.selectedTaskId = undefined;
		},
		moveTask: (task, status: Status) => {
			updateTask(task.id, { status });
		},
		moveSelected: (status) => {
			const selected = this.state.selectedTaskId
				? this.state.tasks.find((task) => task.id === this.state.selectedTaskId)
				: undefined;
			if (selected) updateTask(selected.id, { status });
		},
		updateTask,
		addLabel: (taskId) => {
			const label = this.state.draftLabel.trim();
			if (!label) return;
			const task = this.state.tasks.find((item) => item.id === taskId);
			if (!task || task.labels.includes(label)) return;
			updateTask(task.id, { labels: [...task.labels, label] });
			this.state.draftLabel = '';
		},
		removeLabel: (taskId, label) => {
			const task = this.state.tasks.find((item) => item.id === taskId);
			if (!task) return;
			updateTask(task.id, { labels: task.labels.filter((item) => item !== label) });
		},
		openPalette: () => {
			this.state.paletteOpen = true;
		},
		closePalette: () => {
			this.state.paletteOpen = false;
		},
		openImport: () => {
			this.state.importText = JSON.stringify(this.state.tasks, null, 2);
			this.state.importError = undefined;
			this.state.importOpen = true;
		},
		closeImport: () => {
			this.state.importOpen = false;
			this.state.importError = undefined;
		},
		setImportText: (value) => {
			this.state.importText = value;
			this.state.importError = undefined;
		},
		importTasks: () => {
			try {
				const tasks = parseTaskImport(this.state.importText);
				this.state.tasks = tasks;
				this.state.selectedTaskId = tasks[0]?.id;
				this.state.importOpen = false;
				remember(`Imported ${tasks.length} tasks`);
			} catch (error) {
				this.state.importError = error instanceof Error ? error.message : String(error);
			}
		},
		exportTasks: () => {
			this.state.importText = JSON.stringify(this.state.tasks, null, 2);
			this.state.importError = undefined;
			this.state.importOpen = true;
			remember('Prepared JSON export');
		},
		resetSampleData: () => {
			const tasks = seedTasks();
			this.state.tasks = tasks;
			this.state.selectedTaskId = tasks[0]?.id;
			remember('Reset sample data');
		},
		raiseDemoError: () => {
			const error = new Error('Demo failure from Workbench actions');
			this.state.syncState = 'failed';
			errors.report(error, { source: 'component', phase: 'demo' });
		}
	};

	this.setContext(WorkbenchContext, services);

	const observeKeyboard = () => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				this.state.paletteOpen = true;
			}
			if (event.key === 'Escape') {
				this.state.paletteOpen = false;
				this.state.importOpen = false;
			}
		};
		window.addEventListener('keydown', onKeyDown);
	};
	observeKeyboard();

	const normalizedQuery = this.state.query.trim().toLowerCase();
	const visibleTasks = normalizedQuery
		? this.state.tasks.filter(
				(task) =>
					task.title.toLowerCase().includes(normalizedQuery) ||
					task.notes.toLowerCase().includes(normalizedQuery) ||
					task.owner.toLowerCase().includes(normalizedQuery) ||
					task.labels.some((label) => label.toLowerCase().includes(normalizedQuery))
			)
		: this.state.tasks;
	const selectedTask = this.state.selectedTaskId
		? this.state.tasks.find((task) => task.id === this.state.selectedTaskId)
		: undefined;

	return () => (
		<main className="shell">
			<WorkbenchHeader
				query={this.state.query}
				draftTitle={this.state.draftTitle}
				view={this.state.view}
				total={this.state.tasks.length}
				visible={visibleTasks.length}
				syncState={this.state.syncState}
			/>

			<section className="layout">
				<div className="primary-pane">
					{this.state.view === 'board' ? (
						<BoardView columns={columns} tasks={visibleTasks} />
					) : (
						<ListView tasks={visibleTasks} />
					)}
				</div>

				<aside className="side-pane">
					{selectedTask ? (
						<DetailPanel
							key={selectedTask.id}
							task={selectedTask}
							draftLabel={this.state.draftLabel}
						/>
					) : (
						<EmptyDetailPanel />
					)}
					<section className="activity-panel">
						<h2>Activity</h2>
						{this.state.activity.length ? (
							<ol>
								{this.state.activity.map((item) => (
									<li>
										<span>{formatTime(item.at)}</span>
										{item.message}
									</li>
								))}
							</ol>
						) : (
							<p>No activity yet.</p>
						)}
					</section>
				</aside>
			</section>

			{this.state.paletteOpen ? (
				<CommandPalette tasks={visibleTasks} selectedTask={selectedTask} />
			) : null}
			{this.state.importOpen ? (
				<ImportDialog value={this.state.importText} error={this.state.importError} />
			) : null}
		</main>
	);
}

/**
 * Waits for the debounce window and settles early when its owning task is cancelled.
 * The timer stays inside this adapter because a Promise executor is opaque to compiler ownership.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timeout = setTimeout(resolve, ms);
		if (!signal) return;
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timeout);
				resolve();
			},
			{ once: true }
		);
	});
}

function formatTime(value: string): string {
	return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
