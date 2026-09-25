package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// progressResultDiagnostics keeps a one-way emission from masquerading as a client result.
// Expression-bodied callbacks may forward an emission to an application progress producer.
func progressResultDiagnostics(work, component *ast.Node, typeChecker *checker.Checker, callables callableAnalysis) []string {
	receiver, exists := callables.byNode[work]
	if !exists {
		return nil
	}
	diagnostics := []string{}
	walkNode(component, func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		symbol := resolvedCallableSymbol(callTargetSymbol(node.AsCallExpression().Expression, typeChecker), typeChecker)
		if symbol == nil {
			return true
		}
		target, found := callables.bySymbol[ast.GetSymbolId(symbol)]
		if !found || target.ID != receiver.ID {
			return true
		}
		current := node
		for current.Parent != nil && (ast.IsParenthesizedExpression(current.Parent) || ast.IsAwaitExpression(current.Parent)) {
			current = current.Parent
		}
		parent := current.Parent
		if parent != nil && !ast.IsExpressionStatement(parent) && !ast.IsVoidExpression(parent) && !ast.IsArrowFunction(parent) {
			diagnostics = append(diagnostics, "error: progress reports have no client result; do not consume their return value")
		}
		return true
	})
	return diagnostics
}

// TaskProgressContract gives a compiler-owned receiver readable diagnostic attribution.
type TaskProgressContract struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// taskPolicyHasFacet inspects policy calls without depending on whitespace or string contents.
func taskPolicyHasFacet(work *ast.Node, facet string) bool {
	return taskPolicyFacetCount(work, facet) != 0
}

func taskPolicyFacetCount(work *ast.Node, facet string) int {
	count := 0
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return 0
	}
	node := parameters[len(parameters)-1].AsParameterDeclaration().Initializer
	for node != nil {
		if ast.IsParenthesizedExpression(node) {
			node = node.AsParenthesizedExpression().Expression
			continue
		}
		if !ast.IsCallExpression(node) {
			break
		}
		call := node.AsCallExpression()
		if !ast.IsPropertyAccessExpression(call.Expression) {
			break
		}
		member := call.Expression.AsPropertyAccessExpression()
		if member.Name() != nil && member.Name().Text() == facet {
			count++
		}
		node = member.Expression
	}
	return count
}

// progressReceiverLabel keeps package attribution without publishing filesystem paths.
func progressReceiverLabel(packageName, label string) string {
	if packageName == "" {
		return label
	}
	return packageName + ":" + label
}
