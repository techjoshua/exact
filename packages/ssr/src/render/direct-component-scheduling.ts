import {
	attachSuppressedCleanupFailure,
	isVNode,
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
import { getComponentProps } from './component-vnode.js';
import { prepareComponentProps } from './component-props.js';
import { drainTasks } from './context.js';
import { readDirectSsrContent } from './direct-component-content.js';
import type {
	DirectIssuedRender,
	DirectScheduledSsrComponent,
	DirectSsrComponentLifetime,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';
import {
	createDirectSsrComponentFrame,
	directSsrContextOwner,
	inComponentDomain,
	type DirectSsrComponentFrameConstructor,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import {
	resolveSsrComponentExecution,
	type SsrComponentExecutionBlueprint
} from './root-execution-cache.js';

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
	return preparedProps &&
		typeof (preparedProps as Promise<Record<string, unknown>>).then === 'function'
		? Promise.resolve(preparedProps).then((props) =>
				constructDirectScheduledSsrComponent(context, blueprint, props, parent, options)
			)
		: constructDirectScheduledSsrComponent(
				context,
				blueprint,
				preparedProps as Record<string, unknown>,
				parent,
				options
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
						() =>
							Promise.resolve(
								disposeDirectSsrLifetime({ frame, lifecycle }, 'ssr render complete')
							),
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

/** Claims one frame issued when compiler-generated parent render code created this exact VNode. */
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

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
