import { consumeSuppliedPlacement } from './supplied-placement.js';
import { deriveRuntimeConfiguration } from '@exactjs/core/framework/configuration';
import { prepareComponentProps } from './component-props.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import { renderChildren } from './children.js';
import type { DirectSsrComponentPublisher } from './direct-component-contracts.js';
import { directComponentHtml, type ComponentPublication } from './direct-component-output.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { withRenderCleanup, mapRenderValue, type RenderValue } from './execution.js';
import { renderServerComponentArtifactOutput } from './server-component-abi-execution.js';
import { captureSsrProgramOutput } from './program-capture.js';
import type { ServerArtifactExecution } from './server-artifact-context.js';
import {
	receiptExecutionContract,
	readServerComponentReference,
	prepareServerComponentOccurrence,
	type ServerComponentReference
} from './server-component-reference.js';
import { createSsrResumptionCapture } from '../resumption.js';
import { renderPreparedResumableComponentBoundary } from './resumption-boundary-capability.js';
import { formatMarkerId } from '../markers.js';
import { prepareResumptionChildren } from './resumption-children.js';
import {
	canPublishIndependentResumption,
	ownsClientResumption
} from './component-publication-policy.js';

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
	component: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	hasComponentAncestor: boolean,
	omitCompilerOwnedBoundary = false,
	omitRootBoundary = false
): RenderValue<string> {
	if (!component.occurrenceClaimed) {
		const prepared = prepareServerComponentOccurrence(context, component);
		return mapRenderValue(prepared, (reference) =>
			renderComponentReference(
				context,
				reference,
				parent,
				options,
				hasComponentAncestor,
				omitCompilerOwnedBoundary,
				omitRootBoundary
			)
		);
	}
	const parentFrame = context.componentInputFrame;
	context.componentInputFrame = undefined;
	return withRenderCleanup(
		() =>
			renderClaimedComponentReference(
				context,
				component,
				parent,
				options,
				hasComponentAncestor,
				omitCompilerOwnedBoundary,
				omitRootBoundary
			),
		() => {
			context.componentInputFrame = parentFrame;
		}
	);
}

/** Descendant output cannot consume a future sibling from its parent's prepared sequence. */
function renderClaimedComponentReference(
	context: SsrContext,
	component: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	hasComponentAncestor: boolean,
	omitCompilerOwnedBoundary: boolean,
	omitRootBoundary: boolean
): RenderValue<string> {
	const rendererEnhancement =
		context.enhancementProviderReferences?.has(component.source) === true ||
		component.fragmentTarget !== undefined;
	if (options.documentShellScope?.claim(component)) {
		// A client-capable application adopts its whole subtree within the shell.
		// A server-only page cannot adopt children and must still publish its islands.
		const { placement } = receiptExecutionContract(component);
		options = deriveRuntimeConfiguration(options.documentShellScope.applicationOptions, () => ({
			clientResumptionOwner: placement === 'client' || placement === 'isomorphic'
		}));
		hasComponentAncestor = false;
		omitRootBoundary = true;
		omitCompilerOwnedBoundary = true;
	}
	if (options.clientResumptionOwner === undefined && !rendererEnhancement) {
		// A JSX helper or prepared target can reach the first component through a
		// structural ancestor. Establish ownership from that component's contract,
		// then retain the decision throughout its descendants, including plain SSR.
		// Server roots publish islands because they cannot adopt a client subtree.
		options = deriveRuntimeConfiguration(options, () => ({
			clientResumptionOwner: ownsClientResumption(receiptExecutionContract(component))
		}));
	}
	const publication =
		component.contract.artifact.target === 'server'
			? component.contract.artifact.execution.publication
			: undefined;
	const canPublishResumption = canPublishIndependentResumption(
		hasComponentAncestor,
		options.clientResumptionOwner,
		rendererEnhancement
	);
	const independentResumption =
		canPublishResumption && publication?.kind === 'resumption' ? publication : undefined;
	if (!component.enhancement && independentResumption) {
		return renderResumableIsland(context, component, parent, options, independentResumption.name);
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
			(!options.resumptionCapture && independentResumption !== undefined))
	)
		return renderCapturedComponentReference(
			context,
			component,
			parent,
			options,
			hasComponentAncestor,
			omitCompilerOwnedBoundary,
			omitRootBoundary
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
			canPublishResumption,
			componentName: component.contract.artifact.id,
			componentKey: component.key,
			componentOrdinal: context.nextId++,
			documentProbe: context.documentProbe && context.hostStack.length === 0,
			omitCompilerOwnedBoundary,
			omitRootBoundary
		}
	);
	return output instanceof Promise
		? output.then(requireNativeComponentOutput)
		: requireNativeComponentOutput(output);
}

/** Captures an island's activation sequence separately from its server-only parent. */
function renderResumableIsland(
	context: SsrContext,
	component: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	name: string
): RenderValue<string> {
	const id = formatMarkerId(
		'component',
		context.nextId++,
		component.contract.artifact.id,
		component.key
	);
	const capture = createSsrResumptionCapture(
		deriveRuntimeConfiguration(options, () => ({ clientResumptionOwner: true }))
	);
	const prepared = prepareResumptionChildren(component, id, context);
	// The island owns its complete activation sequence. Keep it out of the page's ordered
	// capture so lazy siblings may settle in either order without sharing a cursor.
	return captureSsrProgramOutput(context, () =>
		mapRenderValue(
			renderComponentReference(context, prepared.component, parent, capture.options, true, true),
			(html) =>
				mapRenderValue(prepareComponentProps(prepared.props, undefined, capture.options), (props) =>
					renderPreparedResumableComponentBoundary(
						context,
						id,
						name,
						html,
						props,
						capture.serializedRecords()
					)
				)
		)
	);
}

/** Keeps capture callbacks off component traversal that writes directly to its request sink. */
function renderCapturedComponentReference(
	context: SsrContext,
	component: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	hasComponentAncestor: boolean,
	omitCompilerOwnedBoundary: boolean,
	omitRootBoundary: boolean
): RenderValue<string> {
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
}

/** Rejects missing direct output without a per-component completion closure. */
function requireNativeComponentOutput(value: string | undefined): string {
	if (value === undefined)
		throw new TypeError('Native component operation selected a non-direct server artifact');
	return value;
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
	return renderComponentReference(
		this.context,
		child,
		owner,
		consumeSuppliedPlacement(this.options, child.source),
		true,
		true
	);
}

/** Serializes an existing writer position, consuming only its explicitly carried occurrence. */
export function renderProgramComponentSegment(
	context: SsrContext,
	segment: unknown,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	hasComponentAncestor: boolean,
	occurrence?: ServerComponentReference
): RenderValue<string> {
	if (occurrence)
		return renderComponentReference(
			context,
			occurrence,
			parent,
			consumeSuppliedPlacement(options, occurrence.source),
			hasComponentAncestor,
			true
		);
	if (Array.isArray(segment))
		return renderChildren(context, segment, parent, options, hasComponentAncestor);
	const component = readServerComponentReference(segment)!;
	return mapRenderValue(prepareServerComponentOccurrence(context, component, false), (reference) =>
		renderComponentReference(
			context,
			reference,
			parent,
			consumeSuppliedPlacement(options, reference.source),
			hasComponentAncestor,
			true
		)
	);
}
