import { normalizeRenderResult, type AnyComponentInstance, type Child } from '@exactjs/core';
import {
	readPreparedServerRenderProgram,
	type ExactPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import type { RenderValue } from './execution.js';
import { renderPreparedSsrProgram } from './render-program.js';
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
 */
export function renderDirectSsrContent<Publication>(
	execution: ServerArtifactExecution<Publication>,
	content: DirectSsrComponentContent,
	owner: AnyComponentInstance | undefined
): RenderValue<string> {
	execution.renderOwner = owner;
	if (content.children) return execution.renderChildren(content.children, owner);
	return renderPreparedSsrProgram(execution.context, content.program, execution);
}
