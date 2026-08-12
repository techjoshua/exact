import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
	Form,
	Link,
	useActionData,
	useFetcher,
	useLoaderData,
	useNavigate,
	useRevalidator,
	type ActionFunctionArgs,
	type LoaderFunctionArgs
} from 'react-router';
import type {
	AnalysisJob,
	Incident,
	WorkspaceActionData,
	WorkspaceLoaderData
} from '../contracts.js';
import { incidentService } from '../service.server.js';

/** Loads the authoritative route snapshot directly in the framework server runtime. */
export function loader({ params }: LoaderFunctionArgs): WorkspaceLoaderData {
	const snapshot = incidentService.snapshot();
	return {
		...snapshot,
		selectedId: params.incidentId ?? snapshot.incidents[0]?.id ?? ''
	};
}

/** Dispatches intent-based mutations through React Router's native action boundary. */
export async function action({ request }: ActionFunctionArgs): Promise<WorkspaceActionData> {
	const form = await request.formData();
	const intent = String(form.get('intent')) as WorkspaceActionData['intent'];
	const id = String(form.get('incidentId'));
	try {
		switch (intent) {
			case 'claim': {
				const result = incidentService.claim(
					id,
					String(form.get('actorId')),
					Number(form.get('expectedVersion'))
				);
				return { intent, ...result };
			}
			case 'comment':
				return {
					intent,
					incident: incidentService.comment(
						id,
						String(form.get('actorId')),
						String(form.get('body')),
						String(form.get('mutationId'))
					)
				};
			case 'analyze':
				return { intent, job: incidentService.analyze(id) };
			default:
				return { intent, error: 'Unknown workspace action' };
		}
	} catch (caught) {
		return { intent, error: caught instanceof Error ? caught.message : 'Server action failed' };
	}
}

