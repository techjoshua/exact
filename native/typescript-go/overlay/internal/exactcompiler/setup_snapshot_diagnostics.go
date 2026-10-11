package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"path/filepath"
	"strings"
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
			for _, callback := range scheduledCallbacks(node, typeChecker) {
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
						Message: "initialization-time state snapshot " + binding.Name +
							" is captured by an asynchronous callback. Use a live " +
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

// scheduledCallbacks requires native declaration ownership before treating a callback as deferred.
// Promise member identity and immutable aliases retain the same scheduling boundary.
func scheduledCallbacks(node *ast.Node, typeChecker *checker.Checker) []*ast.Node {
	if ast.IsCallExpression(node) {
		call := node.AsCallExpression()
		if call.Arguments == nil {
			return nil
		}
		selected := sourceCallableSymbol(sourceCallableReferenceSymbol(call.Expression, typeChecker), typeChecker)
		scheduled := nativeScheduledSymbol(selected, scheduledCallbackCalls)
		if !scheduled {
			_, name := restrictedInvocationMember(unwrapSourceCallableReference(call.Expression), typeChecker)
			_, method := scheduledCallbackMethods[name]
			scheduled = method && standardLibraryCallOwner(call, typeChecker) == "Promise"
		}
		if scheduled {
			return callbackArguments(call.Arguments.Nodes, typeChecker)
		}
	}
	if ast.IsNewExpression(node) {
		expression := node.AsNewExpression()
		selected := sourceCallableSymbol(sourceCallableReferenceSymbol(expression.Expression, typeChecker), typeChecker)
		if expression.Arguments != nil && nativeScheduledSymbol(selected, scheduledCallbackConstructors) {
			return callbackArguments(expression.Arguments.Nodes, typeChecker)
		}
	}
	return nil
}

// nativeScheduledSymbol accepts web platform declarations and Node's owned timer declarations.
// User declarations with a matching name cannot authorize asynchronous capture diagnostics.
func nativeScheduledSymbol(symbol *ast.Symbol, names map[string]struct{}) bool {
	if symbol == nil {
		return false
	}
	if _, known := names[symbol.Name]; !known {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || !source.IsDeclarationFile {
			continue
		}
		name := filepath.Base(source.FileName())
		if name == "lib.dom.d.ts" || name == "lib.webworker.d.ts" || strings.Contains(filepath.ToSlash(source.FileName()), "/@types/node/") {
			return true
		}
	}
	return false
}

// callbackArguments follows only source-owned bodies, keeping borrowed callbacks opaque.
func callbackArguments(arguments []*ast.Node, typeChecker *checker.Checker) []*ast.Node {
	callbacks := make([]*ast.Node, 0, len(arguments))
	for _, argument := range arguments {
		argument = unwrapSourceCallableReference(argument)
		if ast.IsArrowFunction(argument) || ast.IsFunctionExpression(argument) {
			callbacks = append(callbacks, argument)
		} else if body := localCallableBody(sourceCallableReferenceSymbol(argument, typeChecker), typeChecker); body != nil {
			callbacks = append(callbacks, body)
		}
	}
	return callbacks
}
