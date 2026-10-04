package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskOptimisticCaptureDiagnostics rejects server locals unavailable in the client prelude.
// Task inputs, outer captures and declarations within the callback retain their ordinary scope.
func taskOptimisticCaptureDiagnostics(source *ast.SourceFile, typeChecker *checker.Checker, task Task) []Diagnostic {
	if source == nil || typeChecker == nil {
		return nil
	}
	start, length := task.Start, task.Length
	if task.FunctionDefined {
		start, length = task.WorkStart, task.WorkLength
	}
	work := nodeAtSpan(source.AsNode(), start, length)
	if work == nil || !isCallableNode(work) || work.Body() == nil || !ast.IsBlock(work.Body()) {
		return nil
	}
	var diagnostics []Diagnostic
	seen := make(map[*ast.Symbol]bool)
	walkNode(work.Body(), func(node *ast.Node) bool {
		if isCallableNode(node) {
			return false
		}
		if !isTaskOptimisticCapabilityCall(node, typeChecker) {
			return true
		}
		statement := node.Parent
		for statement != nil && ast.IsParenthesizedExpression(statement) {
			statement = statement.Parent
		}
		if statement == nil || !ast.IsExpressionStatement(statement) || statement.Parent != work.Body() {
			diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2001", Message: "error: optimistic() in an invoked server task must be a direct statement in the task body. Put client-side conditions inside its callback", Start: node.Pos(), Length: node.End() - node.Pos()})
		}
		return false
	})
	for _, statement := range work.Body().AsBlock().Statements.Nodes {
		if !ast.IsExpressionStatement(statement) {
			continue
		}
		call := unwrapRenderExpression(statement.AsExpressionStatement().Expression)
		if !isTaskOptimisticCapabilityCall(call, typeChecker) {
			continue
		}
		for _, argument := range call.AsCallExpression().Arguments.Nodes {
			walkNode(argument, func(node *ast.Node) bool {
				if !ast.IsIdentifier(node) || ast.IsPartOfTypeNode(node) {
					return true
				}
				shorthand := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent)
				if !shorthand && (ast.IsDeclarationName(node) || isStaticPropertyName(node)) {
					return true
				}
				symbol := typeChecker.GetSymbolAtLocation(node)
				if shorthand {
					symbol = typeChecker.GetShorthandAssignmentValueSymbol(node.Parent)
				}
				if symbol == nil || seen[symbol] {
					return true
				}
				for _, declaration := range symbol.Declarations {
					if declaration.Pos() < work.Pos() || declaration.End() > work.End() ||
						(declaration.Pos() >= argument.Pos() && declaration.End() <= argument.End()) ||
						taskInputDeclaration(work, declaration) {
						continue
					}
					seen[symbol] = true
					diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2001", Message: "error: an optimistic callback cannot capture a server-task local (" + node.Text() + "). Use a task input, an outer public value, or compute the value inside the optimistic callback", Start: node.Pos(), Length: node.End() - node.Pos()})
					break
				}
				return true
			})
		}
	}
	return diagnostics
}

// taskInputDeclaration includes all bindings within an authored parameter pattern.
func taskInputDeclaration(work *ast.Node, declaration *ast.Node) bool {
	for _, parameter := range work.Parameters() {
		if declaration.Pos() >= parameter.Pos() && declaration.End() <= parameter.End() {
			return true
		}
	}
	return false
}
