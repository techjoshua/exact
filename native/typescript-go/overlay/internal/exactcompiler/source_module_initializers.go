package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceModuleInitializer is a use of an already consumed raw Call result, not
// an invocation-local completed slot. Its view owns the construction lifetime.
// No reference-inspection capability or caller operation map is transferred.
type sourceModuleInitializer struct {
	binding *ast.Node
	frame   *sourceValueInputs
	receipt *sourceInvocationResult
}

// moduleInitializerBinding selects a supported producer occurrence. Syntax only
// locates the actual consumer's binding. It cannot publish or acquire a value.
func (query *sourceValueQuery) moduleInitializerBinding(call *ast.Node, result *accessorCandidates) *ast.Node {
	outer := query.envelopeOuterExpression(call, result)
	if outer == nil || outer.Parent == nil || !ast.IsVariableDeclaration(outer.Parent) {
		return nil
	}
	binding := outer.Parent
	demand, dependent := describeNormalOperand(binding)
	if !dependent || demand.value != call || demand.binding == nil || binding.Parent == nil || binding.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(binding) != nil {
		return nil
	}
	symbol := query.owner.checker.GetSymbolAtLocation(demand.binding)
	if symbol == nil || symbol.ValueDeclaration != binding || query.owner.bindingWritten(symbol) {
		return nil
	}
	// Module enrollment is not a child-operation schedule. Until a prerequisite
	// has a retained producer domain, this direct transfer cannot publish it.
	supported := true
	walkCallableNormal(call, func(node *ast.Node) bool {
		if !query.charge(result, node) {
			supported = false
			return false
		}
		if node != call && (ast.IsCallExpression(node) || ast.IsNewExpression(node) || ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) || ast.IsAwaitExpression(node) || ast.IsSpreadElement(node) || ast.IsAssignmentExpression(node, false)) {
			supported = false
			return false
		}
		return true
	}, nil)
	if !supported {
		return nil
	}
	return binding
}

func (query *sourceValueQuery) publishModuleInitializer(view *sourcePropertyReferenceView, source *ast.SourceFile, call *ast.Node, acquired accessorCandidates, obligations *accessorCandidates) {
	if query.propertyView() != view || view == nil || query.inputs == nil || query.inputs.declaration != source.AsNode() || query.operation == nil || query.operation.node != call || query.operation.inputs != query.inputs || ast.GetSourceFileOfNode(call) != source {
		return
	}
	binding := query.moduleInitializerBinding(call, obligations)
	if binding == nil {
		return
	}
	for _, receipt := range acquired.normalCalls {
		if !query.charge(obligations, call) {
			return
		}
		if receipt == nil || receipt.operation != call || receipt.owner != nil || receipt.frame != query.inputs || receipt.async || receipt.construction || receipt.declaration == nil {
			continue
		}
		view.initializers = append(view.initializers, sourceModuleInitializer{binding: binding, frame: query.inputs, receipt: receipt})
	}
}

// moduleInitializerValues reads only facts published in this live construction.
// Original observations stay paired. Effect obligations remain at the producer.
func (query *sourceValueQuery) moduleInitializerValues(symbol *ast.Symbol, use *ast.Node, result *accessorCandidates) ([]sourceValue, bool) {
	return query.moduleInitializerValuesAt(query.propertyView(), symbol, use, result)
}

// moduleInitializerValuesAt reads an explicit validated construction without
// installing it as the original value's inputs or lending any of its bindings.
func (query *sourceValueQuery) moduleInitializerValuesAt(view *sourcePropertyReferenceView, symbol *ast.Symbol, use *ast.Node, result *accessorCandidates) ([]sourceValue, bool) {
	if view == nil || view.owner != query.owner || view.program != query.owner.program || view.checker != query.owner.checker || view.generation != query.owner.generation || view.executable != query.executable || view.state == sourcePropertyDisposed || view.frame == nil || view.frame.properties != view || view.root != view.frame.declaration || symbol == nil || use == nil || symbol.ValueDeclaration == nil || query.owner.bindingWritten(symbol) {
		return nil, false
	}
	selected := sourceCallableReferenceSymbol(use, query.owner.checker)
	if selected != nil && selected.Flags&ast.SymbolFlagsAlias != 0 {
		selected = query.sourceAlias(selected, result)
	}
	if selected == nil || selected.ValueDeclaration != symbol.ValueDeclaration {
		return nil, false
	}
	var values []sourceValue
	admitted := false
	for _, fact := range view.initializers {
		if !query.charge(result, use) {
			return values, admitted
		}
		if fact.binding != symbol.ValueDeclaration {
			continue
		}
		r := fact.receipt
		if fact.frame == nil || fact.frame.properties != view || fact.frame.declaration != ast.GetSourceFileOfNode(fact.binding).AsNode() || r == nil || r.frame != fact.frame || r.owner != nil || r.async || r.construction || r.declaration == nil || r.operation != unwrapSourceCallableReference(fact.binding.Initializer()) || ast.GetSourceFileOfNode(r.operation) != ast.GetSourceFileOfNode(fact.binding) {
			continue
		}
		admitted = true
		retainResultUncertainty(r.raw, result, sourceValueProjection)
		if !r.entered || r.raw.effects != sourceEffectsAccounted {
			result.valueIncomplete = true
		}
		for _, observed := range r.raw.values {
			if !query.charge(result, use) {
				result.valueIncomplete = true
				return values, true
			}
			original := observed
			value := original.value
			value.acquired = &original
			values = append(values, value)
		}
	}
	if admitted && len(values) == 0 {
		result.valueIncomplete = true
	}
	return values, admitted
}
