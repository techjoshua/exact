/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes the enhancement namespace. */
import type { Component } from '@exactjs/core';
import { corpus } from '../scenarios/enhancement-routing.fixtures.js' with { type: 'exact-enhancement' };

/** Equivalent render paths exercised by the same interaction contract. */
export type ControlPath = 'planned' | 'spread' | 'enhanced';
/** Serializable inputs for the corpus-owned report workbench. */
export interface WorkbenchProps {
	path: ControlPath;
	version: number;
	visible: boolean;
	active: boolean;
	items: { id: string; label: string }[];
}

const selections: number[] = [];
const removed: string[] = [];

/** Reads public interaction and lifecycle observations without compiler implementation details. */
export function workbenchObservations() {
	return { selections: [...selections], removed: [...removed] };
}
/** Clears observations between independent client or hydration runs. */
export function resetWorkbenchObservations(): void {
	selections.length = 0;
	removed.length = 0;
}

function selectionFor(version: number) {
	return () => selections.push(version);
}

type ControlProps = { label: string; onSelect?: () => void };
function PlannedControl(props: ControlProps) {
	return () => (
		<button data-control onClick={props.onSelect}>
			{props.label}
		</button>
	);
}
function SpreadControl(props: ControlProps) {
	return () => (
		<button {...{ title: 'Report action' }} data-control onClick={props.onSelect}>
			{props.label}
		</button>
	);
}
function EnhancedControl(props: ControlProps) {
	return () => (
		<button data-control corpus:tone="action" onClick={props.onSelect}>
			{props.label}
		</button>
	);
}
function Row(this: Component<{}>, props: { id: string; label: string }) {
	this.onUnmount(() => removed.push(props.id));
	return () => <li data-row={props.id}>{props.label}</li>;
}
function Summary(props: { label: string }) {
	return () => <p data-summary>{props.label}</p>;
}
function Workbench(props: WorkbenchProps) {
	const summary = { label: `Report ${props.version}`, visible: props.visible };
	const rows = props.items.map((item) => ({
		id: item.id,
		label: `${summary.label}: ${item.label}`
	}));
	return () => (
		<main data-workbench>
			<h1>{summary.label}</h1>
			{summary.visible ? <Summary label={summary.label} /> : null}
			{props.path === 'planned' ? (
				<PlannedControl
					label={summary.label}
					onSelect={props.active ? selectionFor(props.version) : undefined}
				/>
			) : props.path === 'spread' ? (
				<SpreadControl
					label={summary.label}
					onSelect={props.active ? selectionFor(props.version) : undefined}
				/>
			) : (
				<EnhancedControl
					label={summary.label}
					onSelect={props.active ? selectionFor(props.version) : undefined}
				/>
			)}
			<p data-count>{rows.length}</p>
			<ul>
				{rows.map((row) => (
					<Row key={row.id} {...row} />
				))}
			</ul>
		</main>
	);
}
/** Creates the same authored application for client mounting, SSR, and matching hydration. */
export function workbenchRoot(props: WorkbenchProps) {
	return <Workbench {...props} />;
}
