package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskBodyContextEffects separates executor lookup authority from captured
// defaults. Ordinary called helpers contribute their transitive context effects.
func taskBodyContextEffects(work *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, callables callableAnalysis) []ContextEffect {
	result := []ContextEffect{}
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsFunctionLike(node) {
			return false
		}
		if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) && !isStaticPropertyName(node) && !ast.IsPartOfTypeNode(node) {
			if effect, exists := contextBindingReferenceEffect(typeChecker.GetSymbolAtLocation(node), source, typeChecker); exists {
				result = append(result, effect)
			}
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if effect, exists := contextEffect(call, source, typeChecker); exists {
			result = append(result, effect)
		}
		if summary, exists := callables.expressionSummary(call.Expression, typeChecker); exists {
			result = append(result, summary.Contexts...)
		}

		return true
	})
	return uniqueContextEffects(result)
}
