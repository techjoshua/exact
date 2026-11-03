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

// retainDefinitionSavedGetSelection classifies only a definition's unavailable
// saved callee. Its original Get has an independently published field obligation.
// Installed alternatives and normal consumers never enter this effects-only route.
func (q *sourceValueQuery) retainDefinitionSavedGetSelection(call *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	if !q.dependenciesOnly || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil {
		return false
	}
	owner := enclosingCallableNode(call)
	callee := unwrapSourceCallableReference(call.Expression())
	if owner == nil || q.effectOwner != owner || callee == nil || !ast.IsIdentifier(callee) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(callee)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || q.owner.bindingWritten(symbol) {
		return false
	}
	declaration := symbol.ValueDeclaration
	if declaration == nil || !ast.IsVariableDeclaration(declaration) || !ast.IsIdentifier(declaration.Name()) || enclosingCallableNode(declaration) != owner || q.owner.checker.GetSymbolAtLocation(declaration.Name()) != symbol {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(call))
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	get := unwrapSourceCallableReference(declaration.Initializer())
	if get == nil || !ast.IsPropertyAccessExpression(get) && !ast.IsElementAccessExpression(get) {
		return false
	}
	read, write := accessorEvaluationMode(get)
	if !read || write || !q.sourceLocalInitializerBefore(declaration, call, owner, bindings) {
		return false
	}
	_, key := accessorReceiver(get)
	demand := q.operationFieldDemand(get, key)
	if demand.declaration != owner || demand.operation != get || demand.slot == nil || enclosingCallableNode(demand.slot) != owner {
		return false
	}
	for _, operation := range q.owner.summary(owner).nodes {
		q.recordEstimatedCost(1)
		if operation == get {
			q.retainCallSelectionFallback(call, result)
			result.valueIncomplete = true
			return true
		}
	}
	return false
}

// sourceLocalInitializerBefore orders a selected ordinary local initializer and
// a later direct statement use. This grants no completion or write authority.
func (q *sourceValueQuery) sourceLocalInitializerBefore(declaration, use, owner *ast.Node, bindings sourceValueBindings) bool {
	if !q.dependenciesOnly || declaration == nil || use == nil || owner == nil || enclosingCallableNode(declaration) != owner || enclosingCallableNode(use) != owner || ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(use) || declaration.End() > use.Pos() {
		return false
	}
	body, list := owner.Body(), declaration.Parent
	if body == nil || !ast.IsBlock(body) || list == nil || !ast.IsVariableDeclarationList(list) || list.Flags&ast.NodeFlagsUsing != 0 || list.Parent == nil || !ast.IsVariableStatement(list.Parent) || list.Parent.Parent != body {
		return false
	}
	statement := use
	for statement != nil && !ast.IsStatement(statement) {
		q.recordEstimatedCost(1)
		statement = statement.Parent
	}
	if statement == nil || statement.Parent != body || (!ast.IsReturnStatement(statement) && !ast.IsExpressionStatement(statement) && !ast.IsVariableStatement(statement)) {
		return false
	}
	possible, certain := q.reachable(declaration, bindings)
	return possible && certain
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
