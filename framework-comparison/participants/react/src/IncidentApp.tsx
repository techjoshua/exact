import { useCallback, useEffect, useState } from 'react';
import { IncidentDetail } from './IncidentDetail.js';
import { IncidentQueue } from './IncidentQueue.js';
import { loadIncidentData, serviceUrl } from './service-client.js';
import type { Incident, InitialData, User } from './types.js';

/** Coordinates React-owned queue resources, selection, and the application live connection. */
export function IncidentApp({
	initialData,
	path
}: { initialData?: InitialData; path?: string } = {}) {
	const [incidents, setIncidents] = useState<Incident[]>(initialData?.incidents ?? []);
	const [users, setUsers] = useState<User[]>(initialData?.users ?? []);
	const [sessionUserId, setSessionUserId] = useState(initialData?.sessionUserId ?? '');
	const [selectedId, setSelectedId] = useState(
		() => incidentIdFromPath(path) || initialData?.incidents[0]?.id || ''
	);
	const [loading, setLoading] = useState(!initialData);
	const [error, setError] = useState('');
	const [connection, setConnection] = useState('Connecting');

	const replaceIncident = useCallback((incident: Incident) => {
		setIncidents((current) =>
			current.map((candidate) => (candidate.id === incident.id ? incident : candidate))
		);
	}, []);

	const loadQueue = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const result = await loadIncidentData();
			setSessionUserId(result.sessionUserId);
			setUsers(result.users);
			setIncidents(result.incidents);
			setSelectedId((current) => current || result.incidents[0]?.id || '');
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Unable to load incidents');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!initialData) void loadQueue();
		const events = new EventSource(`${serviceUrl}/api/events`);
		events.onopen = () => setConnection('Live service');
		events.onerror = () => setConnection('Reconnecting');
		events.addEventListener('incident', (event) =>
			replaceIncident(JSON.parse((event as MessageEvent<string>).data) as Incident)
		);
		const followLocation = () => setSelectedId(incidentIdFromPath());
		window.addEventListener('popstate', followLocation);
		return () => {
			events.close();
			window.removeEventListener('popstate', followLocation);
		};
	}, [initialData, loadQueue, replaceIncident]);

	const selectIncident = (id: string) => {
		setSelectedId(id);
		history.pushState({}, '', `/incidents/${id}`);
	};
	const selectedIncident = incidents.find((incident) => incident.id === selectedId);

	return (
		<div className="app-shell">
			<header className="masthead">
				<div>
					<span className="eyebrow">Operations workspace</span>
					<h1>Signal Desk</h1>
				</div>
				<span className="connection" role="status">
					{connection}
				</span>
			</header>
			<main>
				<IncidentQueue
					incidents={incidents}
					selectedId={selectedId}
					onSelectedIdChanged={selectIncident}
					loading={loading}
					error={error}
					onRefresh={() => void loadQueue()}
				/>
				<IncidentDetail
					key={selectedIncident?.id ?? 'empty'}
					incident={selectedIncident}
					users={users}
					sessionUserId={sessionUserId}
					onIncident={replaceIncident}
				/>
			</main>
		</div>
	);
}

function incidentIdFromPath(path = typeof window === 'undefined' ? '/' : window.location.pathname) {
	return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
}
