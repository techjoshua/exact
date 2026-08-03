import type { SsrContext } from '../types.js';
import { SsrTreeDepthError, SsrTreeNodeError } from './limits.js';

/** Applies an independent planning bound without consuming the renderer's public traversal budget. */
export function chargeEnhancementPlanning(
	context: SsrContext,
	depth: number,
	budget: { nodes: number }
): void {
	if (depth > context.maxTreeDepth) throw new SsrTreeDepthError(context.maxTreeDepth);
	if (++budget.nodes > context.maxTreeNodes) throw new SsrTreeNodeError(context.maxTreeNodes);
}
