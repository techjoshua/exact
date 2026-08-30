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
			<button disabled={!this.state.enabled} data-count={this.state.count}>
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
