import type { NodeRef } from '@exactjs/expressions';
import type { CallableAnalysisState } from '../analysis/callable-state.js';
import { externalKey } from '../analysis/effect-sources.js';
import { isSafeDerivedInitializer } from './reevaluation-safety.js';

/**
 * Projects source-level reevaluation safety onto portable callable summaries.
 *
 * Local helper bodies are inspected directly. Imported calls consume the prior
 * immutable manifest generation, allowing artifact compilation's existing
 * fixed point to carry the contract across files without trusting opaque
 * package calls.
 */
export function applyCallableReevaluationSafety(state: CallableAnalysisState): void {
	const safeImportedCalls = new Set<string>();
	for (const summary of state.mutable)
		for (const edge of summary.calls) {
			if (!edge.moduleSpecifier || !edge.exportName) continue;
			const target = state.external.get(externalKey(edge.moduleSpecifier, edge.exportName));
			const callNodeId = state.callNodeIds.get(edge.id);
			if (target?.reevaluationSafe && callNodeId) safeImportedCalls.add(callNodeId);
		}

	for (const fn of state.functions) {
		const summary = state.callableByNode.get(fn.node.id);
		// Only exported ordinary functions can supply this contract to another
		// module. Components and tasks have their own invocation semantics, while
		// unexported helpers are inspected directly at their local call sites.
		if (!summary || summary.kind !== 'function' || !summary.exportNames.length) continue;
		summary.reevaluationSafe = isSafeDerivedInitializer(
			state.module,
			fn,
			new Set(),
			(call: NodeRef) => safeImportedCalls.has(call.node.id)
		);
	}
}
