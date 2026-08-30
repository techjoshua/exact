import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { componentMarkerId } from './component-markers.js';
import { directComponentHtml } from './direct-component-output.js';
import { disposeDirectSsrLifetimeSync, renderDirectSsrComponent } from './direct-component.js';
import { disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { renderPreparedSsrProgramString } from './render-program.js';
import { receiptExecutionBlueprint, serverComponentProps } from './server-component-reference.js';
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
	const blueprint = receiptExecutionBlueprint(receipt);
	if (blueprint.contract.artifact.execution.classification === 'scheduled')
		throw new SsrScheduledComponentSignal();
	const direct = renderDirectSsrComponent(
		context,
		blueprint,
		serverComponentProps(receipt),
		parent
	);
	if (!direct)
		throw new TypeError('Synchronous component operation selected a scheduled server artifact');
	const checkpoint = context.onComponentAttemptCheckpoint?.();
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let primary: unknown = noPrimaryFailure;
	try {
		context.onDirectComponentCreated?.(direct.snapshot);
		const html = renderOperationEnhancements(
			context,
			receipt.enhancement,
			() =>
				direct.content.program
					? renderPreparedSsrProgramString(
							context,
							direct.content.program,
							direct.owner,
							(children) => operations.renderChildren(context, children, direct.owner, true),
							(component) =>
								operations.renderComponent(context, component, direct.owner, true, true)
						)
					: operations.renderChildren(context, direct.content.children, direct.owner, true),
			direct.owner,
			operations.renderChildren
		);
		const output = directComponentHtml(
			context,
			componentMarkerId(context, receipt),
			html,
			direct.props,
			blueprint.contract.artifact.execution.publication,
			{
				enhancement: false,
				documentProbe,
				hasComponentAncestor,
				omitCompilerOwnedBoundary,
				omitRootBoundary
			}
		);
		context.onDirectComponentRendered?.(direct.snapshot);
		return output;
	} catch (error) {
		primary = error;
		context.onComponentAttemptRollback?.(checkpoint);
		throw error;
	} finally {
		if (direct.lifetime)
			disposePreservingPrimary(
				() => disposeDirectSsrLifetimeSync(direct.lifetime!, 'ssr render complete'),
				primary
			);
	}
}
