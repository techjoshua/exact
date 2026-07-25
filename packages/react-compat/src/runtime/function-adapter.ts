import type { Component, ComponentFunction, ComponentInstance } from '@exactjs/core';
import type { ReactComponentType, ReactNode, ReactSpecialType } from '../types.js';
import { HookHost, createOwnerFrame, removeOwnerFrame } from '../internals.js';
import { reactTypeName, shallowEqualProps, snapshotProps } from './class-support.js';
import { invokeReactType, toExactNode } from './nodes.js';
import { readReactRef } from './refs.js';
import { REACT_MEMO_TYPE, REACT_REF_PROP } from './shared.js';

const unsetRef = Symbol('exact.react.unset-ref');

/** Creates the durable eXact adapter that hosts one React function component type. */
export function createFunctionAdapter(
	type: ReactComponentType<any>
): ComponentFunction<Record<string, unknown>, Record<string, unknown>> {
	const displayName = reactTypeName(type);
	const adapter = function ReactCompatibilityAdapter(
		this: Component<Record<string, unknown>>,
		props: Record<string, unknown>
	) {
		this.state.__reactRevision = 0;
		const exactInstance = this as ComponentInstance<Record<string, unknown>>;
		createOwnerFrame(exactInstance, type);
		const host = new HookHost(this);
		let mounted = false;
		let previousMemoProps: Record<string, unknown> | undefined;
		let previousMemoOutput: ReactNode;
		let previousRevision = -1;
		let previousRef: unknown = unsetRef;
		this.onMount(() => {
			mounted = true;
		});
		this.onActivate(() => host.mount());
		this.onDeactivate(() => host.deactivate());
		this.onRender(() => {
			if (mounted) host.scheduleCommit();
			host.finishTransitionRender();
		});
		this.onUnmount(() => {
			try {
				host.dispose();
			} finally {
				removeOwnerFrame(exactInstance);
			}
		});
		return () => {
			const revision = Number(this.state.__reactRevision);
			const snapshot = snapshotProps(props);
			const ref = readReactRef(snapshot[REACT_REF_PROP]);
			delete snapshot[REACT_REF_PROP];
			const refChanged = previousRef !== unsetRef && !Object.is(previousRef, ref);
			const special =
				typeof type === 'object' && type !== null ? (type as ReactSpecialType) : undefined;
			if (
				!refChanged &&
				special?.$$typeof === REACT_MEMO_TYPE &&
				previousMemoProps &&
				previousRevision === revision &&
				!host.contextChanged()
			) {
				const compare = special.compare ?? shallowEqualProps;
				if (compare(previousMemoProps, snapshot)) return toExactNode(previousMemoOutput);
			}
			const output = host.render(() => invokeReactType(type, snapshot, ref));
			previousMemoProps = snapshot;
			previousMemoOutput = output;
			previousRevision = revision;
			previousRef = ref;
			return host.withRenderTransition(() => toExactNode(output));
		};
	} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;
	Object.defineProperty(adapter, 'name', {
		configurable: true,
		value: `ExactReact(${displayName})`
	});
	return adapter;
}
