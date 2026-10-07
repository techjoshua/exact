package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Callback references retain imported declarations for project-wide graph linking. Only the
// selected callable values are followed, so unrelated expression children remain dormant.
func eagerCallbackReferences(argument *ast.Node, typeChecker *checker.Checker) []*ast.Node {
	result := []*ast.Node{}
	seen := map[*ast.Node]bool{}
	var visit func(*ast.Node)
	visit = func(node *ast.Node) {
		node = unwrapSourceCallableReference(node)
		if node == nil || seen[node] {
			return
		}
		seen[node] = true
		if ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) {
			result = append(result, node)
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
		symbol := invokedCallbackReferenceSymbol(node, typeChecker)
		if symbol == nil {
			if callbackValueIsCallable(node, typeChecker) {
				result = append(result, node)
			}
			return
		}
		if declaration := symbol.ValueDeclaration; declaration != nil && (ast.IsVariableDeclaration(declaration) || (ast.IsPropertyAssignment(declaration) && reactiveCallableMemberStable(symbol, typeChecker))) {
			visit(declaration.Initializer())
			return
		}
		if len(typeChecker.GetSignaturesOfType(typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(symbol)), checker.SignatureKindCall)) != 0 {
			result = append(result, node)
		}
	}
	visit(argument)
	return result
}

// An opaque callable value still owns execution effects. Data arguments never become callback
// edges. A checker failure leaves execution conservative rather than authorizing portability.
func callbackValueIsCallable(node *ast.Node, typeChecker *checker.Checker) (result bool) {
	defer func() {
		if recover() != nil {
			result = true
		}
	}()
	return len(typeChecker.GetSignaturesOfType(typeChecker.GetNonNullableType(typeChecker.GetTypeAtLocation(node)), checker.SignatureKindCall)) != 0
}

// Callback member resolution uses bound source nodes and retains checker uncertainty as opaque.
func invokedCallbackReferenceSymbol(node *ast.Node, typeChecker *checker.Checker) (result *ast.Symbol) {
	if node == nil || typeChecker == nil || node.Parent == nil || ast.NodeIsSynthesized(node) {
		return nil
	}
	defer func() {
		if recover() != nil {
			result = nil
		}
	}()
	return resolvedCallableSymbol(sourceCallableReferenceSymbol(node, typeChecker), typeChecker)
}
