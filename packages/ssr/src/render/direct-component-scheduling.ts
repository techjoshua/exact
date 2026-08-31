import {
	attachSuppressedCleanupFailure,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import {
	createServerComponentExecutionFrame,
	withServerComponentIssuer,
	type ServerComponentExecutionFrame
} from '@exactjs/core/framework/server-component-execution';
import type { SsrContext } from '../types.js';
import { prepareComponentProps } from './component-props.js';
import { drainTasks } from './context.js';
import { readDirectSsrContent } from './direct-component-content.js';
import type {
	DirectIssuedRender,
	DirectScheduledPreparation,
	DirectScheduledSsrComponent,
	DirectSsrComponentLifetime,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';
import {
	inComponentDomain,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import { createSelectedDirectSsrFrame, selectedDirectSsrOwner } from './direct-frame-selection.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import {
	readServerComponentReference,
	receiptExecutionBlueprint,
	serverComponentProps,
	type ServerComponentReference
} from './server-component-reference.js';

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
	const server = blueprint.contract.artifact.execution;
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

/**
 * Issues compiler-proven scheduled siblings before their serial HTML positions are written.
 * The returned boundary releases only frames that later rendering did not consume.
 */
export function prepareDirectScheduledSsrComponentReferences(
	context: SsrContext,
	references: readonly ServerComponentReference[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectScheduledPreparation | undefined {
	const prepared: PreparedDirectScheduledSsrComponent[] = [];
	for (const reference of references) {
		if (context.preparedDirectScheduledComponents?.has(reference)) continue;
		let created:
			| DirectScheduledSsrComponent
			| Promise<DirectScheduledSsrComponent | undefined>
			| undefined;
		try {
			created = createDirectScheduledSsrComponent(
				context,
				receiptExecutionBlueprint(reference),
				serverComponentProps(reference),
				parent,
				options
			);
		} catch (error) {
			created = Promise.reject(error);
		}
		if (!created) continue;
		const record: PreparedDirectScheduledSsrComponent = {
			component: Promise.resolve(created),
			consumed: false,
			reference
		};
		prepared.push(record);
		(context.preparedDirectScheduledComponents ??= new WeakMap()).set(reference, record);
	}
	return prepared.length
		? { [Symbol.asyncDispose]: () => disposePrepared(context, prepared) }
		: undefined;
}

function constructDirectScheduledSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	props: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectScheduledSsrComponent | Promise<never> {
	const server = blueprint.contract.artifact.execution!;
	const frame = createSelectedDirectSsrFrame(context, blueprint.contract, parent);
	const owner = selectedDirectSsrOwner(blueprint.contract, frame, parent);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	const pending = new Set<Promise<unknown>>();
	const execution: ServerComponentExecutionFrame = createServerComponentExecutionFrame(frame, {
		observe(settlement) {
			const observed = Promise.resolve(settlement);
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
			host: frame,
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
			if (pending.size === 0) return false;
			await drainObservedBlockingTasks(
				pending,
				context.maxTaskPasses,
				options.signal,
				options.taskDeadline
			);
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

/**
 * Drains and acknowledges every blocking generation observed before the current render completed.
 * Settled promises remain queued until this point so a task that finishes while HTML is being
 * serialized cannot publish state without forcing a fresh render pass.
 */
async function drainObservedBlockingTasks(
	pending: Set<Promise<unknown>>,
	maxPasses: number,
	signal?: AbortSignal,
	deadline?: number
): Promise<void> {
	const acknowledged = [...pending];
	for (const settlement of acknowledged) pending.delete(settlement);
	const draining = new Set<Promise<unknown>>();
	for (const settlement of acknowledged) {
		const tracked = settlement.finally(() => draining.delete(tracked));
		draining.add(tracked);
	}
	await drainTasks(draining, maxPasses, signal, deadline);
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

/** Claims one frame issued when compiler-generated parent render code created this component. */
export function takePreparedDirectScheduledSsrComponent(
	context: SsrContext,
	component: object
): Promise<DirectScheduledSsrComponent | undefined> | undefined {
	const prepared = context.preparedDirectScheduledComponents?.get(component);
	if (!prepared || prepared.consumed) return undefined;
	(prepared as { consumed: boolean }).consumed = true;
	context.preparedDirectScheduledComponents?.delete(component);
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
		const output = withServerComponentIssuer((candidate) => {
			const component = readServerComponentReference(candidate);
			if (!component) return;
			const preparation = prepareDirectScheduledSsrComponentReferences(
				context,
				[component],
				owner,
				options
			);
			if (!preparation) return;
			const record = context.preparedDirectScheduledComponents?.get(component);
			if (record) prepared.push(record);
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
		context.preparedDirectScheduledComponents?.delete(record.reference);
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
