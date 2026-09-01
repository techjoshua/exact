import type { Component } from '@exactjs/core';

type StateModel = { count: number; enabled: boolean };
let mountedState: Component<StateModel> | undefined;

function IndexedState(
	this: Component<StateModel>,
	props: { prefix: string; capture?: (instance: Component<StateModel>) => void }
) {
	mountedState = this;
	props.capture?.(this);
	this.state.count = 1;
	this.state.enabled = true;
	return () => (
		<section data-scenario="state">
			<output>
				{props.prefix}:{this.state.count}
			</output>
			<data data-role="adjacent-text">Count &amp; {this.state.count}</data>
			<small hidden>{props.prefix.toUpperCase()}</small>
			<textarea data-role="static-native-attributes" maxLength={2000} required />
			<button
				disabled={!this.state.enabled}
				data-count={this.state.count}
				onClick={() => this.state.count++}
			>
				increment
			</button>
		</section>
	);
}

/** Creates a root covering indexed text and property bindings. */
export const stateRoot = (
	prefix = 'count',
	capture?: (instance: Component<StateModel>) => void
) => <IndexedState prefix={prefix} capture={capture} />;

/** Reads the currently mounted durable state owner. */
export function stateOwner(): Component<StateModel> {
	if (!mountedState) throw new Error('Indexed state scenario is not mounted');
	return mountedState;
}

type InputProjectionState = { loading: boolean; label: string };
let mountedInputProjection: Component<InputProjectionState> | undefined;

function IndexedInputProjection(
	this: Component<InputProjectionState>,
	props: { payload?: { label: string } }
) {
	mountedInputProjection = this;
	this.state.loading = !props.payload;
	this.state.label = props.payload?.label ?? 'missing';
	return () => (
		<output data-scenario="input-projection">
			{this.state.loading ? 'loading' : 'ready'}:{this.state.label}
		</output>
	);
}

/** Creates a root whose exact top-level prop relationship is receiver-owned. */
export const inputProjectionRoot = (payload?: { label: string }) => (
	<IndexedInputProjection payload={payload} />
);

/** Reads the durable owner of the indexed input projection. */
export function inputProjectionOwner(): Component<InputProjectionState> {
	if (!mountedInputProjection) throw new Error('Indexed input projection is not mounted');
	return mountedInputProjection;
}

type ServerProjectionState = { direct: string; computed: string };

function normalizeServerLabel(label: string): string {
	return label.trim().toUpperCase();
}

function ServerSetupProjection(this: Component<ServerProjectionState>, props: { label: string }) {
	this.state.direct = props.label;
	this.state.computed = normalizeServerLabel(props.label);
	return () => (
		<output data-scenario="server-setup-projection">
			{this.state.direct}:{this.state.computed}
		</output>
	);
}

/** Compiler-issued root covering direct and authored synchronous server setup. */
export const serverSetupProjectionRoot = (label: string) => <ServerSetupProjection label={label} />;
