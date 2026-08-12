import { peek, TaskContext, type Component } from '@exactjs/core';
import { IncidentDetail } from './IncidentDetail.jsx';
import { IncidentQueue } from './IncidentQueue.jsx';
import { loadIncidentData, serviceUrl } from './service-client.js';
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

	const replaceIncident = (incident: Incident) => {
		const current = this.state.incidents.find((candidate) => candidate.id === incident.id);
		if (current) Object.assign(current, incident);
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
		const events = new EventSource(`${serviceUrl}/api/events`);
		events.onopen = () => (this.state.connection = 'Live service');
		events.onerror = () => (this.state.connection = 'Reconnecting');
		events.addEventListener('incident', (event) =>
			replaceIncident(JSON.parse((event as MessageEvent<string>).data) as Incident)
		);
		const followLocation = () => {
			this.state.selectedId = incidentIdFromPath();
		};
		window.addEventListener('popstate', followLocation, { signal });
		signal.addEventListener('abort', () => events.close(), { once: true });
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

function incidentIdFromPath(path = typeof window === 'undefined' ? '/' : window.location.pathname) {
	return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
}
