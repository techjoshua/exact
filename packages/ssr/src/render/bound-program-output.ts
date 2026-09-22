import type { AnyComponentInstance, Child, EnhancementEntry } from '@exactjs/core';
import type { ExactPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import type { SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { RenderValue } from './execution.js';
import {
	boundOperationEnhancement,
	combineBoundEnhancementEntries
} from './bound-enhancement-targets.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import { renderPreparedSsrProgram } from './render-program.js';

/** Applies an already selected namespace binding around a compiler-closed intrinsic program. */
export function renderBoundProgram(
	context: SsrContext,
	program: ExactPreparedServerRenderProgram,
	target: Parameters<typeof renderPreparedSsrProgram>[2],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: (
		context: SsrContext,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined,
		options: SsrRenderOptions,
		ancestor?: boolean
	) => RenderValue<string>,
	selectedEntries?: readonly EnhancementEntry[]
): RenderValue<string> {
	const enhancement = selectedEntries
		? combineBoundEnhancementEntries(selectedEntries, program.enhancement)
		: boundOperationEnhancement(context, program, program.enhancement);
	if (!enhancement) return renderPreparedSsrProgram(context, program, target);
	return renderOperationEnhancements(
		context,
		enhancement,
		() => renderPreparedSsrProgram(context, program, target),
		parent,
		options,
		renderChildren
	);
}
