package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// derivedCollectionProvenance registers list keys on an upstream array only when the
// operation preserves its element identities and types. Factories and projections own
// their result collection, so their call receivers cannot inherit the result's key selector.
func (lowering *jsxLowering) derivedCollectionProvenance(reference *ast.Node) *ast.Node {
	symbol := lowering.checker.GetSymbolAtLocation(reference)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		initializer := unwrapRenderExpression(declaration.AsVariableDeclaration().Initializer)
		if initializer == nil || !ast.IsCallExpression(initializer) {
			continue
		}
		call := initializer.AsCallExpression()
		if !ast.IsPropertyAccessExpression(call.Expression) {
			continue
		}
		owner := standardLibraryCallOwner(call, lowering.checker)
		if owner != "Array" && owner != "ReadonlyArray" {
			continue
		}
		member := call.Expression.AsPropertyAccessExpression()
		switch member.Name().Text() {
		case "filter", "slice", "toSorted", "toReversed":
		default:
			continue
		}
		// A narrowing filter can give the result a selector that is invalid for excluded items.
		sourceType := lowering.checker.GetTypeAtLocation(member.Expression)
		resultType := lowering.checker.GetTypeAtLocation(initializer)
		sourceElement := lowering.checker.GetElementTypeOfArrayType(sourceType)
		resultElement := lowering.checker.GetElementTypeOfArrayType(resultType)
		if sourceElement == nil || resultElement == nil || !lowering.checker.IsTypeAssignableTo(sourceElement, resultElement) {
			continue
		}
		return lowering.visitor.VisitNode(member.Expression)
	}
	return nil
}
