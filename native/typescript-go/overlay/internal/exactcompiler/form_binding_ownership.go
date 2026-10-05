package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Binding writes cannot target a native component's parent-owned props facade.
// Ordinary helper parameters and newly created objects retain their own ownership.
func formBindingPropsSymbols(sourceFile *ast.SourceFile, components []Component, typeChecker *checker.Checker) map[ast.SymbolId]bool {
	result := make(map[ast.SymbolId]bool)
	for _, node := range componentNodesBySpan(components, sourceFile) {
		if symbol := componentPropsSymbol(node, typeChecker); symbol != nil {
			result[ast.GetSymbolId(symbol)] = true
		}
	}
	return result
}

// Follow only proven immutable receiver aliases. A copy is a new object, and an opaque
// helper result does not establish props ownership by spelling or apparent type.
func formBindingTargetsProps(target *ast.Node, props map[ast.SymbolId]bool, typeChecker *checker.Checker) bool {
	seen := make(map[ast.SymbolId]bool)
	var visit func(*ast.Node) bool
	visit = func(node *ast.Node) bool {
		node = unwrapRenderExpression(node)
		if node == nil {
			return false
		}
		// Erased assertions preserve the receiver's runtime identity and ownership.
		switch node.Kind {
		case ast.KindAsExpression:
			return visit(node.AsAsExpression().Expression)
		case ast.KindSatisfiesExpression:
			return visit(node.AsSatisfiesExpression().Expression)
		case ast.KindNonNullExpression:
			return visit(node.AsNonNullExpression().Expression)
		case ast.KindTypeAssertionExpression:
			return visit(node.AsTypeAssertion().Expression)
		}
		if ast.IsPropertyAccessExpression(node) {
			return visit(node.AsPropertyAccessExpression().Expression)
		}
		if ast.IsElementAccessExpression(node) {
			return visit(node.AsElementAccessExpression().Expression)
		}
		if !ast.IsIdentifier(node) {
			return false
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return false
		}
		id := ast.GetSymbolId(symbol)
		if props[id] {
			return true
		}
		if seen[id] {
			return false
		}
		seen[id] = true
		for _, declaration := range symbol.Declarations {
			if ast.IsVariableDeclaration(declaration) && ast.GetCombinedNodeFlags(declaration)&ast.NodeFlagsConst != 0 {
				return visit(declaration.AsVariableDeclaration().Initializer)
			}
			if ast.IsBindingElement(declaration) {
				parent := declaration.Parent
				if parent != nil {
					parent = parent.Parent
				}
				if parent != nil && ast.IsVariableDeclaration(parent) && ast.GetCombinedNodeFlags(parent)&ast.NodeFlagsConst != 0 {
					return visit(parent.AsVariableDeclaration().Initializer)
				}
			}
		}
		return false
	}
	return visit(target)
}
