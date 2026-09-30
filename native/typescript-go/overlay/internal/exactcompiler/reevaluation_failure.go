package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// reevaluationFailure retains the first unsupported operation across helper calls.
// It is collected only for rejected bindings, avoiding diagnostic work on safe paths.
type reevaluationFailure struct {
	node   *ast.Node
	source *ast.SourceFile
}

func recordReevaluationFailure(reason *reevaluationFailure, node *ast.Node, source *ast.SourceFile) {
	if reason != nil && reason.node == nil {
		reason.node, reason.source = node, source
	}
}

func bindingReevaluationFailure(symbol *ast.Symbol, typeChecker *checker.Checker) reevaluationFailure {
	reason := reevaluationFailure{}
	for _, declaration := range symbol.Declarations {
		for ast.IsBindingElement(declaration) && declaration.Parent != nil && declaration.Parent.Parent != nil {
			declaration = declaration.Parent.Parent
		}
		if ast.IsVariableDeclaration(declaration) {
			initializer := declaration.AsVariableDeclaration().Initializer
			if !ast.IsIdentifier(declaration.Name()) {
				initializer = declaration
			}
			safeReactiveInitializerWithHelpers(initializer, ast.GetSourceFileOfNode(declaration), typeChecker, make(map[ast.SymbolId]struct{}), &reason)
			break
		}
	}
	return reason
}

func (reason reevaluationFailure) explanation() string {
	if reason.node == nil {
		return "The initializer depends on work whose repeated execution has not been established as safe. Effectful work can run in a component-owned task."
	}
	operation := strings.Join(strings.Fields(sourceText(reason.source, reason.node)), " ")
	if len([]rune(operation)) > 160 {
		operation = string([]rune(operation)[:157]) + "..."
	}
	if ast.IsCallExpression(reason.node) || ast.IsNewExpression(reason.node) {
		return "The compiler cannot establish that `" + operation + "` is safe to repeat. If the helper has no externally visible side effects and its reactive inputs remain observable, its declaration can assert /** @exact pure */. Otherwise, effectful work belongs in a component-owned task."
	}
	return "The operation `" + operation + "` may change externally owned data or suspend execution. Derived calculations can run again when their inputs change. Move that work into a component-owned task, or calculate the value without that operation."
}

func (reason reevaluationFailure) related() []DiagnosticLocation {
	if reason.node == nil || reason.source == nil {
		return nil
	}
	line, column := sourceLocation(reason.source, reason.node.Pos())
	return []DiagnosticLocation{{source: reason.source.Text(), Line: line, Column: column, FileName: reason.source.FileName(), Start: reason.node.Pos(), Length: reason.node.End() - reason.node.Pos(), Message: reason.explanation()}}
}
