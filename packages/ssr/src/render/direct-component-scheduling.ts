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
import { settleSsrReadiness } from './resume-scheduling.js';
import { AsyncSsrScheduler } from './async-scheduler.js';
import { prepareComponentProps } from './component-props.js';
import { contextPublicationDependencies } from './context-publication-dependencies.js';
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
	receiptExecutionContract,
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
	const preparedProps = prepareComponentProps(rawProps, server.deferredTaskProps, options);
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
 * Accepts ordered program values directly so callers need not allocate a filtered reference list.
 * The returned boundary releases only frames that later rendering did not consume.
 */
export function prepareDirectScheduledSsrComponentReferences(
	context: SsrContext,
	values: readonly (ServerComponentReference | string | readonly Child[])[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectScheduledPreparation | undefined {
	let prepared: PreparedDirectScheduledSsrComponent[] | undefined;
	for (const value of values) {
		if (typeof value === 'string' || Array.isArray(value)) continue;
		// Array.isArray does not narrow the readonly array member of this internal union.
		const reference = value as ServerComponentReference;
		if (context.preparedDirectScheduledComponents?.has(reference)) continue;
		let created:
			| DirectScheduledSsrComponent
			| Promise<DirectScheduledSsrComponent | undefined>
			| undefined;
		try {
			const contract = receiptExecutionContract(reference);
			if (contract.artifact.execution?.classification !== 'scheduled') continue;
			created = createDirectScheduledSsrComponent(
				context,
				{ componentId: contract.artifact.id, contract },
				serverComponentProps(reference),
				parent,
				options
			);
		} catch (error) {
			created = Promise.reject(error);
		}
		if (!created) continue;
		const record: PreparedDirectScheduledSsrComponent = {
			component: created,
			consumed: false,
			reference
		};
		(prepared ??= []).push(record);
		(context.preparedDirectScheduledComponents ??= new WeakMap()).set(reference, record);
	}
	const owned = prepared;
	return owned ? { [Symbol.asyncDispose]: () => disposePrepared(context, owned) } : undefined;
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
	let renderedVersion = -1;
	const changed = () => renderedVersion !== execution.blockingVersion;
	const drain = (): boolean | Promise<boolean> => {
		const pending = settleSsrReadiness(execution, options, context.maxTaskPasses);
		return pending instanceof Promise ? pending.then(changed) : changed();
	};
	const execution: ServerComponentExecutionFrame = createServerComponentExecutionFrame(frame, {
		...(server.streamingDocument
			? {
					prepareOutput<T>(read: () => T): T | Promise<T> {
						const pending =
							options.streamingScheduledComponents && !options.settleDocumentShell
								? undefined
								: drain();
						const complete = () => {
							renderedVersion = execution.blockingVersion;
							return execution.run(() => inComponentDomain(context, read));
						};
						return pending instanceof Promise ? pending.then(complete) : complete();
					}
				}
			: {}),
		publicationDependencies: options.resumptionCapture
			? contextPublicationDependencies(blueprint.contract)
			: undefined,
		runTask: <T>(work: () => Promise<T>) =>
			(context.asyncScheduler ??= new AsyncSsrScheduler(options.maxAsyncSsrConcurrency)).run(
				work,
				options.signal
			)
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
			renderedVersion = execution.blockingVersion;
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
		drain() {
			return drain();
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

/** Claims one frame issued when compiler-generated parent render code created this component. */
export function takePreparedDirectScheduledSsrComponent(
	context: SsrContext,
	component: object
): DirectScheduledSsrComponent | Promise<DirectScheduledSsrComponent | undefined> | undefined {
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
