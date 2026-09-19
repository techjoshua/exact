package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// transparentSuppliedHelperOutput follows resolved callable edges, never spelling-based guesses.
// Every return must preserve the same props child; recursive helpers and output substitution remain
// opaque. This permits ordinary property-contribution helpers without a user-authored target trait.
func transparentSuppliedHelperOutput(output *ast.Node, props string, source *ast.SourceFile, callables callableAnalysis, visiting map[string]bool) bool {
	output = unwrapRenderExpression(output)
	if props == "" || output == nil {
		return false
	}
	if name, found := rootPropertyName(output, props); found && name == "children" {
		return true
	}
	if !ast.IsCallExpression(output) {
		return false
	}
	call := output.AsCallExpression()
	var edge *CallEdge
	for _, fact := range callables.facts {
		if fact.sourceFile != source {
			continue
		}
		for _, candidate := range fact.summary.Calls {
			node := fact.callExpressions[candidate.ID]
			if node != nil && node.Pos() == call.Expression.Pos() && node.End() == call.Expression.End() {
				copied := candidate
				edge = &copied
				break
			}
		}
		if edge != nil {
			break
		}
	}
	if edge == nil {
		return false
	}
	if (edge.ModuleSpecifier == "@exactjs/core/runtime/component-abi" || edge.ModuleSpecifier == "@exactjs/core/runtime/component-operations") &&
		(edge.ExportName == "createCompiledTargetReceipt" || edge.ExportName == "createCompiledSuppliedTargetReceipt") {
		if len(call.Arguments.Nodes) != 2 {
			return false
		}
		name, found := rootPropertyName(unwrapRenderExpression(call.Arguments.Nodes[1]), props)
		return found && name == "children"
	}
	if !edge.Resolved || visiting[edge.TargetID] {
		return false
	}
	for _, callee := range callables.facts {
		if callee.summary.ID != edge.TargetID {
			continue
		}
		var parameters []*ast.Node
		for _, parameter := range callee.node.Parameters() {
			if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
				continue
			}
			parameters = append(parameters, parameter)
		}
		receiver := ""
		for index, argument := range call.Arguments.Nodes {
			argument = unwrapRenderExpression(argument)
			if index < len(parameters) && ast.IsIdentifier(argument) && argument.Text() == props && ast.IsIdentifier(parameters[index].Name()) {
				receiver = parameters[index].Name().Text()
				break
			}
		}
		if receiver == "" {
			return false
		}
		returns := directCallableReturns(callee.node)
		if len(returns) == 0 {
			return false
		}
		visiting[edge.TargetID] = true
		defer delete(visiting, edge.TargetID)
		for _, returned := range returns {
			if !transparentSuppliedHelperOutput(returned, receiver, callee.sourceFile, callables, visiting) {
				return false
			}
		}
		return true
	}
	return false
}
