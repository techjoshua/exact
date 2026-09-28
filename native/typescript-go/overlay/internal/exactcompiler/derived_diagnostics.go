package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// unsafeDerivedDiagnostics prevents an eager render from retaining a setup
// snapshot that the compiler cannot safely recalculate. Deferred event
// handlers intentionally retain ordinary setup services and are excluded.
func unsafeDerivedDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	bindings []ReactiveBinding,
	components []Component,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, candidate := range componentCandidates(sourceFile) {
		unsafe := unsafeDerivedSymbols(candidate, typeChecker, bindings)
		if len(unsafe) == 0 {
			continue
		}
		reported := make(map[ast.SymbolId]struct{})
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
				isStaticPropertyName(node) ||
				!eagerRenderReference(node, candidate.node, sourceFile, typeChecker) {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(node)
			if symbol == nil {
				return true
			}
			id := ast.GetSymbolId(symbol)
			binding, exists := unsafe[id]
			if !exists {
				return true
			}
			if _, duplicate := reported[id]; duplicate {
				return true
			}
			reported[id] = struct{}{}
			reason := bindingReevaluationFailure(symbol, typeChecker)
			message := "error: derived local " + binding.Name + " cannot be safely reevaluated. " + reason.explanation()
			diagnostics = append(diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT2202",
				Message:  message,
				Start:    node.Pos(),
				Length:   node.End() - node.Pos(),
				Related:  reason.related(),
			})
			return true
		})
	}
	return diagnostics
}

func unsafeDerivedSymbols(
	candidate componentCandidate,
	typeChecker *checker.Checker,
	bindings []ReactiveBinding,
) map[ast.SymbolId]ReactiveBinding {
	byStart := make(map[int]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == candidate.name &&
			binding.Provenance == "derived" &&
			!binding.SafeToReevaluate {
			byStart[binding.Start] = binding
		}
	}
	result := make(map[ast.SymbolId]ReactiveBinding)
	walkNode(candidate.node, func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		for _, name := range bindingIdentifiers(node.AsVariableDeclaration().Name()) {
			binding, exists := byStart[name.Pos()]
			if !exists {
				continue
			}
			symbol := typeChecker.GetSymbolAtLocation(name)
			if symbol != nil {
				result[ast.GetSymbolId(symbol)] = binding
			}
		}
		return true
	})
	return result
}

func eagerRenderReference(
	reference *ast.Node,
	component *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	var renderRoot *ast.Node
	for current := reference.Parent; current != nil && current != component; current = current.Parent {
		if ast.IsJsxSpreadAttribute(current) {
			_, reason := finiteIslandSpread(
				sourceFile,
				current.AsJsxSpreadAttribute().Expression,
				typeChecker,
				nil,
			)
			if reason == "" {
				return false
			}
		}
		if ast.IsJsxAttribute(current) {
			name := jsxAttributeText(current.AsJsxAttribute().Name())
			if interactiveJSXAttribute(name) {
				return false
			}
		}
		if ast.IsArrowFunction(current) || ast.IsFunctionExpression(current) {
			renderRoot = current
		}
	}
	if renderRoot == nil {
		return false
	}
	current := renderRoot.Parent
	for current != nil && current != component &&
		ast.IsParenthesizedExpression(current) {
		current = current.Parent
	}
	return current != nil && ast.IsReturnStatement(current)
}
