import type { Component } from '@exactjs/core';
import type { Incident } from './types.js';

type QueueState = {
	severity: string;
	status: string;
};

type QueueProps = {
	incidents: Incident[];
	selectedId: string;
	onSelectedIdChanged(id: string): void;
	loading: boolean;
	error: string;
	onRefresh(): void;
};

/** Owns local queue filters while publishing navigation selection to the application shell. */
export function IncidentQueue(this: Component<QueueState>, props: QueueProps) {
	this.state.severity = 'all';
	this.state.status = 'all';

	const filteredIncidents = props.incidents.filter(
		(incident) =>
			(this.state.severity === 'all' || incident.severity === this.state.severity) &&
			(this.state.status === 'all' || incident.status === this.state.status)
	);

	return () => (
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
					<select value:onChange={this.state.severity}>
						<option value="all">All</option>
						<option value="critical">Critical</option>
						<option value="high">High</option>
						<option value="medium">Medium</option>
					</select>
				</label>
				<label>
					Status
					<select value:onChange={this.state.status}>
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
						type="button"
						className="incident"
						className:active={incident.id === props.selectedId}
						onClick={() => props.onSelectedIdChanged(incident.id)}
						data-testid="incident-row"
					>
						<SeverityBadge severity={incident.severity} />
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

/** Renders the finite severity vocabulary with compiler-visible conditional classes. */
export function SeverityBadge(props: { severity: Incident['severity'] }) {
	return () => (
		<span
			className="severity"
			className:critical={props.severity === 'critical'}
			className:high={props.severity === 'high'}
			className:medium={props.severity === 'medium'}
			className:low={props.severity === 'low'}
		>
			{props.severity}
		</span>
	);
}
