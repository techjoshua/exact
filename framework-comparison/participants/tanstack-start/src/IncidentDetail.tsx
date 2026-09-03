import { useEffect, useState, type FormEvent } from 'react';
import { subscribeLiveService } from './live-service.js';
import { claimIncident, requestAnalysis, submitComment } from './service-client.js';
import type { AnalysisJob, Incident, User } from './types.js';

type DetailProps = {
	incident?: Incident;
	users: User[];
	sessionUserId: string;
	onIncident(incident: Incident, mode?: 'optimistic' | 'authoritative'): void;
};

/** Owns detail-local input, job, and optimistic mutation state. */
export function IncidentDetail({ incident, users, sessionUserId, onIncident }: DetailProps) {
	const [draft, setDraft] = useState('');
	const [conflict, setConflict] = useState('');
	const [job, setJob] = useState<AnalysisJob | null>(null);
	const [busy, setBusy] = useState(false);
	const [serviceError, setServiceError] = useState('');
	const [viewVersion, setViewVersion] = useState(incident?.version ?? 0);

	useEffect(
		() =>
			subscribeLiveService({
				onJob: (nextJob) => setJob((current) => (current?.id === nextJob.id ? nextJob : current))
			}),
		[]
	);

	const claim = async () => {
		if (!incident || !sessionUserId) return;
		const original = copyIncident(incident);
		onIncident({ ...original, ownerId: sessionUserId, status: 'investigating' }, 'optimistic');
		setConflict('');
		setServiceError('');
		try {
			const { response, payload } = await claimIncident(original.id, sessionUserId, viewVersion);
			if (response.status === 409 && payload.error?.current) {
				onIncident(payload.error.current, 'authoritative');
				setViewVersion(payload.error.current.version);
				setConflict('This incident changed while you were viewing it. The latest owner is shown.');
			} else if (!response.ok)
				throw new Error(payload.error?.message ?? 'Unable to claim incident');
			else if (payload.incident) {
				onIncident(payload.incident, 'authoritative');
				setViewVersion(payload.incident.version);
			} else onIncident(original, 'optimistic');
		} catch (caught) {
			onIncident(original, 'optimistic');
			setServiceError(caught instanceof Error ? caught.message : 'Unable to claim incident');
		}
	};

	const addComment = async (event: FormEvent) => {
		event.preventDefault();
		if (!incident) return;
		const body = draft.trim();
		if (!body || [...body].length > 2_000) {
			setServiceError('Comment must contain 1 to 2,000 characters.');
			return;
		}
		const original = copyIncident(incident);
		const temporary = {
			id: `pending-${crypto.randomUUID()}`,
			authorId: sessionUserId,
			body,
			createdAt: new Date().toISOString()
		};
		onIncident({ ...original, comments: [...original.comments, temporary] }, 'optimistic');
		setDraft('');
		setServiceError('');
		try {
			const { response, payload } = await submitComment(
				original.id,
				sessionUserId,
				body,
				crypto.randomUUID()
			);
			if (!response.ok || !payload.incident)
				throw new Error(payload.error?.message ?? 'Unable to add comment');
			onIncident(payload.incident, 'authoritative');
			setViewVersion(payload.incident.version);
		} catch (caught) {
			onIncident(original, 'optimistic');
			setDraft(body);
			setServiceError(caught instanceof Error ? caught.message : 'Unable to add comment');
		}
	};

	const startAnalysis = async () => {
		if (!incident) return;
		setBusy(true);
		setServiceError('');
		try {
			const { response, payload } = await requestAnalysis(incident.id);
			if (!response.ok || !payload.job)
				throw new Error(payload.error?.message ?? 'Unable to start analysis');
			setJob(payload.job);
		} catch (caught) {
			setServiceError(caught instanceof Error ? caught.message : 'Unable to start analysis');
		} finally {
			setBusy(false);
		}
	};

	const ownerName = users.find((user) => user.id === incident?.ownerId)?.name ?? 'Unassigned';
	return (
		<section className="detail-panel" aria-label="Incident detail">
			{incident ? (
				<>
					<div className="detail-heading">
						<div>
							<span className={`severity ${incident.severity}`}>{incident.severity}</span>
							<h2>{incident.title}</h2>
						</div>
						<span className="version">Version {incident.version}</span>
					</div>
					<div className="facts">
						<div>
							<span>Owner</span>
							<strong>{ownerName}</strong>
						</div>
						<div>
							<span>Status</span>
							<strong>{incident.status}</strong>
						</div>
					</div>
					{conflict ? (
						<p className="alert" role="alert">
							{conflict}
						</p>
					) : null}
					{serviceError ? (
						<p className="alert" role="alert">
							{serviceError}
						</p>
					) : null}
					<button type="button" className="primary" onClick={() => void claim()}>
						Claim incident
					</button>
					<section className="analysis-card">
						<div>
							<h3>Server analysis</h3>
							<p role="status">{job ? `Analysis ${job.status}` : 'Analysis has not started'}</p>
							{job?.result ? <strong>{job.result.finding}</strong> : null}
						</div>
						<button
							type="button"
							className="quiet"
							disabled={busy}
							onClick={() => void startAnalysis()}
						>
							Start analysis
						</button>
					</section>
					<section className="comments">
						<h3>Response log</h3>
						{incident.comments.length === 0 ? <p className="empty">No comments yet.</p> : null}
						{incident.comments.map((comment) => (
							<article key={comment.id}>
								<strong>{users.find((user) => user.id === comment.authorId)?.name}</strong>
								<p>{comment.body}</p>
							</article>
						))}
						<form onSubmit={(event) => void addComment(event)}>
							<label>
								New comment
								<textarea
									value={draft}
									maxLength={2000}
									required
									onChange={(event) => setDraft(event.currentTarget.value)}
								/>
							</label>
							<button type="submit" className="primary">
								Add comment
							</button>
						</form>
					</section>
				</>
			) : (
				<p className="empty">Select an incident to inspect its response history.</p>
			)}
		</section>
	);
}

function copyIncident(incident: Incident): Incident {
	return { ...incident, comments: incident.comments.map((comment) => ({ ...comment })) };
}
