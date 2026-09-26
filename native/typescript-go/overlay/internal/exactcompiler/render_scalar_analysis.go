package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Preserve scalar text facts from the bound source before island setup reconstruction reparents
// declarations. Server and client projections must choose the same scalar-versus-child layout.
func indexScalarRenderExpressions(source *ast.SourceFile, typeChecker *checker.Checker) map[string]bool {
	result := make(map[string]bool)
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsJsxExpression(node) && node.Parent != nil &&
			(ast.IsJsxElement(node.Parent) || ast.IsJsxFragment(node.Parent)) {
			expression := node.AsJsxExpression().Expression
			if expression != nil && expression.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
				result[nodeSpanKey(expression)] = scalarDerivedType(typeChecker.GetTypeAtLocation(expression))
			}
		}
		return true
	})
	return result
}
