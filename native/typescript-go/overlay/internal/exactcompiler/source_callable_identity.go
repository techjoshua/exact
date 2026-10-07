package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Type-only wrappers retain the selected callable's native identity.
func unwrapSourceCallableReference(node *ast.Node) *ast.Node {
	for node != nil {
		switch {
		case ast.IsParenthesizedExpression(node), ast.IsAsExpression(node), ast.IsSatisfiesExpression(node), ast.IsNonNullExpression(node):
			node = node.Expression()
		default:
			return node
		}
	}
	return nil
}

// Resolve a single finite member without using a type's display name. Dynamic selections
// remain unproven, and reevaluation still requires local ownership or a pure declaration.
func sourceCallableReferenceSymbol(node *ast.Node, typeChecker *checker.Checker) *ast.Symbol {
	node = unwrapSourceCallableReference(node)
	if node == nil {
		return nil
	}
	if ast.IsElementAccessExpression(node) {
		access := node.AsElementAccessExpression()
		if access.ArgumentExpression == nil {
			return nil
		}
		key := typeChecker.GetTypeAtLocation(access.ArgumentExpression)
		if key == nil || key.Flags()&checker.TypeFlagsStringLiteral == 0 {
			return nil
		}
		name, valid := key.AsLiteralType().Value().(string)
		if !valid {
			return nil
		}
		return typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(access.Expression), name)
	}
	return typeChecker.GetSymbolAtLocation(node)
}

// Follow immutable local aliases without changing helper implementations. Cycles and mutable
// selections remain unproven. Import aliases retain the source declaration's callable identity.
func sourceCallableSymbol(symbol *ast.Symbol, typeChecker *checker.Checker) *ast.Symbol {
	seen := make(map[ast.SymbolId]bool)
	for symbol != nil {
		id := ast.GetSymbolId(symbol)
		if seen[id] {
			return nil
		}
		seen[id] = true
		if symbol.Flags&ast.SymbolFlagsAlias != 0 {
			symbol = typeChecker.GetAliasedSymbol(symbol)
			continue
		}
		if len(symbol.Declarations) != 1 || !ast.IsVariableDeclaration(symbol.Declarations[0]) {
			return symbol
		}
		declaration := symbol.Declarations[0]
		initializer := unwrapSourceCallableReference(declaration.AsVariableDeclaration().Initializer)
		if initializer == nil || (!ast.IsIdentifier(initializer) && !ast.IsPropertyAccessExpression(initializer) && !ast.IsElementAccessExpression(initializer)) {
			return symbol
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 || owner == nil || componentValueSymbolIsWrittenAfter(symbol, declaration.End(), owner, typeChecker) {
			return nil
		}
		symbol = sourceCallableReferenceSymbol(initializer, typeChecker)
	}
	return nil
}

// sourceCallableBinding finds the variable owning a callable through type-only
// wrappers. It never crosses an evaluating expression or another callable.
func sourceCallableBinding(node *ast.Node) *ast.Node {
	current := node
	for current.Parent != nil {
		parent := current.Parent
		if unwrapSourceCallableReference(parent) == node {
			current = parent
			continue
		}
		if ast.IsVariableDeclaration(parent) && parent.AsVariableDeclaration().Initializer == current {
			return parent
		}
		break
	}
	return nil
}

// Stable callable references retain a module-visible initializer for context attachments.
// Mutable aliases remain opaque, and cycles cannot establish callable ownership.
func stableSourceCallableReference(node *ast.Node, typeChecker *checker.Checker) *ast.Node {
	seen := make(map[ast.SymbolId]bool)
	for node = unwrapSourceCallableReference(node); node != nil && ast.IsIdentifier(node); {
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil || len(symbol.Declarations) != 1 || !ast.IsVariableDeclaration(symbol.Declarations[0]) {
			return node
		}
		id := ast.GetSymbolId(symbol)
		if seen[id] {
			return nil
		}
		seen[id] = true
		declaration := symbol.Declarations[0]
		initializer := unwrapSourceCallableReference(declaration.AsVariableDeclaration().Initializer)
		if initializer == nil || (!ast.IsIdentifier(initializer) && !ast.IsPropertyAccessExpression(initializer)) {
			return node
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 || owner == nil || componentValueSymbolIsWrittenAfter(symbol, declaration.End(), owner, typeChecker) {
			return nil
		}
		node = initializer
	}
	return node
}
