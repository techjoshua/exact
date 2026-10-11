package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// A registry's fixed entries retain their owner through immutable aliases and transparent wrappers.
func componentRegistrySymbolIsWrittenAfter(symbol *ast.Symbol, declarationEnd int, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	written := false
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if written || node.Pos() <= declarationEnd || !ast.IsIdentifier(node) ||
			(!identifierIsWriteTarget(node) && !nativeAssignmentPatternTarget(node)) {
			return !written
		}
		reference := typeChecker.GetSymbolAtLocation(node)
		if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
			reference = typeChecker.GetShorthandAssignmentValueSymbol(node.Parent)
		}
		written = registryAliasOrigin(reference, typeChecker) == symbol
		return !written
	})
	return written
}

// Property writes change the shared registry object, rather than replacing a const alias binding.
// Follow those aliases even when the write itself makes a callable alias proof conservative.
func registryAliasOrigin(symbol *ast.Symbol, typeChecker *checker.Checker) *ast.Symbol {
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
		if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			return symbol
		}
		initializer := unwrapSourceCallableReference(declaration.AsVariableDeclaration().Initializer)
		if initializer == nil || !ast.IsIdentifier(initializer) {
			return symbol
		}
		symbol = typeChecker.GetSymbolAtLocation(initializer)
	}
	return nil
}
