import type { Component, ComponentFunction, ComponentInstance } from '@exactjs/core';
import type { AnyReactComponentType, ReactNode, ReactSpecialType } from '../types.js';
import { HookHost, createOwnerFrame, removeOwnerFrame } from '../internals.js';
import { markReactErrorOwner, shallowEqualProps, snapshotProps } from './class-support.js';
import { invokeReactType, toReactNode } from './nodes.js';
import { readReactRef } from './refs.js';
import { recordReactRendererTransition, REACT_MEMO_TYPE, REACT_REF_PROP } from './shared.js';

const unsetRef = Symbol('exact.react.unset-ref');

/** Precompiled island implementation that owns one opaque React function-component value. */
export const ReactFunctionIslandImplementation = function ReactFunctionIsland(
	this: Component<Record<string, unknown>>,
	props: Record<string, unknown> & { component: AnyReactComponentType }
) {
	const type = props.component;
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
		delete snapshot.component;
		// React elements use the private channel so eXact never mistakes a
		// React ref for a native RefBinding. Compiler-generated direct JSX
		// reaches this adapter with the authored `ref` prop, so normalize
		// both representations at the one compatibility boundary.
		const ref = readReactRef(snapshot[REACT_REF_PROP] ?? snapshot.ref);
		delete snapshot[REACT_REF_PROP];
		delete snapshot.ref;
		if ('children' in snapshot) snapshot.children = toReactNode(snapshot.children);
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
			if (compare(previousMemoProps, snapshot)) return previousMemoOutput;
		}
		let output: ReactNode;
		try {
			output = host.render(() => invokeReactType(type, snapshot, ref));
		} catch (error) {
			markReactErrorOwner(error, type);
			throw error;
		}
		previousMemoProps = snapshot;
		previousMemoOutput = output;
		previousRevision = revision;
		previousRef = ref;
		recordReactRendererTransition(exactInstance, host.renderTransitionOwnership(), () =>
			host.finishTransitionRender()
		);
		return host.withRenderTransition(() => output);
	};
} as ComponentFunction<
	Record<string, unknown>,
	Record<string, unknown> & { component: AnyReactComponentType }
>;
