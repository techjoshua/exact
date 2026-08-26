import {
	attachSuppressedCleanupFailure,
	isVNode,
	type AnyComponentFunction,
	type AnyComponentInstance,
	type Child,
	type VNode
} from '@exactjs/core';
import {
	createServerComponentExecutionFrame,
	withServerComponentVNodeIssuer,
	type ServerComponentExecutionFrame
} from '@exactjs/core/framework/server-component-execution';
import type { SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { drainTasks } from './context.js';
import { getComponentProps } from './component-vnode.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import { prepareComponentProps } from './component-props.js';
import {
	resolveSsrComponentExecution,
	type SsrComponentExecutionBlueprint
} from './root-execution-cache.js';
import { readDirectSsrContent, renderDirectSsrContent } from './direct-component-content.js';
import {
	createDirectSsrComponentFrame,
	directSsrContextOwner,
	directSsrProps,
	inComponentDomain,
	type DirectSsrComponentFrameConstructor,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import type {
	DirectIssuedRender,
	DirectScheduledSsrComponent,
	DirectSsrComponentLifetime,
	DirectSsrComponentPublisher,
	DirectSsrComponentResult,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';

export type { DirectSsrComponentContent } from './direct-component-content.js';
export type {
	DirectIssuedRender,
	DirectScheduledPreparation,
	DirectScheduledSsrComponent,
	DirectSsrComponentPublisher,
	DirectSsrComponentResult,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';

/** Executes one compiler-proven direct component without entering generic component ownership. */
export async function renderDirectSsrComponentOutput<Publication>(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: (
		children: readonly Child[],
		parent: AnyComponentInstance | undefined
	) => Promise<string>,
	renderOwnedComponent: (
		component: VNode,
		parent: AnyComponentInstance | undefined
	) => Promise<string>,
	publish: DirectSsrComponentPublisher<Publication>,
	publication: Publication
): Promise<string | undefined> {
	const blueprint = resolveSsrComponentExecution(context, vnode.type as AnyComponentFunction);
	const rawProps = getComponentProps(vnode);
	const scheduled = await (takePreparedDirectScheduledSsrComponent(context, vnode) ??
		createDirectScheduledSsrComponent(context, blueprint, rawProps, parent, options));
	if (scheduled) {
		const constructionCheckpoint = context.onComponentAttemptCheckpoint?.();
		try {
			context.onDirectComponentCreated?.(scheduled.snapshot);
			const maxPasses = context.maxTaskPasses;
			for (let pass = 0; pass < maxPasses; pass++) {
				const renderCheckpoint = context.onComponentAttemptCheckpoint?.();
				const issued = await scheduled.render();
				let renderPrimary: unknown = noPrimaryFailure;
				try {
					const html = await renderDirectSsrContent(
						context,
						issued.content,
						scheduled.owner,
						renderChildren,
						renderOwnedComponent
					);
					if (await scheduled.drain()) {
						context.onComponentAttemptRollback?.(renderCheckpoint);
						continue;
					}
					const output = publish(
						context,
						vnode,
						parent,
						html,
						scheduled.props,
						scheduled.snapshot,
						publication
					);
					context.onDirectComponentRendered?.(scheduled.snapshot);
					return output;
				} catch (error) {
					renderPrimary = error;
					context.onComponentAttemptRollback?.(renderCheckpoint);
					throw error;
				} finally {
					if (issued.preparation)
						await disposeAsyncPreservingPrimary(
							() => Promise.resolve(issued.preparation![Symbol.asyncDispose]()),
							renderPrimary
						);
				}
			}
			throw new Error(
				`eXact direct scheduled SSR component did not stabilize after ${maxPasses} render passes`
			);
		} catch (error) {
			context.onComponentAttemptRollback?.(constructionCheckpoint);
			throw error;
		} finally {
			await scheduled[Symbol.asyncDispose]();
		}
	}
	const direct = await renderDirectSsrComponent(context, blueprint, rawProps, parent, options);
	if (!direct) return undefined;
	const checkpoint = context.onComponentAttemptCheckpoint?.();
	let primary: unknown = noPrimaryFailure;
	try {
		context.onDirectComponentCreated?.(direct.snapshot);
		let directPrimary: unknown = noPrimaryFailure;
		let html: string;
		try {
			html = await renderDirectSsrContent(
				context,
				direct.content,
				direct.owner,
				renderChildren,
				renderOwnedComponent
			);
		} catch (error) {
			directPrimary = error;
			throw error;
		} finally {
			if (direct.preparation)
				await disposeAsyncPreservingPrimary(
					() => Promise.resolve(direct.preparation![Symbol.asyncDispose]()),
					directPrimary
				);
		}
		const output = publish(
			context,
			vnode,
			parent,
			html,
			direct.props,
			direct.snapshot,
			publication
		);
		context.onDirectComponentRendered?.(direct.snapshot);
		return output;
	} catch (error) {
		primary = error;
		context.onComponentAttemptRollback?.(checkpoint);
		throw error;
	} finally {
		if (direct.lifetime)
			await disposeAsyncPreservingPrimary(
				() => Promise.resolve(disposeDirectSsrLifetime(direct.lifetime!, 'ssr render complete')),
				primary
			);
	}
}

/**
 * Executes a compiler-classified synchronous component without constructing durable client
 * ownership. The request-local frame supports compiler-known state, contexts, lists, and scheduled
 * tasks; lifecycle, dynamic selection, and other durable surfaces remain separately classified.
 * Encountering a non-function result is therefore an artifact defect.
 */
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined
): DirectSsrComponentResult | undefined;
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectSsrComponentResult | Promise<DirectSsrComponentResult> | undefined;
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options?: SsrRenderOptions
): DirectSsrComponentResult | Promise<DirectSsrComponentResult> | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const createFrame: DirectSsrComponentFrameConstructor =
		(server.frame as DirectSsrComponentFrameConstructor | undefined) ??
		createDirectSsrComponentFrame;
	const frame = createFrame(
		context,
		blueprint.contract.definition.instantiate,
		blueprint.componentId,
		parent
	);
	const owner = server.frame ? directSsrContextOwner(frame) : parent;
	const props = directSsrProps(rawProps);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	let render: unknown;
	try {
		render = inComponentDomain(context, () => server.render!.call(frame, props));
		if (typeof render !== 'function')
			throw new TypeError(
				'Compiled synchronous server component did not return its render function'
			);
	} catch (error) {
		if (lifecycle) {
			try {
				disposeDirectSsrLifetimeSync({ frame, lifecycle }, 'ssr construction failed');
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
		}
		throw error;
	}
	const invokeRender = () => {
		const started = lifecycle ? performanceNow() : 0;
		const output = inComponentDomain(context, () => (render as () => unknown)());
		lifecycle?.rendered(frame, performanceNow() - started);
		return output;
	};
	let rendered: DirectIssuedRender | Promise<DirectIssuedRender>;
	try {
		rendered = options
			? renderIssuedServerComponentChildren(context, options, invokeRender, owner)
			: { content: readDirectSsrContent(invokeRender()) };
	} catch (error) {
		if (lifecycle) {
			try {
				disposeDirectSsrLifetimeSync({ frame, lifecycle }, 'ssr render failed');
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
		}
		throw error;
	}
	return resolveMaybe(rendered, ({ content, preparation }) => ({
		content,
		...(lifecycle ? { lifetime: { frame, lifecycle } } : {}),
		owner,
		...(preparation ? { preparation } : {}),
		props,
		snapshot: {
			componentId: blueprint.componentId,
			contract: blueprint.contract,
			state: frame.state,
			props
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
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectScheduledSsrComponent | Promise<DirectScheduledSsrComponent | undefined> | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'scheduled' || !server.render)
		return undefined;
	const preparedProps = prepareComponentProps(rawProps, server.deferredTaskProps, options.signal);
	return resolveMaybe(preparedProps, (props) =>
		constructDirectScheduledSsrComponent(context, blueprint, props, parent, options)
	);
}

function constructDirectScheduledSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	props: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectScheduledSsrComponent | Promise<never> {
	const server = blueprint.contract.definition.server!;
	const createFrame: DirectSsrComponentFrameConstructor =
		(server.frame as DirectSsrComponentFrameConstructor | undefined) ??
		createDirectSsrComponentFrame;
	const frame = createFrame(
		context,
		blueprint.contract.definition.instantiate,
		blueprint.componentId,
		parent
	);
	const owner = server.frame ? directSsrContextOwner(frame) : parent;
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
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
		return disposeFailedDirectScheduledConstruction(execution, frame, lifecycle, error);
	}
	if (typeof render !== 'function') {
		const error = new TypeError(
			'Compiled scheduled server component did not return its render function'
		);
		return disposeFailedDirectScheduledConstruction(execution, frame, lifecycle, error);
	}
	return Object.freeze({
		owner,
		...(lifecycle ? { lifetime: { frame, lifecycle } } : {}),
		props,
		snapshot: {
			componentId: blueprint.componentId,
			contract: blueprint.contract,
			state: frame.state,
			props
		},
		render: () => {
			const started = lifecycle ? performanceNow() : 0;
			const issued = renderIssuedServerComponentChildren(
				context,
				options,
				() => inComponentDomain(context, () => (render as () => Child | Child[])()),
				owner
			);
			lifecycle?.rendered(frame, performanceNow() - started);
			return issued;
		},
		async drain() {
			const rerender = pending.size !== 0;
			if (!rerender) return false;
			await drainTasks(pending, context.maxTaskPasses, options.signal, options.taskDeadline);
			return true;
		},
		async [Symbol.asyncDispose]() {
			let primary: unknown = noPrimaryFailure;
			try {
				await execution[Symbol.asyncDispose]();
			} catch (error) {
				primary = error;
				throw error;
			} finally {
				if (lifecycle)
					await disposeAsyncPreservingPrimary(
						() => Promise.resolve(disposeDirectSsrLifetime({ frame, lifecycle }, 'ssr render complete')),
						primary
					);
			}
		}
	});
}

async function disposeFailedDirectScheduledConstruction(
	execution: ServerComponentExecutionFrame,
	frame: Parameters<DirectSsrLifecycleCapability['dispose']>[0],
	lifecycle: DirectSsrLifecycleCapability | undefined,
	primary: unknown
): Promise<never> {
	try {
		await execution[Symbol.asyncDispose]();
	} catch (cleanup) {
		attachSuppressedCleanupFailure(primary, cleanup);
	}
	if (lifecycle) {
		try {
			await lifecycle.dispose(frame, 'ssr construction failed');
		} catch (cleanup) {
			attachSuppressedCleanupFailure(primary, cleanup);
		}
	}
	throw primary;
}

/** Releases one compiler-linked direct lifetime after its complete component subtree. */
export function disposeDirectSsrLifetime(
	lifetime: DirectSsrComponentLifetime,
	reason: string
): void | Promise<void> {
	return lifetime.lifecycle.dispose(lifetime.frame, reason);
}

/** Starts direct cleanup from a synchronous renderer and observes asynchronous disposal failures. */
export function disposeDirectSsrLifetimeSync(
	lifetime: DirectSsrComponentLifetime,
	reason: string
): void {
	const disposal = disposeDirectSsrLifetime(lifetime, reason);
	if (disposal && typeof (disposal as PromiseLike<void>).then === 'function')
		void Promise.resolve(disposal).catch(() => undefined);
}

/**
 * Claims one frame issued when compiler-generated parent render code created this exact VNode.
 */
export function takePreparedDirectScheduledSsrComponent(
	context: SsrContext,
	vnode: VNode
): Promise<DirectScheduledSsrComponent | undefined> | undefined {
	const prepared = context.preparedDirectScheduledComponents?.get(vnode);
	if (!prepared || prepared.consumed) return undefined;
	(prepared as { consumed: boolean }).consumed = true;
	context.preparedDirectScheduledComponents?.delete(vnode);
	return prepared.component;
}

/** Captures compiler-issued direct child frames while one component materializes its render tree. */
export function renderIssuedServerComponentChildren(
	context: SsrContext,
	options: SsrRenderOptions,
	render: () => unknown,
	owner: AnyComponentInstance | undefined
): DirectIssuedRender | Promise<DirectIssuedRender> {
	const prepared: PreparedDirectScheduledSsrComponent[] = [];
	try {
		const output = withServerComponentVNodeIssuer((candidate) => {
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
					owner,
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
			(context.preparedDirectScheduledComponents ??= new WeakMap()).set(candidate, record);
		}, render);
		return {
			content: readDirectSsrContent(output),
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
		context.preparedDirectScheduledComponents?.delete(record.vnode);
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

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
