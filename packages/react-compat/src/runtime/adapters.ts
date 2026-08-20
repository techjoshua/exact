import {
	type AnyComponentFunction,
	ErrorContext,
	createErrorContext,
	createVNode,
	type Component,
	type ComponentFunction,
	type ComponentInstance
} from '@exactjs/core';
import { isExactComponent, markExactComponent } from '@exactjs/core/framework/component-contracts';
import type {
	ReactClassInstance,
	ReactClassType,
	ReactComponentType,
	ReactNode,
	ReactRef
} from '../types.js';

import {
	classProps,
	componentStack,
	isErrorBoundary,
	isReactClassType,
	reactTypeName,
	readClassContext,
	readLegacyContext,
	routeClassLifecycleError,
	shallowEqualProps,
	shallowEqualState,
	type ClassLifecycles,
	type ClassStatics
} from './class-support.js';
import { readReactRootRuntime, toExactNode, toReactNode } from './nodes.js';
import { assignReactRef, readReactRef } from './refs.js';
import { createFunctionAdapter } from './function-adapter.js';
import {
	markReactClassInstanceMounted,
	markReactClassInstanceUnmounted
} from './class-instances.js';
import {
	LegacyReactContext,
	EXACT_COMPONENT_TYPE,
	REACT_CLASS_UPDATER,
	REACT_REF_PROP,
	currentReactTransitionOwnership,
	withReactTransitionOwnership,
	type ReactTransitionOwnership
} from './shared.js';
export {
	childrenArray,
	contextForSpecial,
	isReactClassType,
	reactTypeName,
	routeClassLifecycleError,
	unsupportedType
} from './class-support.js';
export { toExactNode } from './nodes.js';
export { assignReactRef } from './refs.js';
export {
	exactComponentForReactInstance,
	isUnmountedReactClassInstance
} from './class-instances.js';
export * from './shared.js';

import { createOwnerFrame, enterReactOwnerScope, removeOwnerFrame } from '../internals.js';

const adapterCache = new WeakMap<object, AnyComponentFunction>();
let nextCompatibilityAdapterId = 0;

function markCompatibilityAdapter<T extends AnyComponentFunction>(adapter: T): T {
	return markExactComponent(
		adapter,
		`@exactjs/react-compat:adapter:${++nextCompatibilityAdapterId}`
	);
}

/**
 * Returns the stable eXact component adapter for a React type.
 *
 * The internal cache changes only allocation behavior; equal input identity
 * always produces equal output identity.
 *
 * @exact pure
 */
export function adaptReactType<P>(
	type: ReactComponentType<P> | ComponentFunction<any, P>
): ComponentFunction<Record<string, unknown>, P> {
	const identity = type as object;
	const cached = adapterCache.get(identity);
	if (cached) return cached as ComponentFunction<Record<string, unknown>, P>;
	if (typeof type === 'function' && isExactComponent(type)) {
		const component = type as ComponentFunction<Record<string, unknown>, P>;
		adapterCache.set(identity, component);
		return component;
	}
	const exactBoundary = type as ReactComponentType<P> & {
		$$typeof?: unknown;
		exactComponent?: unknown;
		exactRefProp?: unknown;
	};
	if (
		exactBoundary.$$typeof === EXACT_COMPONENT_TYPE &&
		typeof exactBoundary.exactComponent === 'function'
	) {
		const component = exactBoundary.exactComponent as ComponentFunction<Record<string, unknown>, P>;
		const refProp =
			typeof exactBoundary.exactRefProp === 'string' ||
			typeof exactBoundary.exactRefProp === 'symbol'
				? exactBoundary.exactRefProp
				: undefined;
		if (refProp === undefined) {
			adapterCache.set(identity, component);
			return component;
		}
		const boundaryAdapter = function ExactCompatibilityNativeRefAdapter(
			this: Component<Record<string, never>>,
			props: Record<string, unknown>
		) {
			return () => {
				const snapshot = { ...props };
				const ref = readReactRef(snapshot[REACT_REF_PROP] ?? snapshot.ref);
				delete snapshot[REACT_REF_PROP];
				delete snapshot.ref;
				Reflect.set(snapshot, refProp, ref);
				return createVNode(component, snapshot);
			};
		} as ComponentFunction<Record<string, never>, Record<string, unknown>>;
		const markedBoundaryAdapter = markCompatibilityAdapter(boundaryAdapter);
		adapterCache.set(identity, markedBoundaryAdapter);
		return markedBoundaryAdapter as ComponentFunction<Record<string, unknown>, P>;
	}
	if (isReactClassType(type)) {
		const classAdapter = markCompatibilityAdapter(
			createClassAdapter(type as ReactClassType<Record<string, unknown>>)
		);
		adapterCache.set(identity, classAdapter);
		return classAdapter as ComponentFunction<Record<string, unknown>, P>;
	}
	const adapter = markCompatibilityAdapter(createFunctionAdapter(type as ReactComponentType<any>));
	adapterCache.set(identity, adapter);
	return adapter as ComponentFunction<Record<string, unknown>, P>;
}

