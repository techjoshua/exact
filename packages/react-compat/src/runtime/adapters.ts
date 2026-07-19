import {
	ErrorContext,
	createErrorContext,
	type Component,
	type ComponentFunction,
	type ComponentInstance
} from '@exact/core';
import type {
	ReactClassInstance,
	ReactClassType,
	ReactComponentType,
	ReactNode,
	ReactRef,
	ReactSpecialType
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
	snapshotProps,
	type ClassLifecycles,
	type ClassStatics
} from './class-support.js';
import { invokeReactType, readReactRootRuntime, toExactNode } from './nodes.js';
import { assignReactRef, readReactRef } from './refs.js';
import {
	LegacyReactContext,
	REACT_CLASS_UPDATER,
	REACT_MEMO_TYPE,
	REACT_REF_PROP
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
export * from './shared.js';

import {
	HookHost,
	createOwnerFrame,
	enterReactOwnerScope,
	removeOwnerFrame
} from '../internals.js';

const adapterCache = new WeakMap<object, ComponentFunction<any, any>>();
const classInstanceOwners = new WeakMap<object, ComponentInstance<any>>();
const unmountedClassInstances = new WeakSet<object>();
const unsetRef = Symbol('exact.react.unset-ref');

export function exactComponentForReactInstance(value: unknown): ComponentInstance<any> | undefined {
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		? classInstanceOwners.get(value as object)
		: undefined;
}

export function isUnmountedReactClassInstance(value: unknown): boolean {
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		? unmountedClassInstances.has(value as object)
		: false;
}

export function adaptReactType(
	type: ReactComponentType<any>
): ComponentFunction<Record<string, unknown>, Record<string, unknown>> {
	const identity = type as object;
	const cached = adapterCache.get(identity);
	if (cached) return cached;
	if (isReactClassType(type)) {
		const classAdapter = createClassAdapter(type);
		adapterCache.set(identity, classAdapter);
		return classAdapter;
	}
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
			host.mount();
		});
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
			return toExactNode(output);
		};
	} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;
	Object.defineProperty(adapter, 'name', {
		configurable: true,
		value: `ExactReact(${displayName})`
	});
	adapterCache.set(identity, adapter);
	return adapter;
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
		classInstanceOwners.set(publicInstance as object, exactInstance);
		unmountedClassInstances.delete(publicInstance as object);
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
		const callbacks: Array<() => void> = [];

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
				if (callback) callbacks.push(callback);
				if (!changed && callback) invalidate();
			},
			forceUpdate: (callback?: () => void) => {
				force = true;
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
		this.onRender(scheduleCommit);
		this.onUnmount(() => {
			mounted = false;
			removeOwnerFrame(exactInstance);
			try {
				publicInstance.componentWillUnmount?.();
			} finally {
				assignReactRef(currentRef as ReactRef<unknown> | undefined, null);
				callbacks.splice(0, callbacks.length);
				delete (publicInstance as unknown as Record<PropertyKey, unknown>)[REACT_CLASS_UPDATER];
				classInstanceOwners.delete(publicInstance as object);
				unmountedClassInstances.add(publicInstance as object);
				(publicInstance as unknown as { _reactInternals?: unknown })._reactInternals = null;
			}
		});

		return () => {
			Number(this.state.__reactRevision);
			const restoreOwnerScope = enterReactOwnerScope(this, ownerFrame);
			try {
				const nextSnapshot = classProps(reactiveProps);
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
					output = capturedWithoutDerivedState ? null : publicInstance.render();
					if (!firstRender) {
						const snapshot = publicInstance.getSnapshotBeforeUpdate?.(previousProps, previousState);
						pendingDidUpdate = { props: previousProps, state: previousState, snapshot };
					}
				}
				committedProps = nextSnapshot.props;
				committedState = publicInstance.state;
				force = false;
				constructing = false;
				return toExactNode(output);
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
