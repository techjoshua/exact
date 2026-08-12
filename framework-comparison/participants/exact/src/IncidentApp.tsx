import { batch, peek, TaskContext, type Component } from '@exactjs/core';
import { IncidentDetail } from './IncidentDetail.jsx';
import { IncidentQueue } from './IncidentQueue.jsx';
import { subscribeLiveService } from './live-service.js';
import { loadIncidentData } from './service-client.js';
import type { Incident, InitialData, User } from './types.js';

type AppState = {
	incidents: Incident[];
	users: User[];
	sessionUserId: string;
	selectedId: string;
	error: string;
	loading: boolean;
	connection: string;
};

/** Coordinates queue selection, authoritative resources, and the application-owned live connection. */
export function IncidentApp(
	this: Component<AppState>,
	props: { initialData?: InitialData; path?: string }
) {
	const state = this.state;
	this.state.incidents = props.initialData?.incidents ?? [];
	this.state.users = props.initialData?.users ?? [];
	this.state.sessionUserId = props.initialData?.sessionUserId ?? '';
	this.state.selectedId =
		incidentIdFromPath(props.path) || props.initialData?.incidents[0]?.id || '';
	this.state.error = '';
	this.state.loading = !props.initialData;
	this.state.connection = 'Connecting';

	const replaceIncident = (
		incident: Incident,
		mode: 'optimistic' | 'authoritative' = 'authoritative'
	) => {
		const current = this.state.incidents.find((candidate) => candidate.id === incident.id);
		if (
			!current ||
			(mode === 'authoritative' &&
				(current.version > incident.version || sameIncidentResource(current, incident)))
		)
			return;
		batch(() => {
			current.ownerId = incident.ownerId;
			current.status = incident.status;
			current.version = incident.version;
			if (!sameComments(current.comments, incident.comments)) current.comments = incident.comments;
		});
	};

	async function loadQueue(task: TaskContext = TaskContext.client().latest()) {
		state.loading = true;
		state.error = '';
		try {
			const result = await loadIncidentData(task.signal);
			state.sessionUserId = result.sessionUserId;
			state.users = result.users;
			state.incidents = result.incidents;
			if (!peek(() => state.selectedId)) state.selectedId = result.incidents[0]?.id ?? '';
		} catch (caught) {
			state.error = caught instanceof Error ? caught.message : 'Unable to load incidents';
		} finally {
			state.loading = false;
		}
	}

	const selectIncident = (id: string) => {
		this.state.selectedId = id;
		history.pushState({}, '', `/incidents/${id}`);
	};
	const refreshQueue = () => void loadQueue();

	if (!props.initialData) void loadQueue();
	this.onMount(({ signal }) => {
		subscribeLiveService(
			{
				onConnection: (connection) => (this.state.connection = connection),
				onIncident: (incident) => replaceIncident(incident, 'authoritative')
			},
			signal
		);
		const followLocation = () => {
			this.state.selectedId = incidentIdFromPath();
		};
		window.addEventListener('popstate', followLocation, { signal });
	});

	const selectedIncident = this.state.incidents.find(
		(incident) => incident.id === this.state.selectedId
	);

	return () => (
		<div className="app-shell">
			<header className="masthead">
				<div>
					<span className="eyebrow">Operations workspace</span>
					<h1>Signal Desk</h1>
				</div>
				<span className="connection" role="status">
					{this.state.connection}
				</span>
			</header>
			<main>
				<IncidentQueue
					incidents={this.state.incidents}
					selectedId={this.state.selectedId}
					onSelectedIdChanged={selectIncident}
					loading={this.state.loading}
					error={this.state.error}
					onRefresh={refreshQueue}
				/>
				<IncidentDetail
					incident={selectedIncident}
					users={this.state.users}
					sessionUserId={this.state.sessionUserId}
					onIncident={replaceIncident}
				/>
			</main>
		</div>
	);
}

/** Distinguishes a duplicate transport delivery from an equal-version optimistic projection. */
function sameIncidentResource(left: Incident, right: Incident): boolean {
	return (
		left.version === right.version &&
		left.ownerId === right.ownerId &&
		left.status === right.status &&
		sameComments(left.comments, right.comments)
	);
}

/** Preserves the existing reactive branch when a transport copy contains identical comments. */
function sameComments(left: Incident['comments'], right: Incident['comments']): boolean {
	return (
		left.length === right.length &&
		left.every((comment, index) => {
			const candidate = right[index];
			return (
				candidate?.id === comment.id &&
				candidate.authorId === comment.authorId &&
				candidate.body === comment.body &&
				candidate.createdAt === comment.createdAt
			);
		})
	);
}

function incidentIdFromPath(path = typeof window === 'undefined' ? '/' : window.location.pathname) {
	return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
}
