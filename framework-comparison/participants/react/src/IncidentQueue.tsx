import { useMemo, useState } from 'react';
import type { Incident } from './types.js';

type QueueProps = {
	incidents: Incident[];
	selectedId: string;
	onSelectedIdChanged(id: string): void;
	loading: boolean;
	error: string;
	onRefresh(): void;
};

/** Owns React-local queue filters and publishes route selection to the application shell. */
export function IncidentQueue(props: QueueProps) {
	const [severity, setSeverity] = useState('all');
	const [status, setStatus] = useState('all');
	const filteredIncidents = useMemo(
		() =>
			props.incidents.filter(
				(incident) =>
					(severity === 'all' || incident.severity === severity) &&
					(status === 'all' || incident.status === status)
			),
		[props.incidents, severity, status]
	);

	return (
		<section className="queue-panel" aria-labelledby="queue-title">
			<div className="section-heading">
				<div>
					<span className="eyebrow">Active response</span>
					<h2 id="queue-title">Incident queue</h2>
				</div>
				<button type="button" className="quiet" onClick={props.onRefresh}>
					Refresh
				</button>
			</div>
			<div className="filters">
				<label>
					Severity
					<select value={severity} onChange={(event) => setSeverity(event.currentTarget.value)}>
						<option value="all">All</option>
						<option value="critical">Critical</option>
						<option value="high">High</option>
						<option value="medium">Medium</option>
					</select>
				</label>
				<label>
					Status
					<select value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
						<option value="all">All</option>
						<option value="open">Open</option>
						<option value="investigating">Investigating</option>
						<option value="closed">Closed</option>
					</select>
				</label>
			</div>
			{props.loading ? <p className="empty">Loading incidents…</p> : null}
			{!props.loading && props.incidents.length === 0 && !props.error ? (
				<p className="empty">No incidents match this workspace.</p>
			) : null}
			{props.error ? <p role="alert">{props.error}</p> : null}
			<div className="incident-list">
				{filteredIncidents.map((incident) => (
					<button
						key={incident.id}
						type="button"
						className={incident.id === props.selectedId ? 'incident active' : 'incident'}
						onClick={() => props.onSelectedIdChanged(incident.id)}
						data-testid="incident-row"
					>
						<span className={`severity ${incident.severity}`}>{incident.severity}</span>
						<strong>{incident.title}</strong>
						<small>
							{incident.ownerId ? 'Assigned' : 'Unassigned'} · {incident.status}
						</small>
					</button>
				))}
			</div>
		</section>
	);
}
