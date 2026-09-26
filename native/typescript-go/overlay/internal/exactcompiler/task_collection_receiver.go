package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// functionTaskCollectionReceiver recovers the component-owned receiver of a function task.
// TypeScript assigns an unannotated nested function its own `this`, but eXact binds task
// definitions to their owning component. Stop at ordinary functions so their receivers
// cannot accidentally acquire component collection effects.
func functionTaskCollectionReceiver(node, component *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, bindings externalImportBindings, aliases map[ast.SymbolId]stateAliasBinding) *checker.Type {
	if !ast.IsCallExpression(node) || !ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
		return nil
	}
	member := node.AsCallExpression().Expression.AsPropertyAccessExpression()
	path, ok := statePath(member.Expression, aliases, typeChecker, false)
	if !ok || len(path) == 0 {
		return nil
	}
	owned := false
	for current := node.Parent; current != nil && current != component; current = current.Parent {
		if ast.IsFunctionDeclaration(current) || ast.IsFunctionExpression(current) || ast.IsMethodDeclaration(current) {
			_, owned = functionTaskPolicy(current, source, bindings)
			break
		}
	}
	if !owned {
		return nil
	}
	for _, parameter := range component.Parameters() {
		if parameter.Name() == nil || parameter.Name().Text() != "this" {
			continue
		}
		value := typeChecker.GetTypeOfPropertyOfType(typeChecker.GetTypeAtLocation(parameter), "state")
		for _, segment := range path {
			if value == nil {
				return nil
			}
			value = typeChecker.GetTypeOfPropertyOfType(value, segment)
		}
		return value
	}
	return nil
}