function createClassAdapter(
	type: ReactClassType<Record<string, unknown>>
): ComponentFunction<Record<string, unknown>, Record<string, unknown>> {
	const displayName = reactTypeName(type);
	const adapter = function ReactClassCompatibilityAdapter(
		this: Component<Record<string, unknown>>,
		reactiveProps: Record<string, unknown>
	) {
		this.state.__reactRevision = 0;
		const statics = type as ReactClassType<Record<string, unknown>> & ClassStatics;
		const initialSnapshot = classProps(reactiveProps);
		if ('children' in initialSnapshot.props)
			initialSnapshot.props.children = toReactNode(initialSnapshot.props.children);
		let currentRef = initialSnapshot.ref;
		const initialContext = readClassContext(this, statics.contextType, statics.contextTypes);
		const publicInstance = new type(initialSnapshot.props, initialContext) as ReactClassInstance<
			Record<string, unknown>
		> &
			ClassLifecycles;
		const exactInstance = this as ComponentInstance<Record<string, unknown>>;
		const ownerFrame = createOwnerFrame(exactInstance, type, publicInstance);
		Object.defineProperty(publicInstance, '_reactInternals', {
			configurable: true,
			writable: true,
			value: ownerFrame
		});
		markReactClassInstanceMounted(publicInstance as object, exactInstance);
		if (publicInstance.state === undefined) publicInstance.state = null;
		publicInstance.props = initialSnapshot.props;
		publicInstance.context = initialContext;
		publicInstance.refs ??= {};

		let constructing = true;
		let mounted = false;
		let force = false;
		let capturedWithoutDerivedState = false;
		let output: ReactNode = null;
		let committedProps = initialSnapshot.props;
		let committedState = publicInstance.state;
		let pendingDidUpdate:
			| { props: Record<string, unknown>; state: unknown; snapshot: unknown }
			| undefined;
		let commitScheduled = false;
		let renderTransition: ReactTransitionOwnership | undefined;
		let releaseRenderTransition: (() => void) | undefined;
		const callbacks: Array<() => void> = [];
		const captureTransition = () => {
			const transition = currentReactTransitionOwnership();
			if (!transition || transition === renderTransition) return;
			releaseRenderTransition?.();
			renderTransition = transition;
			releaseRenderTransition = transition.retain();
		};
		const finishTransitionRender = () => {
			releaseRenderTransition?.();
			releaseRenderTransition = undefined;
			renderTransition = undefined;
		};

		const invalidate = () => {
			if (!constructing) this.state.__reactRevision = Number(this.state.__reactRevision ?? 0) + 1;
		};
		const mergeState = (partial: unknown, notify: boolean) => {
			if (partial === null || partial === undefined) return false;
			if (typeof partial !== 'object')
				throw new TypeError('React class setState updater must return an object or null');
			const previous = publicInstance.state;
			publicInstance.state =
				previous && typeof previous === 'object'
					? { ...previous, ...(partial as object) }
					: { ...(partial as object) };
			capturedWithoutDerivedState = false;
			if (notify) invalidate();
			return true;
		};
		const updater = {
			setState: (
				update: object | null | ((previous: unknown, props: unknown) => object | null),
				callback?: () => void
			) => {
				const partial =
					typeof update === 'function'
						? update(publicInstance.state, publicInstance.props)
						: update;
				const changed = mergeState(partial, true);
				if (changed) captureTransition();
				if (callback) callbacks.push(callback);
				if (!changed && callback) invalidate();
			},
			forceUpdate: (callback?: () => void) => {
				force = true;
				captureTransition();
				capturedWithoutDerivedState = false;
				if (callback) callbacks.push(callback);
				invalidate();
			}
		};
		Object.defineProperty(publicInstance, REACT_CLASS_UPDATER, {
			configurable: true,
			value: updater
		});

		if (isErrorBoundary(publicInstance, statics)) {
			const base = createErrorContext();
			this.setContext(ErrorContext, {
				...base,
				boundary: this as never,
				report: (error: unknown, options?: Parameters<typeof base.report>[1]) => {
					const report = base.report(error, options);
					const derived = statics.getDerivedStateFromError?.(report.error);
					const hasDerivedState = mergeState(derived, true);
					capturedWithoutDerivedState = !hasDerivedState;
					const stack = componentStack(report);
					publicInstance.componentDidCatch?.(report.error, { componentStack: stack });
					readReactRootRuntime(this)?.onCaughtError?.(report.error, {
						componentStack: stack,
						errorBoundary: publicInstance
					});
					return report;
				}
			});
		}

		const flushCommit = () => {
			commitScheduled = false;
			if (!mounted) return;
			const update = pendingDidUpdate;
			pendingDidUpdate = undefined;
			if (update) {
				try {
					publicInstance.componentDidUpdate?.(update.props, update.state, update.snapshot);
				} catch (error) {
					routeClassLifecycleError(this, error, 'componentDidUpdate');
				}
			}
			const pendingCallbacks = callbacks.splice(0, callbacks.length);
			for (const callback of pendingCallbacks) {
				try {
					callback.call(publicInstance);
				} catch (error) {
					routeClassLifecycleError(this, error, 'setState-callback');
				}
			}
		};
		const scheduleCommit = () => {
			if (commitScheduled) return;
			commitScheduled = true;
			queueMicrotask(flushCommit);
		};

		this.onMount(() => {
			mounted = true;
			assignReactRef(currentRef as ReactRef<unknown> | undefined, publicInstance);
			publicInstance.componentDidMount?.();
			scheduleCommit();
		});
		this.onRender(() => {
			scheduleCommit();
			finishTransitionRender();
		});
		this.onUnmount(() => {
			finishTransitionRender();
			mounted = false;
			removeOwnerFrame(exactInstance);
			try {
				publicInstance.componentWillUnmount?.();
			} finally {
				assignReactRef(currentRef as ReactRef<unknown> | undefined, null);
				callbacks.splice(0, callbacks.length);
				delete (publicInstance as unknown as Record<PropertyKey, unknown>)[REACT_CLASS_UPDATER];
				markReactClassInstanceUnmounted(publicInstance as object);
				(publicInstance as unknown as { _reactInternals?: unknown })._reactInternals = null;
			}
		});

		return () => {
			Number(this.state.__reactRevision);
			const restoreOwnerScope = enterReactOwnerScope(this, ownerFrame);
			try {
				const nextSnapshot = classProps(reactiveProps);
				if ('children' in nextSnapshot.props)
					nextSnapshot.props.children = toReactNode(nextSnapshot.props.children);
				const nextContext = readClassContext(this, statics.contextType, statics.contextTypes);
				const firstRender = constructing;
				const previousProps = committedProps;
				const previousState = committedState;
				const receivesProps = !shallowEqualProps(previousProps, nextSnapshot.props);

				if (!firstRender && receivesProps && !statics.getDerivedStateFromProps) {
					publicInstance.componentWillReceiveProps?.(nextSnapshot.props, nextContext);
					publicInstance.UNSAFE_componentWillReceiveProps?.(nextSnapshot.props, nextContext);
				}
				const derived = statics.getDerivedStateFromProps?.(
					nextSnapshot.props,
					publicInstance.state
				);
				mergeState(derived, false);
				const nextState = publicInstance.state;

				let shouldUpdate = true;
				if (!firstRender && !force) {
					if (publicInstance.shouldComponentUpdate) {
						shouldUpdate =
							publicInstance.shouldComponentUpdate(nextSnapshot.props, nextState, nextContext) !==
							false;
					} else if (publicInstance.isPureReactComponent) {
						shouldUpdate =
							!shallowEqualProps(previousProps, nextSnapshot.props) ||
							!shallowEqualState(previousState, nextState);
					}
				}

				if (
					firstRender &&
					!statics.getDerivedStateFromProps &&
					!publicInstance.getSnapshotBeforeUpdate
				) {
					publicInstance.componentWillMount?.();
					publicInstance.UNSAFE_componentWillMount?.();
				} else if (
					!firstRender &&
					shouldUpdate &&
					!statics.getDerivedStateFromProps &&
					!publicInstance.getSnapshotBeforeUpdate
				) {
					publicInstance.componentWillUpdate?.(nextSnapshot.props, nextState, nextContext);
					publicInstance.UNSAFE_componentWillUpdate?.(nextSnapshot.props, nextState, nextContext);
				}

				publicInstance.props = nextSnapshot.props;
				publicInstance.state = nextState;
				publicInstance.context = nextContext;
				if (publicInstance.getChildContext) {
					const childContext = publicInstance.getChildContext();
					if (!childContext || typeof childContext !== 'object')
						throw new TypeError('getChildContext() must return an object');
					this.setContext(LegacyReactContext, { ...readLegacyContext(this), ...childContext });
				}
				if (nextSnapshot.ref !== currentRef) {
					const previousRef = currentRef;
					currentRef = nextSnapshot.ref;
					if (mounted)
						queueMicrotask(() => {
							try {
								assignReactRef(previousRef as ReactRef<unknown> | undefined, null);
								assignReactRef(currentRef as ReactRef<unknown> | undefined, publicInstance);
							} catch (error) {
								routeClassLifecycleError(this, error, 'ref');
							}
						});
				}

				if (shouldUpdate) {
					output = capturedWithoutDerivedState
						? null
						: withReactTransitionOwnership(renderTransition, () => publicInstance.render());
					if (!firstRender) {
						const snapshot = publicInstance.getSnapshotBeforeUpdate?.(previousProps, previousState);
						pendingDidUpdate = { props: previousProps, state: previousState, snapshot };
					}
				}
				committedProps = nextSnapshot.props;
				committedState = publicInstance.state;
				force = false;
				constructing = false;
				return withReactTransitionOwnership(renderTransition, () => toExactNode(output));
			} finally {
				restoreOwnerScope();
			}
		};
	} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;
	Object.defineProperty(adapter, 'name', {
		configurable: true,
		value: `ExactReactClass(${displayName})`
	});
	return adapter;
}
