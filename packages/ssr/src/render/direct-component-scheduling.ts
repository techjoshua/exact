import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';
import {
	isOpaqueOperation,
	assertComponentOperationProvider
} from '@exactjs/core/runtime/component-operations';
import {
	attachSuppressedCleanupFailure,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import {
	createServerComponentExecutionFrame,
	type ServerComponentExecutionFrame
} from '@exactjs/core/framework/server-component-execution';
import type { SsrContext } from '../types.js';
import { withRenderCleanup } from './execution.js';
import { settleSsrReadiness } from './resume-scheduling.js';
import { AsyncSsrScheduler } from './async-scheduler.js';
import { prepareDirectComponentProps } from './component-props.js';
import { contextPublicationDependencies } from './context-publication-dependencies.js';
import { readDirectSsrContent } from './direct-component-content.js';
import type {
	DirectIssuedRender,
	DirectScheduledPreparation,
	DirectScheduledPreparationOwner,
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
	prepareServerComponentInputs,
	serverComponentInputProvider,
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
	const preparedProps = prepareDirectComponentProps(rawProps, server.deferredTaskProps, options);
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
 * The existing caller boundary must retain `owner.preparation` before invoking this walk.
 * Its cleanup awaits every unconsumed prefix even when later acquisition throws synchronously.
 */
export function prepareDirectScheduledSsrComponentReferences(
	context: SsrContext,
	values: readonly unknown[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	owner: DirectScheduledPreparationOwner
): DirectScheduledPreparation | undefined {
	const previous = context.componentInputFrame;
	const next = previous?.entries[previous.cursor];
	// The generated writer reaches the retained slot through an ordinary one-child wrapper.
	// Keep its already selected entry pending until that slot passes its exact children sequence.
	if (
		next?.kind === 'slot' &&
		values.length === 1 &&
		values[0] === next.source &&
		next.parent === parent
	)
		return owner.preparation;
	// A server slot passes the same retained children sequence into its ordinary traversal.
	// This consumes the carried frame. No raw component identity search selects an occurrence.
	if (next?.kind === 'slot' && next.values === values && next.parent === parent) {
		previous!.cursor++;
		const frame = next.frame;
		frame.previous = previous;
		context.componentInputFrame = frame;
		const prior = owner.preparation;
		const preparation: DirectScheduledPreparation = {
			frame,
			[Symbol.asyncDispose]: async () => {
				if (context.componentInputFrame === frame) context.componentInputFrame = previous;
				if (prior) await prior[Symbol.asyncDispose]();
			}
		};
		// Parent preparation still owns the slot's records.
		owner.preparation = preparation;
		return preparation;
	}
	const records: PreparedDirectScheduledSsrComponent[] = [];
	const prior = owner.preparation;
	let disposed = false;
	const preparation = {
		frame: undefined as
			| import('./direct-component-contracts.js').ComponentInputOutputFrame
			| undefined,
		async [Symbol.asyncDispose]() {
			if (disposed) return;
			disposed = true;
			if (preparation.frame && context.componentInputFrame === preparation.frame)
				context.componentInputFrame = previous;
			await withRenderCleanup(
				() => disposePrepared(context, records),
				() => (prior ? Promise.resolve(prior[Symbol.asyncDispose]()) : undefined)
			);
		}
	} satisfies DirectScheduledPreparation;
	// Publish cleanup ownership before the first input acquisition or nested slot traversal.
	owner.preparation = preparation;
	const frame = prepareOutputFrame(context, values, parent, options, records);
	preparation.frame = frame;
	if (!frame.entries.length) {
		owner.preparation = prior;
		return prior;
	}
	frame.previous = previous;
	context.componentInputFrame = frame;
	return preparation;
}

/** Extends the existing sibling prefix through already evaluated server-slot output only. */
function prepareOutputFrame(
	context: SsrContext,
	values: readonly unknown[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	records: PreparedDirectScheduledSsrComponent[]
): import('./direct-component-contracts.js').ComponentInputOutputFrame {
	const entries: import('./direct-component-contracts.js').ComponentInputOutputFrame['entries'][number][] =
		[];
	let position = -1;
	for (const value of values) {
		position++;
		if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
		if (isOpaqueOperation(value))
			assertComponentOperationProvider(value, serverComponentInputProvider);
		const slot = readServerSlotReceipt(value);
		if (slot) {
			entries.push({
				kind: 'slot',
				position,
				source: value,
				values: slot.children,
				parent,
				frame: prepareOutputFrame(context, slot.children, parent, options, records)
			});
			continue;
		}
		const reference = readServerComponentReference(value);
		if (!reference) continue;
		const root = context.rootComponentInputs;
		// Only the actual original single root sequence owns this pre-captured pass record.
		const inputs =
			parent === undefined && values.length === 1 && root?.source === value
				? root.inputs
				: undefined;
		const record = prepareDirectScheduledSsrComponentReference(
			context,
			reference,
			parent,
			options,
			inputs
		);
		if (record) {
			if (inputs) context.rootComponentInputs = undefined;
			(record as { reserved?: true }).reserved = true;
			records.push(record);
			entries.push({ position, kind: 'component', record });
		}
	}
	return { entries, cursor: 0 };
}

function prepareDirectScheduledSsrComponentReference(
	context: SsrContext,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	captured?: import('./server-component-reference.js').ComponentExecutionInputRecord
): PreparedDirectScheduledSsrComponent | undefined {
	if (receiptExecutionContract(reference).artifact.execution.classification !== 'scheduled') return;
	const pass = (context.componentInputPass ??= {});
	const inputs = captured ?? prepareServerComponentInputs(reference.admitted, pass, {});
	reference = {
		...reference,
		props: inputs.inputs.props,
		children: inputs.inputs.children,
		inputs
	};
	let created:
		| DirectScheduledSsrComponent
		| Promise<DirectScheduledSsrComponent | undefined>
		| undefined;
	try {
		const contract = receiptExecutionContract(reference);
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
	const record: PreparedDirectScheduledSsrComponent = {
		component: created,
		inputs,
		parent,
		consumed: false,
		reference
	};
	(context.preparedDirectScheduledComponents ??= []).push(record);
	return record;
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
	const owner = selectedDirectSsrOwner(context, blueprint.contract, frame, parent);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	let renderedVersion = -1;
	let renderedPublication = -1;
	const capture = options.resumptionCapture;
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
							renderedPublication = execution.publicationVersion;
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
			renderedPublication = execution.publicationVersion;
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
		drain,
		publicationChanged() {
			return capture !== undefined && renderedPublication !== execution.publicationVersion;
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

/**
 * Retains actual output for subsequent ordered consumption. Merely issuing a raw recipe during
 * authored selection does not acquire it under a speculative receiving owner. Scheduled siblings
 * start together when their evaluated output sequence enters the existing preparation boundary.
 */
export function renderIssuedServerComponentChildren(
	_context: SsrContext,
	_options: SsrRenderOptions,
	render: () => unknown,
	_owner: AnyComponentInstance | undefined
): DirectIssuedRender {
	return { content: readDirectSsrContent(render()) };
}

async function disposePrepared(
	context: SsrContext,
	prepared: readonly PreparedDirectScheduledSsrComponent[]
): Promise<void> {
	const failures: unknown[] = [];
	for (const record of prepared) {
		const index = context.preparedDirectScheduledComponents?.indexOf(record) ?? -1;
		if (index >= 0) context.preparedDirectScheduledComponents!.splice(index, 1);
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
