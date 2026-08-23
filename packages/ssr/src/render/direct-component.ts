import {
	Fragment,
	attachSuppressedCleanupFailure,
	createVNode,
	isVNode,
	normalizeRenderResult,
	unwrap,
	withComponentDomain,
	type Child,
	type ReactiveValue,
	type VNode
} from '@exactjs/core';
import {
	createServerComponentExecutionFrame,
	withServerComponentVNodeIssuer,
	type ServerComponentExecutionFrame
} from '@exactjs/core/framework/server-component-execution';
import { flushSync } from '@exactjs/reactive';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { drainTasks } from './context.js';
import { getComponentProps } from './component-vnode.js';
import { prepareComponentProps } from './component-props.js';
import {
	resolveSsrComponentExecution,
	type SsrComponentExecutionBlueprint
} from './root-execution-cache.js';

/** Minimal request-local receiver for compiler-proven synchronous server components. */
type DirectSsrComponentFrame = Readonly<{
	state: Record<string, unknown>;
	map: typeof directSsrMap;
}>;

/** Completed setup and render result awaiting successful descendant serialization. */
export type DirectSsrComponentResult = Readonly<{
	children: Child[];
	preparation?: DirectScheduledPreparation;
	props: Record<string, unknown>;
	snapshot: DirectSsrComponentSnapshot;
}>;

/** Request-local scheduled component whose task graph is drained between render attempts. */
export type DirectScheduledSsrComponent = AsyncDisposable &
	Readonly<{
		props: Record<string, unknown>;
		snapshot: DirectSsrComponentSnapshot;
		render(): DirectIssuedRender | Promise<DirectIssuedRender>;
		/** Returns whether blocking work existed and the completed output must be rendered again. */
		drain(): Promise<boolean>;
	}>;

/** Request-local scheduled frame issued before its serial HTML position is published. */
export type PreparedDirectScheduledSsrComponent = Readonly<{
	component: Promise<DirectScheduledSsrComponent | undefined>;
	consumed: boolean;
	vnode: VNode;
}>;

/** Cleanup boundary for eagerly issued compiler-proven descendant task frames. */
export type DirectScheduledPreparation = AsyncDisposable;

/** Render output paired with ownership for child work issued during VNode materialization. */
export type DirectIssuedRender = Readonly<{
	children: Child[];
	preparation?: DirectScheduledPreparation;
}>;

/**
 * Executes a compiler-classified synchronous component without constructing durable client
 * ownership. The compiler excludes lifecycle, task, context, authored-list, and dynamic
 * capabilities from this lane; encountering a non-function result is therefore an artifact defect.
 */
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>
): DirectSsrComponentResult | undefined;
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	options: SsrRenderOptions
): DirectSsrComponentResult | Promise<DirectSsrComponentResult> | undefined;
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	options?: SsrRenderOptions
): DirectSsrComponentResult | Promise<DirectSsrComponentResult> | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const frame: DirectSsrComponentFrame = { state: {}, map: directSsrMap };
	const props = directSsrProps(rawProps);
	const render = inComponentDomain(context, () => server.render!.call(frame, props));
	if (typeof render !== 'function')
		throw new TypeError('Compiled synchronous server component did not return its render function');
	const rendered = options
		? renderIssuedServerComponentChildren(context, options, () =>
				inComponentDomain(context, () => render())
			)
		: { children: normalizeRenderResult(inComponentDomain(context, () => render())) };
	return resolveMaybe(rendered, ({ children, preparation }) => ({
		children,
		...(preparation ? { preparation } : {}),
		props,
		snapshot: {
			componentId: blueprint.componentId,
			contract: blueprint.contract,
			state: frame.state
		}
	}));
}

/**
 * Constructs compiler-closed scheduled setup on a request-local frame. Task activations begin
 * immediately, allowing the renderer to discover and start descendant work before awaiting the
 * current component's blocking generations.
 */
export function createDirectScheduledSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	options: SsrRenderOptions
): DirectScheduledSsrComponent | Promise<DirectScheduledSsrComponent | undefined> | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'scheduled' || !server.render)
		return undefined;
	const preparedProps = prepareComponentProps(rawProps, server.setupProps, options.signal);
	return resolveMaybe(preparedProps, (props) =>
		constructDirectScheduledSsrComponent(context, blueprint, props, options)
	);
}

function constructDirectScheduledSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	props: Record<string, unknown>,
	options: SsrRenderOptions
): DirectScheduledSsrComponent | Promise<never> {
	const server = blueprint.contract.definition.server!;
	const frame: DirectSsrComponentFrame = { state: {}, map: directSsrMap };
	const pending = new Set<Promise<unknown>>();
	const execution: ServerComponentExecutionFrame = createServerComponentExecutionFrame(frame, {
		observe(settlement) {
			const observed = settlement.finally(() => pending.delete(observed));
			void observed.catch(() => undefined);
			pending.add(observed);
		},
		...(context.asyncFrame
			? {}
			: {
					runTask: <T>(work: () => Promise<T>) => context.asyncScheduler.run(work, options.signal)
				})
	});
	let render: unknown;
	try {
		render = execution.run(() =>
			inComponentDomain(context, () => server.render!.call(frame, props))
		);
	} catch (error) {
		return Promise.resolve(execution[Symbol.asyncDispose]()).then(() => Promise.reject(error));
	}
	if (typeof render !== 'function') {
		const error = new TypeError(
			'Compiled scheduled server component did not return its render function'
		);
		return Promise.resolve(execution[Symbol.asyncDispose]()).then(() => Promise.reject(error));
	}
	return Object.freeze({
		props,
		snapshot: {
			componentId: blueprint.componentId,
			contract: blueprint.contract,
			state: frame.state
		},
		render: () =>
			renderIssuedServerComponentChildren(context, options, () =>
				inComponentDomain(context, () => (render as () => Child | Child[])())
			),
		async drain() {
			const rerender = pending.size !== 0;
			if (!rerender) return false;
			await drainTasks(pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
			// Output publication schedules dependent setup work through the reactive scheduler.
			// Drain it before deciding whether this render attempt is stable.
			flushSync();
			return true;
		},
		[Symbol.asyncDispose]: () => execution[Symbol.asyncDispose]()
	});
}

/**
 * Claims one frame issued when compiler-generated parent render code created this exact VNode.
 */
export function takePreparedDirectScheduledSsrComponent(
	context: SsrContext,
	vnode: VNode
): Promise<DirectScheduledSsrComponent | undefined> | undefined {
	const prepared = context.preparedDirectScheduledComponents.get(vnode);
	if (!prepared || prepared.consumed) return undefined;
	(prepared as { consumed: boolean }).consumed = true;
	context.preparedDirectScheduledComponents.delete(vnode);
	return prepared.component;
}

/** Captures compiler-issued direct child frames while one component materializes its render tree. */
export function renderIssuedServerComponentChildren(
	context: SsrContext,
	options: SsrRenderOptions,
	render: () => Child | Child[]
): DirectIssuedRender | Promise<DirectIssuedRender> {
	const prepared: PreparedDirectScheduledSsrComponent[] = [];
	try {
		const children = normalizeRenderResult(
			withServerComponentVNodeIssuer((candidate) => {
				if (!isVNode(candidate) || typeof candidate.type !== 'function') return;
				let created:
					| DirectScheduledSsrComponent
					| Promise<DirectScheduledSsrComponent | undefined>
					| undefined;
				try {
					created = createDirectScheduledSsrComponent(
						context,
						resolveSsrComponentExecution(context, candidate.type),
						getComponentProps(candidate),
						options
					);
				} catch (error) {
					created = Promise.reject(error);
				}
				if (!created) return;
				const record: PreparedDirectScheduledSsrComponent = {
					component: Promise.resolve(created),
					consumed: false,
					vnode: candidate
				};
				prepared.push(record);
				context.preparedDirectScheduledComponents.set(candidate, record);
			}, render)
		);
		return {
			children,
			...(prepared.length
				? {
						preparation: Object.freeze({
							[Symbol.asyncDispose]: () => disposePrepared(context, prepared)
						})
					}
				: {})
		};
	} catch (error) {
		return disposePrepared(context, prepared).then(
			() => Promise.reject(error),
			(cleanup) => {
				attachSuppressedCleanupFailure(error, cleanup);
				return Promise.reject(error);
			}
		);
	}
}

async function disposePrepared(
	context: SsrContext,
	prepared: readonly PreparedDirectScheduledSsrComponent[]
): Promise<void> {
	const failures: unknown[] = [];
	for (const record of prepared) {
		context.preparedDirectScheduledComponents.delete(record.vnode);
		if (record.consumed) continue;
		try {
			const component = await record.component;
			if (component) await component[Symbol.asyncDispose]();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length) throw new AggregateError(failures, 'Failed to dispose prepared SSR tasks');
}

function resolveMaybe<T, U>(
	value: T | Promise<T>,
	project: (value: T) => U | Promise<U>
): U | Promise<U> {
	return value && typeof (value as Promise<T>).then === 'function'
		? Promise.resolve(value).then(project)
		: project(value as T);
}

/** Materializes a compiler-generated keyed-list fallback without caches or retained registration. */
function directSsrMap<T>(
	collection: Iterable<T> | ReactiveValue<Iterable<T>>,
	key: (item: T) => string,
	render: (item: T) => VNode,
	id?: string
): VNode {
	return createVNode(Fragment, {
		key: id,
		list: { collection: unwrap(collection) as Iterable<T>, key, render }
	});
}

/** Resolves compiler-emitted expression props without allocating the general readonly proxy. */
function directSsrProps(rawProps: Record<string, unknown>): Record<string, unknown> {
	let resolved = rawProps;
	for (const key of Object.keys(rawProps)) {
		// Component children are an owned VNode graph, matching the general props passthrough rule.
		if (key === 'children') continue;
		const value = unwrap(rawProps[key]);
		if (Object.is(value, rawProps[key])) continue;
		if (resolved === rawProps) resolved = { ...rawProps };
		resolved[key] = value;
	}
	return resolved;
}

function inComponentDomain<T>(context: SsrContext, work: () => T): T {
	return context.componentDomain ? withComponentDomain(context.componentDomain, work) : work();
}
