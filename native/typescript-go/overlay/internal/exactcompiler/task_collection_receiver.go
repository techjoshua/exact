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
	if !ast.IsCallExpression(node) {
		return nil
	}
	receiver, _ := restrictedInvocationMember(unwrapSourceCallableReference(node.AsCallExpression().Expression), typeChecker)
	path, ok := statePath(receiver, aliases, typeChecker, true)
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
			// Authored guards narrow optional containers during execution. Resolve
			// the collection shape without treating nullish alternatives as missing fields.
			value = typeChecker.GetNonNullableType(value)
			if segment == "*" {
				// Preserve the broad effect so server tasks receive the same dynamic-path
				// diagnostic as arrows, while client tasks retain indexed write lowering.
				indexed := typeChecker.GetStringIndexType(value)
				if indexed == nil {
					indexed = typeChecker.GetNumberIndexType(value)
				}
				value = indexed
			} else {
				value = typeChecker.GetTypeOfPropertyOfType(value, segment)
			}
		}
		if value != nil {
			value = typeChecker.GetNonNullableType(value)
		}
		return value
	}
	return nil
}
