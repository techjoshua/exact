import type { AnyComponentInstance, Child } from '@exactjs/core';
import {
	readPreparedExactExecutableComponentContract,
	type AnyExactComponentCallable,
	type ExactServerExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { markerId } from '../markup.js';
import { directComponentHtml } from './direct-component-output.js';
import { executeDirectSsrComponentSync } from './direct-component.js';
import { renderPreparedSsrProgramString } from './sync-render-program.js';
import { receiptExecutionContract, serverComponentProps } from './server-component-reference.js';
import { renderOperationEnhancements } from './operation-enhancements.js';

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
		const renderBuffered = () =>
			executeDirectSsrComponentSync(
				context,
				contract,
				props,
				parent,
				(content, owner, preparedProps) => {
					const html = renderOperationEnhancements(
						context,
						enhancement,
						() =>
							content.program
								? renderPreparedSsrProgramString(context, content.program, owner, operations)
								: operations.renderChildren(context, content.children, owner, true),
						owner,
						operations.renderChildren
					);
					return directComponentHtml(
						context,
						markerId(context, 'component', contract.artifact.id, key),
						html,
						preparedProps,
						contract.artifact.execution.publication,
						{
							enhancement: false,
							documentProbe,
							hasComponentAncestor,
							omitCompilerOwnedBoundary,
							omitRootBoundary
						}
					);
				}
			);
		const buffered = context.outputSink?.publishesDirectly()
			? context.outputSink.bufferRange(() => {
					const output = renderBuffered();
					if (output === undefined)
						throw new TypeError(
							'Synchronous component operation selected a scheduled server artifact'
						);
					return output;
				})
			: renderBuffered();
		if (buffered === undefined)
			throw new TypeError('Synchronous component operation selected a scheduled server artifact');
		return buffered;
	}

	const output = executeDirectSsrComponentSync(
		context,
		contract,
		props,
		parent,
		(content, owner) =>
			content.program
				? renderPreparedSsrProgramString(context, content.program, owner, operations)
				: operations.renderChildren(context, content.children, owner, true)
	);
	if (output === undefined)
		throw new TypeError('Synchronous component operation selected a scheduled server artifact');
	markerId(context, 'component', contract.artifact.id, key);
	return output;
}
