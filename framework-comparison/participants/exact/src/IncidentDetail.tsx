import { peek, type Component } from '@exactjs/core';
import { SeverityBadge } from './IncidentQueue.jsx';
import { claimIncident, requestAnalysis, serviceUrl, submitComment } from './service-client.js';
import type { AnalysisJob, Incident, User } from './types.js';

type DetailState = {
	draft: string;
	conflict: string;
	job: AnalysisJob | null;
	busy: boolean;
	error: string;
	viewedIncidentId: string;
	viewedVersion: number;
};

type DetailProps = {
	incident?: Incident;
	users: User[];
	sessionUserId: string;
	onIncident(incident: Incident): void;
};

/** Owns one durable detail surface, including optimistic work and its stale-view version fence. */
export function IncidentDetail(this: Component<DetailState>, props: DetailProps) {
	const state = this.state;
	this.state.draft = '';
	this.state.conflict = '';
	this.state.job = null;
	this.state.busy = false;
	this.state.error = '';
	this.state.viewedIncidentId = peek(() => props.incident?.id ?? '');
	this.state.viewedVersion = peek(() => props.incident?.version ?? 0);

	async function claim() {
		if (!props.incident || !props.sessionUserId) return;
		// A selection change starts a new view fence; live updates to the same selection deliberately do not.
		if (state.viewedIncidentId !== props.incident.id) {
			state.viewedIncidentId = props.incident.id;
			state.viewedVersion = props.incident.version;
		}
		const original = copyIncident(props.incident);
		props.onIncident({ ...original, ownerId: props.sessionUserId, status: 'investigating' });
		state.conflict = '';
		state.error = '';
		try {
			const payload = await claimIncident(
				original.id,
				props.sessionUserId,
				state.viewedVersion,
				undefined
			);
			if (payload.status === 409 && payload.error?.current) {
				props.onIncident(payload.error.current);
				state.viewedVersion = payload.error.current.version;
				state.conflict =
					'This incident changed while you were viewing it. The latest owner is shown.';
			} else if (payload.incident) {
				props.onIncident(payload.incident);
				state.viewedVersion = payload.incident.version;
			} else props.onIncident(original);
		} catch (caught) {
			props.onIncident(original);
			state.error = caught instanceof Error ? caught.message : 'Unable to claim incident';
		}
	}

	async function addComment() {
		if (!props.incident) return;
		const body = state.draft.trim();
		if (!body || [...body].length > 2_000) {
			state.error = 'Comment must contain 1 to 2,000 characters.';
			return;
		}
		const original = copyIncident(props.incident);
		const temporary = {
			id: `pending-${crypto.randomUUID()}`,
			authorId: props.sessionUserId,
			body,
			createdAt: new Date().toISOString()
		};
		props.onIncident({ ...original, comments: [...original.comments, temporary] });
		state.draft = '';
		state.error = '';
		try {
			const payload = await submitComment(
				original.id,
				props.sessionUserId,
				body,
				crypto.randomUUID(),
				undefined
			);
			props.onIncident(payload.incident);
			state.viewedVersion = payload.incident.version;
		} catch (caught) {
			props.onIncident(original);
			state.draft = body;
			state.error = caught instanceof Error ? caught.message : 'Unable to add comment';
		}
	}

	async function startAnalysis() {
		if (!props.incident) return;
		state.busy = true;
		state.error = '';
		try {
			const payload = await requestAnalysis(props.incident.id);
			state.job = payload.job;
		} catch (caught) {
			state.error = caught instanceof Error ? caught.message : 'Unable to start analysis';
		} finally {
			state.busy = false;
		}
	}

	this.onMount(({ signal }) => {
		const events = new EventSource(`${serviceUrl}/api/events`);
		events.addEventListener('job', (event) => {
			const job = JSON.parse((event as MessageEvent<string>).data) as AnalysisJob;
			if (job.id === state.job?.id) state.job = job;
		});
		signal.addEventListener('abort', () => events.close(), { once: true });
	});

	const ownerName =
		props.users.find((user) => user.id === props.incident?.ownerId)?.name ?? 'Unassigned';

	return () => (
		<section className="detail-panel" aria-label="Incident detail">
			{props.incident ? (
				<>
					<div className="detail-heading">
						<div>
							<SeverityBadge severity={props.incident.severity} />
							<h2>{props.incident.title}</h2>
						</div>
						<span className="version">Version {props.incident.version}</span>
					</div>
					<div className="facts">
						<div>
							<span>Owner</span>
							<strong>{ownerName}</strong>
						</div>
						<div>
							<span>Status</span>
							<strong>{props.incident.status}</strong>
						</div>
					</div>
					{this.state.conflict ? (
						<p className="alert" role="alert">
							{this.state.conflict}
						</p>
					) : null}
					{this.state.error ? (
						<p className="alert" role="alert">
							{this.state.error}
						</p>
					) : null}
					<button type="button" className="primary" onClick={claim}>
						Claim incident
					</button>
					<section className="analysis-card">
						<div>
							<h3>Server analysis</h3>
							<p role="status">
								{this.state.job ? `Analysis ${this.state.job.status}` : 'Analysis has not started'}
							</p>
							{this.state.job?.result ? <strong>{this.state.job.result.finding}</strong> : null}
						</div>
						<button
							type="button"
							className="quiet"
							disabled={this.state.busy}
							onClick={startAnalysis}
						>
							Start analysis
						</button>
					</section>
					<section className="comments">
						<h3>Response log</h3>
						{props.incident.comments.length === 0 ? (
							<p className="empty">No comments yet.</p>
						) : null}
						{props.incident.comments.map((comment) => (
							<article>
								<strong>{props.users.find((user) => user.id === comment.authorId)?.name}</strong>
								<p>{comment.body}</p>
							</article>
						))}
						<form
							onSubmit={(event) => {
								event.preventDefault();
								return addComment();
							}}
						>
							<label>
								New comment
								<textarea value:onInput={this.state.draft} maxLength={2000} required />
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
