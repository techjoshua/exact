import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { renderChildrenAsync } from './async-children.js';
import { componentMarkerId } from './component-markers.js';
import { directComponentHtml } from './direct-component-output.js';
import type { DirectSsrComponentPublisher } from './direct-component-contracts.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { renderServerComponentArtifactOutput } from './server-component-abi-execution.js';

type ComponentPublication = Readonly<{
	componentId: string;
	documentProbe: boolean;
	hasComponentAncestor: boolean;
	omitCompilerOwnedBoundary?: boolean;
	omitRootBoundary?: boolean;
}>;

const publishComponent: DirectSsrComponentPublisher<ComponentPublication> = (
	context,
	component,
	_parent,
	html,
	props,
	snapshot,
	publication
) =>
	directComponentHtml(
		context,
		publication.componentId,
		html,
		props,
		snapshot.contract.artifact.execution.publication,
		false,
		publication.documentProbe,
		publication.hasComponentAncestor,
		publication.omitCompilerOwnedBoundary,
		publication.omitRootBoundary
	);

/** Renders one opaque component operation through its server artifact. */
export async function renderComponentReferenceAsync(
	context: SsrContext,
	component: ExactComponentReceiptData,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	hasComponentAncestor: boolean,
	omitCompilerOwnedBoundary = false,
	omitRootBoundary = false
): Promise<string> {
	const output = await renderServerComponentArtifactOutput(
		context,
		component,
		parent,
		options,
		(children, owner) => renderChildrenAsync(context, children, owner, options, true),
		(child, owner) => renderComponentReferenceAsync(context, child, owner, options, true, true),
		publishComponent,
		{
			componentId: componentMarkerId(context, component),
			documentProbe: context.documentProbe && context.hostStack.length === 0,
			hasComponentAncestor,
			omitCompilerOwnedBoundary,
			omitRootBoundary
		}
	);
	if (output === undefined)
		throw new TypeError('Native component operation selected a non-direct server artifact');
	return output;
}
