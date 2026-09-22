import {
	normalizeRenderResult,
	type AnyComponentInstance,
	type Child,
	type EnhancementEntry
} from '@exactjs/core';
import {
	readPreparedServerRenderProgram,
	type ExactPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import type { RenderValue } from './execution.js';
import { renderBoundProgram } from './bound-program-output.js';
import type { ServerArtifactExecution } from './server-artifact-context.js';

/** Compiler-closed result before its program or ordinary children execute through the shared sink. */
export type DirectSsrComponentContent =
	| Readonly<{ children: Child[]; program?: never }>
	| Readonly<{ children?: never; program: ExactPreparedServerRenderProgram }>;

/** Classifies raw component output before generic child normalization loses its server ABI. */
export function readDirectSsrContent(value: unknown): DirectSsrComponentContent {
	const program = readPreparedServerRenderProgram(value);
	return program ? { program } : { children: normalizeRenderResult(value as Child | Child[]) };
}

/**
 * Binds the selected owner to this component's execution before traversing its content.
 * Descendants own separate executions. Scheduled retries await prior output and retain the same
 * owner, so suspended programs never observe another component's owner through this target.
 * Selected entries bypass routing tables only for an unprojected, compiler-closed intrinsic root.
 */
export function renderDirectSsrContent<Publication>(
	execution: ServerArtifactExecution<Publication>,
	content: DirectSsrComponentContent,
	owner: AnyComponentInstance | undefined,
	selectedEntries?: readonly EnhancementEntry[]
): RenderValue<string> {
	execution.renderOwner = owner;
	if (execution.prepareOutput) content = execution.prepareOutput(content, owner);
	if (content.children) return execution.renderChildren(content.children, owner);
	return renderBoundProgram(
		execution.context,
		content.program,
		execution,
		owner,
		execution.options,
		(_context, children, parent) => execution.renderChildren(children, parent),
		selectedEntries
	);
}
