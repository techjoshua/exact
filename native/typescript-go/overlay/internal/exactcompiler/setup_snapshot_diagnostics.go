package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var scheduledCallbackCalls = map[string]struct{}{
	"queueMicrotask":        {},
	"requestAnimationFrame": {},
	"requestIdleCallback":   {},
	"setInterval":           {},
	"setTimeout":            {},
}

var scheduledCallbackMethods = map[string]struct{}{
	"catch":   {},
	"finally": {},
	"then":    {},
}

var scheduledCallbackConstructors = map[string]struct{}{
	"IntersectionObserver": {},
	"MutationObserver":     {},
	"ResizeObserver":       {},
}

// setupSnapshotCaptureDiagnostics rejects setup-derived values captured by
// callbacks that execute after setup has completed. Such captures silently
// freeze state, props, or context; peek() is the explicit opt-in for that
// behavior. Symbol identity, rather than spelling, keeps callback-local shadows
// independent from setup bindings.
func setupSnapshotCaptureDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	bindings []ReactiveBinding,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, candidate := range componentCandidates(sourceFile) {
		reactiveSymbols := setupReactiveSymbols(
			candidate,
			typeChecker,
			bindings,
		)
		if len(reactiveSymbols) == 0 {
			continue
		}
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !setupOwnedNode(node, candidate.node) {
				return false
			}
			for _, callback := range scheduledCallbacks(node) {
				reported := make(map[ast.SymbolId]struct{})
				walkNode(callback, func(reference *ast.Node) bool {
					if !ast.IsIdentifier(reference) ||
						ast.IsDeclarationName(reference) ||
						isStaticPropertyName(reference) {
						return true
					}
					symbol := typeChecker.GetSymbolAtLocation(reference)
					if symbol == nil {
						return true
					}
					id := ast.GetSymbolId(symbol)
					binding, captured := reactiveSymbols[id]
					if !captured {
						return true
					}
					if _, duplicate := reported[id]; duplicate {
						return true
					}
					reported[id] = struct{}{}
					diagnostics = append(diagnostics, Diagnostic{
						Severity: "error",
						Code:     "EXACT2002",
						Message: "setup-time state snapshot " + binding.Name +
							" is captured by an asynchronous callback; use a live " +
							"reactive read or peek() for an intentional snapshot",
						Start:  reference.Pos(),
						Length: reference.End() - reference.Pos(),
					})
					return true
				})
			}
			return true
		})
	}
	return diagnostics
}

func setupReactiveSymbols(
	candidate componentCandidate,
	typeChecker *checker.Checker,
	bindings []ReactiveBinding,
) map[ast.SymbolId]ReactiveBinding {
	byStart := make(map[int]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == candidate.name &&
			(binding.Provenance == "derived" ||
				binding.Provenance == "props" ||
				binding.Provenance == "context") {
			byStart[binding.Start] = binding
		}
	}
	result := make(map[ast.SymbolId]ReactiveBinding)
	walkNode(candidate.node, func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) || !setupOwnedNode(node, candidate.node) {
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

func setupOwnedNode(node *ast.Node, component *ast.Node) bool {
	for parent := node.Parent; parent != nil && parent != component; parent = parent.Parent {
		if ast.IsFunctionLike(parent) {
			return false
		}
	}
	return node == component || node.Pos() >= component.Pos() &&
		node.End() <= component.End()
}

func scheduledCallbacks(node *ast.Node) []*ast.Node {
	if ast.IsCallExpression(node) {
		call := node.AsCallExpression()
		if call.Arguments == nil {
			return nil
		}
		name := ""
		if ast.IsIdentifier(call.Expression) {
			name = call.Expression.Text()
			if _, scheduled := scheduledCallbackCalls[name]; !scheduled {
				return nil
			}
		} else if ast.IsPropertyAccessExpression(call.Expression) {
			member := call.Expression.AsPropertyAccessExpression().Name()
			if member == nil {
				return nil
			}
			name = member.Text()
			if _, scheduled := scheduledCallbackMethods[name]; !scheduled {
				return nil
			}
		} else {
			return nil
		}
		return callbackArguments(call.Arguments.Nodes)
	}
	if ast.IsNewExpression(node) {
		expression := node.AsNewExpression()
		if !ast.IsIdentifier(expression.Expression) {
			return nil
		}
		if _, scheduled := scheduledCallbackConstructors[expression.Expression.Text()]; !scheduled ||
			expression.Arguments == nil {
			return nil
		}
		return callbackArguments(expression.Arguments.Nodes)
	}
	return nil
}

func callbackArguments(arguments []*ast.Node) []*ast.Node {
	callbacks := make([]*ast.Node, 0, len(arguments))
	for _, argument := range arguments {
		if ast.IsArrowFunction(argument) || ast.IsFunctionExpression(argument) {
			callbacks = append(callbacks, argument)
		}
	}
	return callbacks
}
