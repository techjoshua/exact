package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceCallOutcome is one installed body's exact callee-selection disposition.
// It contains no query frame. Incomplete alternatives remain explicit outcomes.
type sourceCallOutcome struct {
	declaration, operation *ast.Node
	complete               bool
	use, consumer          *ast.Node
	phase                  sourceCallPhase
	dependencies           bool
}
type sourceCallPhase uint8

const (
	sourceReturnRelationship   sourceCallPhase = 1
	sourceArgumentRelationship sourceCallPhase = 2
	sourceDefaultEvaluation    sourceCallPhase = 3
)

// retainCallSelectionFallback records only unavailable callee implementation.
// Independent acquisition effects stay on their existing origins and opacity.
// The exact installed Call outcome, never target identity, can cover this cause.
func (query *sourceValueQuery) retainCallSelectionFallback(operation *ast.Node, result *accessorCandidates) {
	if operation == nil || !ast.IsCallExpression(operation) {
		result.opaque = true
		return
	}
	if !query.charge(result, operation) {
		return
	}
	declaration := enclosingCallableNode(operation)
	if declaration == nil {
		result.opaque = true
		return
	}
	result.callFallbacks = append(result.callFallbacks, sourceCallOutcome{declaration: declaration, operation: operation, use: query.effectUse(), consumer: query.effectOwner})
}

// callFallbackFulfilled projects only this edge's actual complete call outcome.
// A target-wide summary, an empty inventory or another call cannot cover it.
func callFallbackFulfilled(caller, target *callableFacts, edge CallEdge, source EnvironmentEffectSource) bool {
	origin := source.callOrigin
	if origin == nil || source.callForwarded || origin.declaration != target.node || !edge.Resolved || edge.TargetID != target.summary.ID {
		return false
	}
	unique := 0
	for _, candidate := range caller.summary.Calls {
		if candidate.ID == edge.ID {
			unique++
		}
	}
	operation := caller.fieldEdgeOperations[edge.ID]
	if unique != 1 || operation == nil {
		return false
	}
	sourceSummary := false
	for _, call := range caller.fieldCalls {
		if call.dependencies && call.operation == operation && call.target == target.node {
			for _, outcome := range call.calls {
				sourceSummary = sourceSummary || sameCallObligation(outcome, *origin)
			}
		}
	}
	matched := false
	for _, call := range caller.fieldCalls {
		if sourceSummary && (!call.dependencies || call.target != target.node) {
			continue
		}
		if call.operation != operation {
			continue
		}
		if call.target != target.node || !call.complete {
			return false
		}
		covered := false
		for _, outcome := range call.calls {
			if sameCallObligation(outcome, *origin) {
				if !outcome.complete {
					return false
				}
				covered = true
			}
		}
		if !covered {
			return false
		}
		matched = true
	}
	return matched
}

// callSourceIdentity keeps occurrence provenance distinct until display projection.
func callSourceIdentity(source EnvironmentEffectSource) string {
	if source.callOrigin == nil {
		return ""
	}
	origin := source.callOrigin
	key := fmt.Sprintf(":call:%s:%d:%d:%p:%p:%d", ast.GetSourceFileOfNode(origin.operation).FileName(), sourceObligationDeclarationPos(origin.declaration), origin.operation.Pos(), origin.use, origin.consumer, origin.phase)
	if source.callForwarded {
		key += ":forwarded"
	}
	return key
}
