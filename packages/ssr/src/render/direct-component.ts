import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import type { SsrRenderOptions } from './entrypoints.js';
import { prepareComponentProps } from './component-props.js';
import {
	readDirectSsrContent,
	type DirectSsrComponentContent
} from './direct-component-content.js';
import {
	inComponentDomain,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import { createSelectedDirectSsrFrame, selectedDirectSsrOwner } from './direct-frame-selection.js';
import type { DirectIssuedRender } from './direct-component-contracts.js';
import {
	disposeDirectSsrLifetimeSync,
	renderIssuedServerComponentChildren
} from './direct-component-scheduling.js';
import {
	disposeAsyncPreservingPrimary,
	disposePreservingPrimary,
	noPrimaryFailure
} from './ownership.js';

export type { DirectSsrComponentContent } from './direct-component-content.js';
export type {
	DirectIssuedRender,
	DirectScheduledPreparation,
	DirectScheduledSsrComponent,
	DirectSsrComponentPublisher,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';
export {
	createDirectScheduledSsrComponent,
	disposeDirectSsrLifetime,
	disposeDirectSsrLifetimeSync,
	renderIssuedServerComponentChildren,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';

/** Sink selected by the synchronous renderer after the component-local program is executed. */
export type DirectSsrSyncSink<Result> = (
	content: DirectSsrComponentContent,
	owner: AnyComponentInstance | undefined,
	props: Record<string, unknown>,
	snapshot: DirectSsrComponentSnapshot
) => Result;

/** Executes and publishes one synchronous artifact without an intermediate issued-result object. */
export function executeDirectSsrComponentSync<Result>(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	props: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	sink: DirectSsrSyncSink<Result>
): Result | undefined {
	const artifact = contract.artifact;
	const server = artifact.execution;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const frame = createSelectedDirectSsrFrame(context, contract, parent);
	const owner = selectedDirectSsrOwner(contract, frame, parent);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	let render: unknown;
	if (server.mode !== 'direct') {
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
	}
	let primary: unknown = noPrimaryFailure;
	try {
		const started = lifecycle ? performanceNow() : 0;
		const content = readDirectSsrContent(
			inComponentDomain(context, () =>
				server.mode === 'direct' ? server.render!.call(frame, props) : (render as () => unknown)()
			)
		);
		lifecycle?.rendered(frame, performanceNow() - started);
		const snapshot = {
			componentId: artifact.id,
			contract,
			host: frame,
			state: frame.state,
			props
		};
		context.onDirectComponentCreated?.(snapshot);
		const checkpoint = context.onComponentAttemptCheckpoint?.();
		try {
			const output = sink(content, owner, props, snapshot);
			context.onDirectComponentRendered?.(snapshot);
			return output;
		} catch (error) {
			context.onComponentAttemptRollback?.(checkpoint);
			throw error;
		}
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		if (lifecycle)
			disposePreservingPrimary(
				() => disposeDirectSsrLifetimeSync({ frame, lifecycle }, 'ssr render complete'),
				primary
			);
	}
}

/** Sink selected by the asynchronous renderer after direct child preparation. */
export type DirectSsrAsyncSink<Result> = (
	content: DirectSsrComponentContent,
	owner: AnyComponentInstance | undefined,
	props: Record<string, unknown>,
	snapshot: DirectSsrComponentSnapshot
) => Result | Promise<Result>;

/** Executes one synchronous artifact directly into a request-owned asynchronous sink. */
export async function executeDirectSsrComponent<Result>(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	sink: DirectSsrAsyncSink<Result>
): Promise<Result | undefined> {
	const artifact = contract.artifact;
	const server = artifact.execution;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const props = await prepareComponentProps(rawProps, server.deferredTaskProps, options.signal);
	const frame = createSelectedDirectSsrFrame(context, contract, parent);
	const owner = selectedDirectSsrOwner(contract, frame, parent);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	let render: unknown;
	if (server.mode !== 'direct') {
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
	}
	let preparation: DirectIssuedRender['preparation'];
	let primary: unknown = noPrimaryFailure;
	try {
		const started = lifecycle ? performanceNow() : 0;
		const issued = await renderIssuedServerComponentChildren(
			context,
			options,
			() =>
				inComponentDomain(context, () =>
					server.mode === 'direct' ? server.render!.call(frame, props) : (render as () => unknown)()
				),
			owner
		);
		lifecycle?.rendered(frame, performanceNow() - started);
		preparation = issued.preparation;
		const snapshot = {
			componentId: artifact.id,
			contract,
			host: frame,
			state: frame.state,
			props
		};
		context.onDirectComponentCreated?.(snapshot);
		const checkpoint = context.onComponentAttemptCheckpoint?.();
		try {
			const output = await sink(issued.content, owner, props, snapshot);
			context.onDirectComponentRendered?.(snapshot);
			return output;
		} catch (error) {
			context.onComponentAttemptRollback?.(checkpoint);
			throw error;
		}
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		if (preparation)
			await disposeAsyncPreservingPrimary(
				() => Promise.resolve(preparation![Symbol.asyncDispose]()),
				primary
			);
		if (lifecycle)
			await disposeAsyncPreservingPrimary(
				() => Promise.resolve(lifecycle.dispose(frame, 'ssr render complete')),
				primary
			);
	}
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
