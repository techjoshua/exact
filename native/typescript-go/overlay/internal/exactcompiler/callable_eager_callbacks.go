package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// eagerCallbackTargets follows finite callback selection without treating arbitrary
// expression children as invoked work. Declaration identity fences recursive aliases.
func eagerCallbackTargets(argument *ast.Node, typeChecker *checker.Checker, nodeTargets map[*ast.Node]int, symbolTargets map[ast.SymbolId]int) []int {
	result := []int{}
	seen := map[*ast.Node]bool{}
	targets := map[int]bool{}
	var visit func(*ast.Node)
	visit = func(node *ast.Node) {
		node = unwrapSourceCallableReference(node)
		if node == nil || seen[node] {
			return
		}
		seen[node] = true
		if target, ok := nodeTargets[node]; ok {
			if !targets[target] {
				targets[target] = true
				result = append(result, target)
			}
			return
		}
		if ast.IsConditionalExpression(node) {
			c := node.AsConditionalExpression()
			visit(c.WhenTrue)
			visit(c.WhenFalse)
			return
		}
		if ast.IsBinaryExpression(node) {
			binary := node.AsBinaryExpression()
			switch binary.OperatorToken.Kind {
			case ast.KindCommaToken:
				visit(binary.Right)
			case ast.KindAmpersandAmpersandToken, ast.KindBarBarToken, ast.KindQuestionQuestionToken:
				visit(binary.Left)
				visit(binary.Right)
			}
			return
		}
		symbol := resolvedCallableSymbol(callTargetSymbol(node, typeChecker), typeChecker)
		if symbol == nil {
			return
		}
		if target, ok := symbolTargets[ast.GetSymbolId(symbol)]; ok {
			if !targets[target] {
				targets[target] = true
				result = append(result, target)
			}
			return
		}
		if declaration := symbol.ValueDeclaration; declaration != nil && ast.IsVariableDeclaration(declaration) {
			visit(declaration.Initializer())
		}
	}
	visit(argument)
	return result
}
