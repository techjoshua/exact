import type { AnyComponentInstance } from '@exactjs/core';
import { executeDirectSsrComponent } from './direct-component.js';
import { renderDirectSsrContent } from './direct-component-content.js';
import type { RenderValue } from './execution.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import type { ServerArtifactExecution } from './server-artifact-context.js';
import type { ServerComponentReference } from './server-component-reference.js';
import { consumeScalarPropsProof } from './scalar-props-proof.js';

/** Publishes a synchronous artifact directly, retaining continuations only for actual suspension. */
export function executeSynchronousArtifact<Publication>(
	execution: ServerArtifactExecution<Publication>,
	contract: import('@exactjs/core/framework/component-contracts').ExactServerExecutableComponentContract,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	props: Record<string, unknown>
): RenderValue<string> {
	const output = executeDirectSsrComponent(
		execution.context,
		contract,
		props,
		parent,
		execution.options,
		(content, owner, preparedProps, snapshot) => {
			let html: RenderValue<string>;
			try {
				html = reference.enhancement
					? renderOperationEnhancements(
							execution.context,
							reference.enhancement,
							() => renderDirectSsrContent(execution, content, owner),
							owner,
							execution.options,
							(_context, children, childParent) => execution.renderChildren(children, childParent)
						)
					: renderDirectSsrContent(execution, content, owner);
			} catch (error) {
				// Preserve the enhancement wrapper's rejected-render behavior for lifetime cleanup.
				return Promise.reject(error);
			}
			if (html instanceof Promise)
				return html.then((value) =>
					execution.publish(
						execution.context,
						reference,
						parent,
						value,
						preparedProps,
						snapshot,
						execution.publication
					)
				);
			return execution.publish(
				execution.context,
				reference,
				parent,
				html,
				preparedProps,
				snapshot,
				execution.publication
			);
		},
		consumeScalarPropsProof(reference, props)
	);
	return output instanceof Promise
		? output.then(requireSynchronousArtifactOutput)
		: requireSynchronousArtifactOutput(output);
}

/** Rejects missing artifact output without capturing a callback for each completed component. */
function requireSynchronousArtifactOutput(value: string | undefined): string {
	if (value === undefined)
		throw new TypeError('Synchronous server artifact did not execute its request-owned sink');
	return value;
}
