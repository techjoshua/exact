import { peek, type Component } from '@exactjs/core';

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
		<section
			data-scenario="state"
			className="state-root"
			className:enabled={this.state.enabled === true}
		>
			<output>
				{props.prefix}:{this.state.count}
			</output>
			<data data-role="adjacent-text">Count &amp; {this.state.count}</data>
			<small hidden>{props.prefix.toUpperCase()}</small>
			<textarea
				data-role="static-native-attributes"
				aria-label={props.prefix}
				maxLength={2000}
				required
			/>
			<progress data-role="direct-state-property" value={this.state.count} max="10" />
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

type InputProjectionState = { loading: boolean; label: string; status: string };
let mountedInputProjection: Component<InputProjectionState> | undefined;

function NestedPropLabel(props: { label: string }) {
	return () => <span data-role="nested-prop-label">{props.label}</span>;
}

function IndexedInputProjection(
	this: Component<InputProjectionState>,
	props: { payload?: { label: string } }
) {
	mountedInputProjection = this;
	this.state.loading = !props.payload;
	this.state.label = props.payload?.label ?? 'missing';
	this.state.status = 'idle';
	return () => (
		<>
			<output data-scenario="input-projection">
				{this.state.loading ? 'loading' : 'ready'}:{this.state.label}:{this.state.status}
			</output>
			{props.payload ? <NestedPropLabel label={props.payload.label} /> : null}
		</>
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

type SnapshotProjectionState = { label: string };

function SnapshotProjection(this: Component<SnapshotProjectionState>, props: { label: string }) {
	this.state.label = peek(() => props.label);
	return () => <output data-scenario="snapshot-projection">{this.state.label}</output>;
}

function SnapshotProjectionParent(props: { label: string }) {
	return () => <SnapshotProjection label={props.label} />;
}

/** Creates a nested prop snapshot whose matching state need not cross the hydration boundary. */
export const snapshotProjectionRoot = (label: string) => <SnapshotProjectionParent label={label} />;

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

function MixedReaderDispatch(props: { pending: boolean; items: readonly string[] }) {
	const visible = props.items.filter((item) => item !== '');
	return () => (
		<div data-scenario="mixed-reader-dispatch">
			{props.pending ? <span>pending</span> : null}
			{visible.map((item) => (
				<strong key={item}>{item}</strong>
			))}
		</div>
	);
}

/** Creates a root mixing expression and statement-bodied compiler readers. */
export const mixedReaderDispatchRoot = () => (
	<MixedReaderDispatch pending={false} items={['first', '', 'second']} />
);
