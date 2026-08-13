import type { WorkspaceState } from './contracts.js';

type WorkspaceOperations = {
	selectIncident(id: string): void;
	refresh(): void;
	claimSelected(): void;
	addComment(): void;
	startAnalysis(): void;
};

/** Describes the native workspace while state and task ownership remain in the durable component. */
export function renderWorkspace(state: WorkspaceState, operations: WorkspaceOperations) {
	const filtered = state.incidents.filter(
		(incident) =>
			(state.severity === 'all' || incident.severity === state.severity) &&
			(state.status === 'all' || incident.status === state.status)
	);
	const selected = state.incidents.find((incident) => incident.id === state.selectedId);
	const owner = state.users.find((user) => user.id === selected?.ownerId)?.name ?? 'Unassigned';
	return (
		<div className="app-shell">
			<header className="masthead">
				<div>
					<span className="eyebrow">Native full stack</span>
					<h1>Signal Desk</h1>
				</div>
				<span className="connection">Compiler server tasks</span>
			</header>
			<main>
				<section className="queue-panel" aria-labelledby="queue-title">
					<div className="section-heading">
						<h2 id="queue-title">Incident queue</h2>
						<button className="quiet" onClick={operations.refresh}>
							Refresh
						</button>
					</div>
					<div className="filters">
						<label>
							Severity
							<select value:onChange={state.severity}>
								<option value="all">All</option>
								<option value="critical">Critical</option>
								<option value="high">High</option>
								<option value="medium">Medium</option>
							</select>
						</label>
						<label>
							Status
							<select value:onChange={state.status}>
								<option value="all">All</option>
								<option value="open">Open</option>
								<option value="investigating">Investigating</option>
							</select>
						</label>
					</div>
					{state.error ? <p role="alert">{state.error}</p> : null}
					<div className="incident-list">
						{filtered.map((incident) => (
							<button
								key={incident.id}
								className="incident"
								className:active={incident.id === state.selectedId}
								data-testid="incident-row"
								onClick={() => operations.selectIncident(incident.id)}
							>
								<span
									className="severity"
									className:critical={incident.severity === 'critical'}
									className:high={incident.severity === 'high'}
									className:medium={incident.severity === 'medium'}
								>
									{incident.severity}
								</span>
								<strong>{incident.title}</strong>
								<small>
									{incident.ownerId ? 'Assigned' : 'Unassigned'} · {incident.status}
								</small>
							</button>
						))}
					</div>
				</section>
				<section className="detail-panel" aria-label="Incident detail">
					{selected ? (
						<>
							<div className="detail-heading">
								<h2>{selected.title}</h2>
								<span>Version {selected.version}</span>
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
							{state.conflict ? (
								<p className="alert" role="alert">
									{state.conflict}
								</p>
							) : null}
							<button className="primary" onClick={operations.claimSelected}>
								Claim incident
							</button>
							<section className="analysis-card">
								<div>
									<h3>Server analysis</h3>
									<p role="status">
										{state.job ? `Analysis ${state.job.status}` : 'Analysis has not started'}
									</p>
									{state.job?.result ? <strong>{state.job.result.finding}</strong> : null}
								</div>
								<button className="quiet" disabled={state.busy} onClick={operations.startAnalysis}>
									Start analysis
								</button>
							</section>
							<section className="comments">
								<h3>Response log</h3>
								{selected.comments.length === 0 ? <p className="empty">No comments yet.</p> : null}
								{selected.comments.map((entry) => (
									<article key={entry.id}>
										<strong>{state.users.find((user) => user.id === entry.authorId)?.name}</strong>
										<p>{entry.body}</p>
									</article>
								))}
								<form
									onSubmit={(event) => {
										event.preventDefault();
										operations.addComment();
									}}
								>
									<label>
										New comment
										<textarea value:onInput={state.draft} maxLength={2000} required />
									</label>
									<button className="primary" type="submit">
										Add comment
									</button>
								</form>
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
