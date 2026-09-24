import type { Child } from '@exactjs/core';
import {
	readCompiledIntrinsicReceipt,
	readCompiledFragmentReceipt,
	readDoctype
} from '@exactjs/core/runtime/component-operations';
import type { SsrContext } from '../types.js';
import { renderChildren } from './children.js';
import { executeDirectSsrComponent } from './direct-component.js';
import { directComponentHtml, type ComponentPublication } from './direct-component-output.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { mapRenderValue, withRenderCleanup, type RenderValue } from './execution.js';
import { countSsrNode, enterSsrTreeDepth, leaveSsrTreeDepth } from './limits.js';
import { SsrOperationTarget } from './operation-target.js';
import { captureSsrProgramOutput } from './program-capture.js';
import { consumeScalarPropsProof } from './scalar-props-proof.js';
import {
	readServerComponentReference,
	ownsClientResumption,
	receiptExecutionContract,
	serverComponentProps
} from './server-component-reference.js';

/**
 * Issues a progressive root or explicit server shell before choosing document output or local capture.
 * Component preparation, descendant traversal, resumption, and disposal use the shared executor.
 * Scheduled, selected, and enhanced roots retain their existing publication boundary.
 */
export function renderDocumentRootOutput(
	context: SsrContext,
	operation: Child,
	options: SsrRenderOptions
): RenderValue<string> {
	const reference = readServerComponentReference(operation);
	if (!reference) return renderChildren(context, [operation], undefined, options);
	const contract = receiptExecutionContract(reference);
	if (options.resumptionCapture)
		options = {
			...options,
			clientResumptionOwner: ownsClientResumption(contract)
		};
	if (
		reference.enhancement ||
		contract.artifact.selection ||
		contract.artifact.execution.classification !== 'synchronous'
	)
		return renderChildren(context, [operation], undefined, options);
	countSsrNode(context);
	enterSsrTreeDepth(context);
	context.enhancementOperationComponentDepth =
		(context.enhancementOperationComponentDepth ?? 0) + 1;
	return withRenderCleanup(
		() => {
			const props = serverComponentProps(reference);
			const publication: ComponentPublication = {
				capturesResumptions: options.resumptionCapture !== undefined,
				componentName: contract.artifact.id,
				componentKey: reference.key,
				componentOrdinal: context.nextId++,
				documentProbe: true,
				hasComponentAncestor: false
			};
			const output = executeDirectSsrComponent(
				context,
				contract,
				props,
				undefined,
				options,
				(content, owner, preparedProps, snapshot) => {
					const target = new SsrOperationTarget(context, owner, options, true, renderChildren);
					const render = () =>
						content.program
							? target.renderPreparedServerProgram(content.program)
							: renderChildren(context, content.children, owner, options, true);
					const html =
						content.program?.program.ssrHost === 'html' ||
						(content.children?.length === 1 &&
							(readCompiledIntrinsicReceipt(content.children[0])?.tag === 'html' ||
								readCompiledFragmentReceipt(content.children[0])?.children.some(readDoctype)))
							? render()
							: captureSsrProgramOutput(context, render);
					return mapRenderValue(html, (value) =>
						directComponentHtml(
							context,
							value,
							preparedProps,
							snapshot.contract.artifact.execution.publication,
							publication
						)
					);
				},
				consumeScalarPropsProof(reference, props)
			);
			return mapRenderValue(output, (value) => {
				if (value === undefined)
					throw new TypeError('Document root selected a non-direct server artifact');
				return value;
			});
		},
		() => {
			context.enhancementOperationComponentDepth!--;
			leaveSsrTreeDepth(context);
		}
	);
}
