import {
	attachSuppressedCleanupFailure,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import {
	readPreparedExactExecutableComponentContract,
	type AnyExactComponentCallable,
	type ExactServerExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-abi';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import { markerId } from '../markup.js';
import { directComponentHtml } from './direct-component-output.js';
import { readDirectSsrContent } from './direct-component-content.js';
import { disposeDirectSsrLifetimeSync } from './direct-component-scheduling.js';
import {
	callInComponentDomain,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import { createSelectedDirectSsrFrame, selectedDirectSsrOwner } from './direct-frame-selection.js';
import { renderPreparedSsrProgramString } from './sync-render-program.js';
import { receiptExecutionContract, serverComponentProps } from './server-component-reference.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import { disposePreservingPrimary, noPrimaryFailure } from './ownership.js';

/** Target-local recursion supplied to synchronous component serialization. */
export type SyncComponentOperations = Readonly<{
	renderChildren(
		context: SsrContext,
		children: readonly Child[],
		parent?: AnyComponentInstance,
		hasComponentAncestor?: boolean
	): string;
	renderComponent(
		context: SsrContext,
		component: ExactComponentReceiptData,
		parent?: AnyComponentInstance,
		hasComponentAncestor?: boolean,
		omitCompilerOwnedBoundary?: boolean
	): string;
	renderDirectComponent(
		context: SsrContext,
		component: AnyExactComponentCallable,
		props: Record<string, unknown> | null,
		parent?: AnyComponentInstance,
		hasComponentAncestor?: boolean,
		omitCompilerOwnedBoundary?: boolean
	): string;
}>;

/** Internal control signal selecting a Suspense fallback for scheduled direct server work. */
export class SsrScheduledComponentSignal extends Error {
	constructor() {
		super('Scheduled server component requires asynchronous rendering');
		this.name = 'SsrScheduledComponentSignal';
	}
}

/** Renders one opaque component operation through its synchronous server artifact. */
export function renderSyncComponentReceipt(
	context: SsrContext,
	receipt: ExactComponentReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	operations: SyncComponentOperations,
	omitCompilerOwnedBoundary = false,
	omitRootBoundary = false
): string {
	const contract = receiptExecutionContract(receipt);
	return renderSyncComponent(
		context,
		contract,
		serverComponentProps(receipt),
		parent,
		hasComponentAncestor,
		operations,
		receipt.enhancement,
		receipt.key,
		omitCompilerOwnedBoundary,
		omitRootBoundary
	);
}

/** Issues one compiler-proven child callable without constructing a prepared reference object. */
export function renderSyncDirectComponent(
	context: SsrContext,
	component: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	operations: SyncComponentOperations,
	omitCompilerOwnedBoundary = false
): string {
	const contract = readPreparedExactExecutableComponentContract(component);
	if (contract.artifact.target !== 'server')
		throw new TypeError('Server renderer received a client component artifact');
	return renderSyncComponent(
		context,
		contract as ExactServerExecutableComponentContract,
		props ?? {},
		parent,
		hasComponentAncestor,
		operations,
		undefined,
		undefined,
		omitCompilerOwnedBoundary,
		false
	);
}

function renderSyncComponent(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	props: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	operations: SyncComponentOperations,
	enhancement: ExactComponentReceiptData['enhancement'],
	key: string | undefined,
	omitCompilerOwnedBoundary: boolean,
	omitRootBoundary: boolean
): string {
	if (contract.artifact.execution.classification === 'scheduled')
		throw new SsrScheduledComponentSignal();
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	if (enhancement) context.outputSink?.invalidateAccounting();
	const resumable = contract.artifact.execution.publication?.kind === 'resumption';
	const delimited =
		!omitRootBoundary && !(omitCompilerOwnedBoundary && !resumable) && !documentProbe;
	const requiresBufferedBoundary =
		!!enhancement || (documentProbe && context.documentRootSeen) || delimited;
	if (!context.outputSink?.publishesDirectly() || requiresBufferedBoundary) {
		const buffered = context.outputSink?.publishesDirectly()
			? context.outputSink.bufferRange(() => {
					return executeSyncComponentOutput(context, contract, props, parent, operations, {
						enhancement,
						key,
						documentProbe,
						hasComponentAncestor,
						omitCompilerOwnedBoundary,
						omitRootBoundary
					});
				})
			: executeSyncComponentOutput(context, contract, props, parent, operations, {
					enhancement,
					key,
					documentProbe,
					hasComponentAncestor,
					omitCompilerOwnedBoundary,
					omitRootBoundary
				});
		return buffered;
	}

	return executeSyncComponentOutput(context, contract, props, parent, operations, undefined, key);
}

type SyncComponentBoundary = Readonly<{
	enhancement: ExactComponentReceiptData['enhancement'];
	key: string | undefined;
	documentProbe: boolean;
	hasComponentAncestor: boolean;
	omitCompilerOwnedBoundary: boolean;
	omitRootBoundary: boolean;
}>;

/** Executes the synchronous artifact and publishes its component-local output in one owner. */
function executeSyncComponentOutput(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	props: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	operations: SyncComponentOperations,
	boundary?: SyncComponentBoundary,
	directKey?: string
): string {
	const artifact = contract.artifact;
	const server = artifact.execution;
	if (server.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		throw new TypeError('Synchronous component operation selected a scheduled server artifact');
	const stateless =
		server.mode === 'stateless' &&
		!context.onDirectComponentCreated &&
		!context.onDirectComponentRendered;
	// Keep one ordinary request-local receiver shape at this shared hot callsite. Passing
	// `undefined` for stateless leaves makes otherwise identical component calls polymorphic.
	const frame = createSelectedDirectSsrFrame(context, contract, parent);
	const owner = stateless ? parent : selectedDirectSsrOwner(contract, frame, parent);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	let render: unknown;
	if (server.mode !== 'direct' && server.mode !== 'stateless') {
		try {
			render = callInComponentDomain(context, server.render, frame, props);
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
		const rendered =
			server.mode === 'direct' || server.mode === 'stateless'
				? callInComponentDomain(context, server.render, frame, props)
				: callInComponentDomain(
						context,
						render as (argument: undefined) => unknown,
						undefined,
						undefined
					);
		const content = readDirectSsrContent(rendered);
		lifecycle?.rendered(frame, performanceNow() - started);
		const checkpoint = context.onComponentAttemptCheckpoint?.();
		const resumptionCheckpoint = stateless ? undefined : context.resumptionCapture?.checkpoint();
		const outputCheckpoint = context.outputSink?.checkpoint();
		const resumptionToken = stateless
			? undefined
			: context.resumptionCapture?.reserveDirect(artifact.id, contract);
		const snapshot = stateless
			? undefined
			: createObservedSnapshot(context, artifact.id, contract, frame, props);
		if (snapshot) context.onDirectComponentCreated?.(snapshot);
		try {
			const output = boundary
				? renderBufferedComponentOutput(
						context,
						contract,
						props,
						owner,
						operations,
						content,
						boundary
					)
				: content.program
					? renderPreparedSsrProgramString(context, content.program, owner, operations)
					: operations.renderChildren(context, content.children, owner, true);
			if (!boundary) markerId(context, 'component', artifact.id, directKey);
			if (resumptionToken !== undefined)
				context.resumptionCapture?.publishDirect(resumptionToken, frame, frame.state, props);
			if (snapshot) context.onDirectComponentRendered?.(snapshot);
			return output;
		} catch (error) {
			if (outputCheckpoint !== undefined) context.outputSink?.rollback(outputCheckpoint);
			if (resumptionCheckpoint !== undefined)
				context.resumptionCapture?.rollback(resumptionCheckpoint);
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

function renderBufferedComponentOutput(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	props: Record<string, unknown>,
	owner: AnyComponentInstance | undefined,
	operations: SyncComponentOperations,
	content: ReturnType<typeof readDirectSsrContent>,
	boundary: SyncComponentBoundary
): string {
	const html = renderOperationEnhancements(
		context,
		boundary.enhancement,
		() =>
			content.program
				? renderPreparedSsrProgramString(context, content.program, owner, operations)
				: operations.renderChildren(context, content.children, owner, true),
		owner,
		operations.renderChildren
	);
	return directComponentHtml(
		context,
		markerId(context, 'component', contract.artifact.id, boundary.key),
		html,
		props,
		contract.artifact.execution.publication,
		{
			enhancement: false,
			documentProbe: boundary.documentProbe,
			hasComponentAncestor: boundary.hasComponentAncestor,
			omitCompilerOwnedBoundary: boundary.omitCompilerOwnedBoundary,
			omitRootBoundary: boundary.omitRootBoundary
		}
	);
}

function createObservedSnapshot(
	context: SsrContext,
	componentId: string,
	contract: ExactServerExecutableComponentContract,
	host: object & { state: Record<string, unknown> },
	props: Record<string, unknown>
): DirectSsrComponentSnapshot | undefined {
	return context.onDirectComponentCreated || context.onDirectComponentRendered
		? { componentId, contract, host, state: host.state, props }
		: undefined;
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
