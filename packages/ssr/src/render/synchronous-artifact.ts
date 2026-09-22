import type { AnyComponentInstance } from '@exactjs/core';
import { executeDirectSsrComponent } from './direct-component.js';
import { renderComponentEnhancementBindings } from './component-enhancement-bindings.js';
import { renderDirectSsrContent } from './direct-component-content.js';
import type { RenderValue } from './execution.js';
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
				// Incoming enhancement bindings are a runtime fact, including for separately
				// compiled receivers. Plain output needs no target-selection machinery.
				html =
					!reference.enhancement &&
					!execution.context.boundEnhancementTargets?.has(reference) &&
					!contract.artifact.capabilities.includes('targets')
						? renderDirectSsrContent(execution, content, owner)
						: renderComponentEnhancementBindings(execution, reference, content, owner);
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
