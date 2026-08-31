import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { componentMarkerId } from './component-markers.js';
import { directComponentHtml } from './direct-component-output.js';
import { executeDirectSsrComponentSync } from './direct-component.js';
import { renderPreparedSsrProgramString } from './render-program.js';
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
	if (contract.artifact.execution.classification === 'scheduled')
		throw new SsrScheduledComponentSignal();
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	if (receipt.enhancement) context.outputSink?.invalidateAccounting();
	const output = executeDirectSsrComponentSync(
		context,
		contract,
		serverComponentProps(receipt),
		parent,
		(content, owner, props) => {
			const html = renderOperationEnhancements(
				context,
				receipt.enhancement,
				() =>
					content.program
						? renderPreparedSsrProgramString(
								context,
								content.program,
								owner,
								(children) => operations.renderChildren(context, children, owner, true),
								(component) => operations.renderComponent(context, component, owner, true, true)
							)
						: operations.renderChildren(context, content.children, owner, true),
				owner,
				operations.renderChildren
			);
			return directComponentHtml(
				context,
				componentMarkerId(context, receipt),
				html,
				props,
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
	if (output === undefined)
		throw new TypeError('Synchronous component operation selected a scheduled server artifact');
	return output;
}
