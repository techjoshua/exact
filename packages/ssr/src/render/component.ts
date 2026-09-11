import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { renderChildren } from './children.js';
import type { DirectSsrComponentPublisher } from './direct-component-contracts.js';
import { directComponentHtml, type ComponentPublication } from './direct-component-output.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { mapRenderValue, type RenderValue } from './execution.js';
import { renderServerComponentArtifactOutput } from './server-component-abi-execution.js';
import { captureSsrProgramOutput } from './program-capture.js';
import type { ServerArtifactExecution } from './server-artifact-context.js';
import type { ServerComponentReference } from './server-component-reference.js';

const publishComponent: DirectSsrComponentPublisher<ComponentPublication> = (
	context,
	_component,
	_parent,
	html,
	props,
	snapshot,
	publication
) =>
	directComponentHtml(
		context,
		html,
		props,
		snapshot.contract.artifact.execution.publication,
		publication
	);

/** Renders one opaque component operation through its server artifact. */
export function renderComponentReference(
	context: SsrContext,
	component: ExactComponentReceiptData,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	hasComponentAncestor: boolean,
	omitCompilerOwnedBoundary = false,
	omitRootBoundary = false
): RenderValue<string> {
	if (options.documentShellScope?.claim(component)) {
		options = options.documentShellScope.applicationOptions;
		hasComponentAncestor = false;
		omitRootBoundary = true;
		omitCompilerOwnedBoundary = true;
	}
	if (
		context.writerSink &&
		component.contract.artifact.target === 'server' &&
		!(
			component.contract.artifact.execution.streamingDocument &&
			!component.enhancement &&
			context.documentProbe &&
			context.hostStack.length === 0
		) &&
		(component.contract.artifact.execution.classification !== 'synchronous' ||
			(context.markers && !omitRootBoundary && !omitCompilerOwnedBoundary) ||
			(!options.resumptionCapture &&
				hasComponentAncestor &&
				component.contract.artifact.execution.publication?.kind === 'resumption'))
	)
		return captureSsrProgramOutput(context, () =>
			renderComponentReference(
				context,
				component,
				parent,
				options,
				hasComponentAncestor,
				omitCompilerOwnedBoundary,
				omitRootBoundary
			)
		);
	const output = renderServerComponentArtifactOutput(
		context,
		component,
		parent,
		options,
		renderArtifactChildren,
		renderArtifactComponent,
		publishComponent,
		{
			// Preserve the original registry identity before selection and reserve its
			// position before descendants, even when no marker will be published.
			capturesResumptions: options.resumptionCapture !== undefined,
			componentName: component.contract.artifact.id,
			componentKey: component.key,
			componentOrdinal: context.nextId++,
			documentProbe: context.documentProbe && context.hostStack.length === 0,
			hasComponentAncestor,
			omitCompilerOwnedBoundary,
			omitRootBoundary
		}
	);
	return mapRenderValue(output, (value) => {
		if (value === undefined)
			throw new TypeError('Native component operation selected a non-direct server artifact');
		return value;
	});
}

/** Shared forwarding reads the request from its execution instead of capturing it per component. */
function renderArtifactChildren(
	this: ServerArtifactExecution<ComponentPublication>,
	children: readonly Child[],
	owner: AnyComponentInstance | undefined
): RenderValue<string> {
	return renderChildren(this.context, children, owner, this.options, true);
}

/** Descendants retain their own execution and normal compiler-owned publication boundary. */
function renderArtifactComponent(
	this: ServerArtifactExecution<ComponentPublication>,
	child: ServerComponentReference,
	owner: AnyComponentInstance | undefined
): RenderValue<string> {
	return renderComponentReference(this.context, child, owner, this.options, true, true);
}