/** Renders the idiomatic React Router full-stack participant. */
export default function NativeReactWorkspace() {
	const loaderData = useLoaderData<WorkspaceLoaderData>();
	const actionData = useActionData<WorkspaceActionData>();
	const navigate = useNavigate();
	const revalidator = useRevalidator();
	const analyzeFetcher = useFetcher<WorkspaceActionData>();
	const commentForm = useRef<HTMLFormElement>(null);
	const mutationId = useId();
	const [severity, setSeverity] = useState('all');
	const [status, setStatus] = useState('all');
	const [draft, setDraft] = useState('');
	const [optimisticClaim, setOptimisticClaim] = useState<Incident | null>(null);
	const [job, setJob] = useState<AnalysisJob | null>(null);
	const viewedVersion = useRef(
		loaderData.incidents.find((incident) => incident.id === loaderData.selectedId)?.version ?? 0
	);
	const selectedFromLoader = loaderData.incidents.find(
		(incident) => incident.id === loaderData.selectedId
	);
	const selected =
		optimisticClaim?.id === loaderData.selectedId ? optimisticClaim : selectedFromLoader;

	useEffect(() => {
		viewedVersion.current =
			loaderData.incidents.find((incident) => incident.id === loaderData.selectedId)?.version ?? 0;
		setOptimisticClaim(null);
		// The selected route owns the concurrency snapshot; background revalidation must not replace it.
	}, [loaderData.selectedId]);

	useEffect(() => {
		if (actionData?.conflict || actionData?.incident) setOptimisticClaim(null);
	}, [actionData]);

	useEffect(() => {
		if (analyzeFetcher.data?.job) setJob(analyzeFetcher.data.job);
	}, [analyzeFetcher.data]);

	useEffect(() => {
		const events = new EventSource('/events');
		events.addEventListener('incident', () => void revalidator.revalidate());
		events.addEventListener('job', (event) => {
			const nextJob = JSON.parse((event as MessageEvent<string>).data) as AnalysisJob;
			setJob((current) => (current?.id === nextJob.id ? nextJob : current));
		});
		return () => events.close();
	}, [revalidator]);

	const filtered = useMemo(
		() =>
			loaderData.incidents.filter(
				(incident) =>
					(severity === 'all' || incident.severity === severity) &&
					(status === 'all' || incident.status === status)
			),
		[loaderData.incidents, severity, status]
	);
	const owner =
		loaderData.users.find((user) => user.id === selected?.ownerId)?.name ?? 'Unassigned';
	const conflictMessage = actionData?.conflict
		? 'This incident changed while you were viewing it. The latest owner is shown.'
		: '';
	const error = actionData?.error ?? analyzeFetcher.data?.error ?? '';

	return (
		<div className="app-shell">
			<header className="masthead">
				<div>
					<span className="eyebrow">Native full stack</span>
					<h1>Signal Desk</h1>
				</div>
				<span className="connection">React Router actions</span>
			</header>
			<main>
				<section className="queue-panel" aria-labelledby="queue-title">
					<div className="section-heading">
						<h2 id="queue-title">Incident queue</h2>
						<button className="quiet" onClick={() => void revalidator.revalidate()}>
							Refresh
						</button>
					</div>
					<div className="filters">
						<label>
							Severity
							<select value={severity} onChange={(event) => setSeverity(event.target.value)}>
								<option value="all">All</option>
								<option value="critical">Critical</option>
								<option value="high">High</option>
								<option value="medium">Medium</option>
							</select>
						</label>
						<label>
							Status
							<select value={status} onChange={(event) => setStatus(event.target.value)}>
								<option value="all">All</option>
								<option value="open">Open</option>
								<option value="investigating">Investigating</option>
							</select>
						</label>
					</div>
					{error ? <p role="alert">{error}</p> : null}
					<div className="incident-list">
						{filtered.map((incident) => (
							<Link
								key={incident.id}
								to={`/incidents/${incident.id}`}
								className={`incident ${incident.id === loaderData.selectedId ? 'active' : ''}`}
								data-testid="incident-row"
								onClick={(event) => {
									event.preventDefault();
									void navigate(`/incidents/${incident.id}`);
								}}
							>
								<span className={`severity ${incident.severity}`}>{incident.severity}</span>
								<strong>{incident.title}</strong>
								<small>
									{incident.ownerId ? 'Assigned' : 'Unassigned'} · {incident.status}
								</small>
							</Link>
						))}
					</div>
				</section>
				<section className="detail-panel" aria-label="Incident detail">
					{selected ? (
						<>
							<div className="detail-heading">
								<h2>{selected.title}</h2>
								<span className="version">Version {selected.version}</span>
							</div>
							<div className="facts">
								<div>
									<span>Owner</span>
									<strong>{owner}</strong>
								</div>
								<div>
									<span>Status</span>
									<strong>{selected.status}</strong>
								</div>
							</div>
							{conflictMessage ? (
								<p className="alert" role="alert">
									{conflictMessage}
								</p>
							) : null}
							<Form
								method="post"
								onSubmit={() =>
									setOptimisticClaim({
										...selected,
										ownerId: loaderData.sessionUserId,
										status: 'investigating'
									})
								}
							>
								<input type="hidden" name="intent" value="claim" />
								<input type="hidden" name="incidentId" value={selected.id} />
								<input type="hidden" name="actorId" value={loaderData.sessionUserId} />
								<input type="hidden" name="expectedVersion" value={viewedVersion.current} />
								<button className="primary" type="submit">
									Claim incident
								</button>
							</Form>
							<section className="analysis-card">
								<div>
									<h3>Server analysis</h3>
									<p role="status">{job ? `Analysis ${job.status}` : 'Analysis has not started'}</p>
									{job?.result ? <strong>{job.result.finding}</strong> : null}
								</div>
								<analyzeFetcher.Form method="post">
									<input type="hidden" name="intent" value="analyze" />
									<input type="hidden" name="incidentId" value={selected.id} />
									<button
										className="quiet"
										type="submit"
										disabled={analyzeFetcher.state !== 'idle'}
									>
										Start analysis
									</button>
								</analyzeFetcher.Form>
							</section>
							<section className="comments">
								<h3>Response log</h3>
								{selected.comments.length === 0 ? <p className="empty">No comments yet.</p> : null}
								{selected.comments.map((entry) => (
									<article key={entry.id}>
										<strong>
											{loaderData.users.find((user) => user.id === entry.authorId)?.name}
										</strong>
										<p>{entry.body}</p>
									</article>
								))}
								<Form ref={commentForm} method="post" onSubmit={() => setDraft('')}>
									<input type="hidden" name="intent" value="comment" />
									<input type="hidden" name="incidentId" value={selected.id} />
									<input type="hidden" name="actorId" value={loaderData.sessionUserId} />
									<input type="hidden" name="mutationId" value={mutationId} />
									<label>
										New comment
										<textarea
											name="body"
											value={draft}
											onChange={(event) => setDraft(event.target.value)}
											maxLength={2000}
											required
										/>
									</label>
									<button className="primary" type="submit">
										Add comment
									</button>
								</Form>
							</section>
						</>
					) : (
						<p className="empty">Select an incident to inspect its response history.</p>
					)}
				</section>
			</main>
		</div>
	);
}
