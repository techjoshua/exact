import { normalizeRenderResult, type AnyComponentInstance, type Child } from '@exactjs/core';
import {
	readPreparedServerRenderProgram,
	type ExactPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import type { SsrContext } from '../types.js';
import { renderPreparedSsrProgram } from './render-program.js';
import type { ServerComponentReference } from './server-component-reference.js';
import { captureNestedEnhancementPrefix } from './operation-enhancements.js';

/** Compiler-closed result before its deferred child/component segments are serialized. */
export type DirectSsrComponentContent =
	| Readonly<{ children: Child[]; program?: never }>
	| Readonly<{ children?: never; program: ExactPreparedServerRenderProgram }>;

/** Classifies raw component output before generic child normalization loses its server ABI. */
export function readDirectSsrContent(value: unknown): DirectSsrComponentContent {
	const program = readPreparedServerRenderProgram(value);
	return program ? { program } : { children: normalizeRenderResult(value as Child | Child[]) };
}

/** Serializes direct component content through caller-owned recursive rendering operations. */
export async function renderDirectSsrContent(
	context: SsrContext,
	content: DirectSsrComponentContent,
	parent: AnyComponentInstance | undefined,
	renderChildren: (
		children: readonly Child[],
		parent: AnyComponentInstance | undefined
	) => Promise<string>,
	renderOwnedComponent: (
		component: ServerComponentReference,
		parent: AnyComponentInstance | undefined
	) => Promise<string>
): Promise<string> {
	if (content.children) return renderChildren(content.children, parent);
	const planned = renderPreparedSsrProgram(context, content.program, parent);
	const output: string[] = [];
	for (const segment of planned.segments) {
		const rendered =
			typeof segment === 'string'
				? segment
				: Array.isArray(segment)
					? await renderChildren(segment, parent)
					: await renderOwnedComponent(segment as ServerComponentReference, parent);
		captureNestedEnhancementPrefix(context, output);
		if (rendered !== '') output.push(rendered);
	}
	return output.join('');
}
