package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Native resource factories require symbol or global-receiver identity. Follow
// immutable value aliases without rewriting helper modules or custom APIs.
func taskNativeResourceName(expression *ast.Node, typeChecker *checker.Checker) string {
	seen := map[ast.SymbolId]bool{}
	for expression != nil {
		expression = unwrapRenderExpression(expression)
		if ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
			var receiver *ast.Node
			name := ""
			if ast.IsPropertyAccessExpression(expression) {
				receiver, name = expression.AsPropertyAccessExpression().Expression, expression.Name().Text()
			} else {
				access := expression.AsElementAccessExpression()
				key := unwrapRenderExpression(access.ArgumentExpression)
				if ast.IsStringLiteral(key) || ast.IsNoSubstitutionTemplateLiteral(key) {
					receiver, name = access.Expression, key.Text()
				}
			}
			if isCanonicalResourceName(name) && ast.IsIdentifier(receiver) && (receiver.Text() == "window" || receiver.Text() == "self" || receiver.Text() == "globalThis") {
				actual := typeChecker.GetResolvedSymbol(receiver)
				expected := typeChecker.GetGlobalSymbol(receiver.Text(), ast.SymbolFlagsValue|ast.SymbolFlagsNamespace, nil)
				if actual != nil && expected != nil && ast.GetSymbolId(actual) == ast.GetSymbolId(expected) {
					return name
				}
			}
		}
		symbol := resolvedCallableSymbol(callTargetSymbol(expression, typeChecker), typeChecker)
		if symbol == nil || seen[ast.GetSymbolId(symbol)] {
			return ""
		}
		seen[ast.GetSymbolId(symbol)] = true
		name := ast.SymbolName(symbol)
		if isCanonicalResourceName(name) {
			expected := typeChecker.GetGlobalSymbol(name, ast.SymbolFlagsValue, nil)
			if expected != nil && ast.GetSymbolId(symbol) == ast.GetSymbolId(expected) {
				return name
			}
		}
		var initializer *ast.Node
		for _, declaration := range symbol.Declarations {
			if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
				initializer = declaration.AsVariableDeclaration().Initializer
				break
			}
		}
		expression = initializer
	}
	return ""
}
