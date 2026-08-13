import { peek, TaskContext, type Component } from '@exactjs/core';
import { navigateToIncident, openIncidentEvents } from './browser-events.js';
import { analyze, claimResult, comment, snapshot } from './native-store.js';
import type { NativeInitialData, WorkspaceState } from './contracts.js';
import { renderWorkspace } from './workspace-view.js';

/** Loads the native domain snapshot on the server before rendering the interactive workspace. */
export function NativeIncidentPage(
	this: Component<{ initial?: NativeInitialData }>,
	props: { path: string }
) {
	const loadInitial = async (_task: TaskContext = TaskContext.server().blocking()) => {
		this.state.initial = snapshot();
	};
	void loadInitial();
	return () =>
		this.state.initial ? (
			<NativeIncidentWorkspace initial={this.state.initial} path={props.path} />
		) : (
			<p>Loading incidents…</p>
		);
}

/** Owns the durable native state machine and compiler-generated client/server operations. */
export function NativeIncidentWorkspace(
	this: Component<WorkspaceState>,
	props: { initial: NativeInitialData; path: string }
) {
	const state = this.state;
	this.state.incidents = peek(() => props.initial.incidents.map(copyIncident));
	this.state.users = peek(() => props.initial.users.map((user) => ({ ...user })));
	this.state.sessionUserId = peek(() => props.initial.sessionUserId);
	const initialSelectedId = peek(
		() => incidentIdFromPath(props.path) || props.initial.incidents[0]?.id || ''
	);
	this.state.selectedId = initialSelectedId;
	this.state.severity = 'all';
	this.state.status = 'all';
	this.state.draft = '';
	this.state.conflict = '';
	this.state.error = '';
	this.state.job = null;
	this.state.busy = false;
	this.state.viewedIncidentId = initialSelectedId;
	this.state.viewedVersion = peek(
		() =>
			props.initial.incidents.find((incident) => incident.id === initialSelectedId)?.version ?? 0
	);

	async function refreshOnServer(_task: TaskContext = TaskContext.server().latest()) {
		return snapshot();
	}
	async function claimOnServer(
		id: string,
		actorId: string,
		expectedVersion: number,
		_task: TaskContext = TaskContext.server()
	) {
		return claimResult(id, actorId, expectedVersion);
	}
	async function commentOnServer(
		id: string,
		actorId: string,
		body: string,
		mutationId: string,
		_task: TaskContext = TaskContext.server()
	) {
		return comment(id, actorId, body, mutationId);
	}
	async function analyzeOnServer(id: string, _task: TaskContext = TaskContext.server()) {
		return analyze(id);
	}

	const replaceIncident = (incident: WorkspaceState['incidents'][number]) => {
		this.state.incidents = this.state.incidents.map((current) =>
			current.id === incident.id ? incident : current
		);
	};
	const selectIncident = (id: string, _task: TaskContext = TaskContext.client()) => {
		this.state.selectedId = id;
		this.state.viewedIncidentId = id;
		this.state.viewedVersion = this.state.incidents.find((item) => item.id === id)?.version ?? 0;
		navigateToIncident(id);
	};
	const refresh = async () => {
		state.error = '';
		try {
			const result = await refreshOnServer();
			state.incidents = result.incidents;
			state.users = result.users;
			state.sessionUserId = result.sessionUserId;
		} catch (caught) {
			state.error = caught instanceof Error ? caught.message : 'Unable to refresh incidents';
		}
	};
	const claimSelected = async () => {
		const incident = state.incidents.find((item) => item.id === state.selectedId);
		if (!incident) return;
		const original = copyIncident(incident);
		replaceIncident({ ...original, ownerId: state.sessionUserId, status: 'investigating' });
		state.conflict = '';
		state.error = '';
		try {
			const result = await claimOnServer(original.id, state.sessionUserId, state.viewedVersion);
			if (result.conflict) {
				replaceIncident(result.conflict);
				state.viewedVersion = result.conflict.version;
				state.conflict =
					'This incident changed while you were viewing it. The latest owner is shown.';
			} else if (result.incident) {
				replaceIncident(result.incident);
				state.viewedVersion = result.incident.version;
			}
		} catch (caught) {
			replaceIncident(original);
			state.error = caught instanceof Error ? caught.message : 'Unable to claim incident';
		}
	};
	const addComment = async () => {
		const incident = state.incidents.find((item) => item.id === state.selectedId);
		const body = state.draft.trim();
		if (!incident || !body) return;
		state.draft = '';
		try {
			const result = await commentOnServer(
				incident.id,
				state.sessionUserId,
				body,
				crypto.randomUUID()
			);
			replaceIncident(result);
			state.viewedVersion = result.version;
		} catch (caught) {
			state.draft = body;
			state.error = caught instanceof Error ? caught.message : 'Unable to add comment';
		}
	};
	const startAnalysis = async () => {
		if (!state.selectedId) return;
		state.busy = true;
		try {
			const job = await analyzeOnServer(state.selectedId);
			state.job = job;
		} catch (caught) {
			state.error = caught instanceof Error ? caught.message : 'Unable to start analysis';
		} finally {
			state.busy = false;
		}
	};
	const connectEvents = (signal: AbortSignal, _task: TaskContext = TaskContext.client()) => {
		openIncidentEvents(
			(incident) => replaceIncident(incident),
			(job) => {
				if (job.id === state.job?.id) state.job = job;
			},
			signal
		);
	};
	this.onMount(({ signal }) => {
		connectEvents(signal);
	});

	return () =>
		renderWorkspace(this.state, {
			selectIncident,
			refresh: () => void refresh(),
			claimSelected: () => void claimSelected(),
			addComment: () => void addComment(),
			startAnalysis: () => void startAnalysis()
		});
}

function incidentIdFromPath(path: string) {
	return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
}

function copyIncident(incident: WorkspaceState['incidents'][number]) {
	return { ...incident, comments: incident.comments.map((entry) => ({ ...entry })) };
}
