package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// islandOwnedProtocolCapture recreates identity-bearing refs, reactive cells and immutable method
// aliases under the client owner. These executable capabilities cannot enter the JSON capture lane.
// Ordinary receivers and mutable aliases do not acquire reconstruction authority from their type.
func islandOwnedProtocolCapture(declaration *ast.Node, component *ast.Node, typeChecker *checker.Checker) bool {
	if declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	initializer := unwrapRenderExpression(declaration.AsVariableDeclaration().Initializer)
	if initializer == nil {
		return false
	}
	operation := initializer
	if ast.IsCallExpression(initializer) {
		operation = initializer.AsCallExpression().Expression
	}
	operation = componentProtocolCallMember(operation, typeChecker)
	name, member, dynamic := checkedComponentProtocolMember(operation, typeChecker)
	if !member || dynamic || !componentOwnsReceiver(operation, componentStateReceiverScopes(component, typeChecker)) {
		return false
	}
	return name == "ref" || name == "reactive"
}
