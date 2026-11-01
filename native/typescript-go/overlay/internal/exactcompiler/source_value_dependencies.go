package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceInvocationDependencies instantiates AST-backed demands at their use point.
// Bindings and creator contexts are query-local. This path publishes dependencies,
// never normal values, storage deltas or permission to enter a precise operation.
func sourceInvocationDependencies(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node) accessorCandidates {
	query := newSourceDependencyQuery(node, c, owner, consumer)
	return query.invocation(node, nil)
}

// newSourceDependencyQuery owns an uncached source relationship traversal.
func newSourceDependencyQuery(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node) *sourceValueQuery {
	values := newSourceValueOwner(c)
	if owner != nil && owner.values != nil {
		// Share only checker-owned AST templates and static write indexes. No
		// initializer history, instantiated input or current-read result is reused.
		prior := owner.values
		values.program, values.generation = prior.program, prior.generation
		values.language, values.components = prior.language, prior.components
		values.indexes, values.summaries = prior.indexes, prior.summaries
	}
	return &sourceValueQuery{owner: values, executable: owner, effectOwner: consumer, reading: node, dependenciesOnly: true, remaining: 4096, active: make(map[*ast.Node]bool)}
}

// sourceMemberDependencies analyzes the original member operation independently
// of optional acquired-value refinement. Unknown receiver effects remain explicit.
func sourceMemberDependencies(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, bindings sourceValueBindings) accessorCandidates {
	query := newSourceDependencyQuery(node, c, owner, consumer)
	return query.evaluatedSourceAccessors(node, bindings)
}

// refineSourceDependencies retains an accounted precise refinement when available.
// An unavailable exact value is not an extra effect. Normal output receipts remain
// available to their dedicated consumers even when source demands own effects.
func refineSourceDependencies(precise accessorCandidates, summary func() accessorCandidates) accessorCandidates {
	accounted := !precise.opaque && !precise.receiverIncomplete && !precise.fieldReceiverIncomplete
	coveredDemand := false
	for _, call := range precise.fieldCalls {
		accounted = accounted && call.complete
		coveredDemand = coveredDemand || len(call.outcomes) > 0 || len(call.calls) > 0
		for _, outcome := range call.outcomes {
			accounted = accounted && outcome.fulfilled
		}
		for _, outcome := range call.calls {
			accounted = accounted && outcome.complete
		}
	}
	if accounted && (!precise.valueIncomplete || coveredDemand) {
		return precise
	}
	result := summary()
	result.normalCalls = precise.normalCalls
	result.nativeCalls = precise.nativeCalls
	return result
}
