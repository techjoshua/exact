import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { IncidentDetail } from './IncidentDetail.js';
import { IncidentQueue } from './IncidentQueue.js';
import { subscribeLiveService } from './live-service.js';
import { loadIncidentData } from './service-client.js';
import type { Incident, InitialData, User } from './types.js';

/** Coordinates route-owned selection with React-owned workspace resources and live state. */
export function IncidentApp({ initialData, path }: { initialData: InitialData; path: string }) {
	const navigate = useNavigate();
	const [incidents, setIncidents] = useState<Incident[]>(initialData.incidents);
	const [users, setUsers] = useState<User[]>(initialData.users);
	const [sessionUserId, setSessionUserId] = useState(initialData.sessionUserId);
	const [selectedId, setSelectedId] = useState(
		() => incidentIdFromPath(path) || initialData.incidents[0]?.id || ''
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [connection, setConnection] = useState('Connecting');

	useEffect(() => {
		const routedId = incidentIdFromPath(path);
		if (routedId) setSelectedId(routedId);
	}, [path]);

	const replaceIncident = useCallback(
		(incident: Incident, mode: 'optimistic' | 'authoritative' = 'authoritative') => {
			setIncidents((current) =>
				current.map((candidate) =>
					candidate.id !== incident.id ||
					(mode === 'authoritative' &&
						(candidate.version > incident.version || sameIncidentResource(candidate, incident)))
						? candidate
						: incident
				)
			);
		},
		[]
	);

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
		return subscribeLiveService({
			onConnection: setConnection,
			onIncident: (incident) => replaceIncident(incident, 'authoritative')
		});
	}, [replaceIncident]);

	const selectIncident = (id: string) => {
		setSelectedId(id);
		void navigate({ to: '/incidents/$incidentId', params: { incidentId: id } });
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

function sameIncidentResource(left: Incident, right: Incident): boolean {
	return (
		left.version === right.version &&
		left.ownerId === right.ownerId &&
		left.status === right.status &&
		left.comments.length === right.comments.length &&
		left.comments.every((comment, index) => {
			const candidate = right.comments[index];
			return (
				candidate?.id === comment.id &&
				candidate.authorId === comment.authorId &&
				candidate.body === comment.body &&
				candidate.createdAt === comment.createdAt
			);
		})
	);
}

function incidentIdFromPath(path: string) {
	return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
}
