package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// actionDiagnostics validates source-only action invariants before lowering
// injects the runtime ActionContext and cancellation fences.
func actionDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		actionSymbols := make(map[ast.SymbolId]string)
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			facets, action := actionFacets(call.Expression)
			if !action {
				return true
			}
			diagnostics = append(
				diagnostics,
				validateActionRegistration(
					node,
					call,
					facets,
					candidate,
					sourceFile,
					typeChecker,
				)...,
			)
			if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
				name := node.Parent.AsVariableDeclaration().Name()
				if ast.IsIdentifier(name) {
					if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
						actionSymbols[ast.GetSymbolId(symbol)] = name.Text()
					}
				}
			}
			return false
		})
		if len(actionSymbols) != 0 {
			diagnostics = append(
				diagnostics,
				actionRenderInvocationDiagnostics(
					candidate,
					actionSymbols,
					typeChecker,
				)...,
			)
		}
	}
	return diagnostics
}

func validateActionRegistration(
	node *ast.Node,
	call *ast.CallExpression,
	facets []string,
	candidate componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []Diagnostic {
	var diagnostics []Diagnostic
	if !validActionFacets(facets) {
		diagnostics = append(diagnostics, actionDiagnostic(
			node,
			"unsupported this.action facet chain; use .client, .server, and an optional trailing .deferred",
		))
	}
	if taskRegistrationInsideNestedFunction(node, candidate.node) {
		diagnostics = append(diagnostics, actionDiagnostic(
			node,
			"this.action() must be registered directly during component setup",
		))
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) < 2 {
		return append(diagnostics, actionDiagnostic(
			node,
			"this.action() requires a diagnostic name and work callback",
		))
	}
	work := call.Arguments.Nodes[1]
	if !ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work) {
		return append(diagnostics, actionDiagnostic(
			work,
			"this.action() work must be a locally analyzable function",
		))
	}
	optimisticCalls := actionOptimisticCalls(work, sourceFile)
	requestedPlacement := actionRequestedPlacement(facets)
	browserEffects, serverEffects := taskEnvironmentEffects(
		work,
		sourceFile,
		typeChecker,
	)
	if requestedPlacement == "server" && browserEffects {
		diagnostics = append(diagnostics, actionDiagnostic(
			work,
			"this.action.server() cannot reference browser-only effects outside its optimistic prelude",
		))
	}
	if requestedPlacement == "client" && serverEffects {
		diagnostics = append(diagnostics, actionDiagnostic(
			work,
			"this.action.client() cannot reference server-only effects",
		))
	}
	concurrency := "parallel"
	if len(call.Arguments.Nodes) >= 3 {
		concurrency = strings.Trim(
			strings.TrimSpace(sourceText(sourceFile, call.Arguments.Nodes[2])),
			"'\"",
		)
	}
	if len(optimisticCalls) != 0 && concurrency == "parallel" {
		diagnostics = append(diagnostics, actionDiagnostic(
			optimisticCalls[0],
			"optimistic state requires 'latest' or 'queue' action concurrency",
		))
	}
	for _, optimistic := range optimisticCalls {
		if requestedPlacement == "server" &&
			!directActionOptimisticStatement(optimistic, work) {
			diagnostics = append(diagnostics, actionDiagnostic(
				optimistic,
				"server action optimistic() calls must be direct top-level prelude statements",
			))
		}
		invocation := optimistic.AsCallExpression()
		if invocation.Arguments == nil || len(invocation.Arguments.Nodes) != 1 {
			diagnostics = append(diagnostics, actionDiagnostic(
				optimistic,
				"optimistic() requires one synchronous state-mutation callback",
			))
			continue
		}
		callback := invocation.Arguments.Nodes[0]
		if (!ast.IsArrowFunction(callback) && !ast.IsFunctionExpression(callback)) ||
			ast.HasSyntacticModifier(callback, ast.ModifierFlagsAsync) ||
			actionCallbackContainsAwait(callback) {
			diagnostics = append(diagnostics, actionDiagnostic(
				callback,
				"optimistic() callbacks must be synchronous",
			))
		}
	}
	diagnostics = append(
		diagnostics,
		actionContextEscapeDiagnostics(work, sourceFile, typeChecker)...,
	)
	return diagnostics
}

func directActionOptimisticStatement(call *ast.Node, work *ast.Node) bool {
	statement := call.Parent
	return statement != nil &&
		ast.IsExpressionStatement(statement) &&
		statement.Parent == work.Body()
}

func validActionFacets(facets []string) bool {
	if len(facets) == 0 {
		return true
	}
	if len(facets) == 1 {
		return facets[0] == "client" ||
			facets[0] == "server" ||
			facets[0] == "deferred"
	}
	return len(facets) == 2 &&
		(facets[0] == "client" || facets[0] == "server") &&
		facets[1] == "deferred"
}

func actionOptimisticCalls(
	work *ast.Node,
	sourceFile *ast.SourceFile,
) []*ast.Node {
	var result []*ast.Node
	walkNode(work.Body(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		expression := strings.TrimSpace(sourceText(
			sourceFile,
			node.AsCallExpression().Expression,
		))
		if expression == "optimistic" || strings.HasSuffix(expression, ".optimistic") {
			result = append(result, node)
		}
		return true
	})
	return result
}

func actionCallbackContainsAwait(callback *ast.Node) bool {
	found := false
	walkNode(callback.Body(), func(node *ast.Node) bool {
		if found {
			return false
		}
		if node != callback.Body() && isCallableNode(node) {
			return false
		}
		if ast.IsAwaitExpression(node) {
			found = true
			return false
		}
		return true
	})
	return found
}

func actionContextEscapeDiagnostics(
	work *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []Diagnostic {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return nil
	}
	context := parameters[len(parameters)-1]
	if !strings.Contains(sourceText(sourceFile, context), "ActionContext") ||
		!ast.IsIdentifier(context.Name()) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(context.Name())
	if symbol == nil {
		return nil
	}
	var diagnostics []Diagnostic
	walkNode(work.Body(), func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) {
			return true
		}
		reference := typeChecker.GetSymbolAtLocation(node)
		if reference == nil ||
			ast.GetSymbolId(reference) != ast.GetSymbolId(symbol) {
			return true
		}
		parent := node.Parent
		if parent != nil && ast.IsPropertyAccessExpression(parent) &&
			parent.AsPropertyAccessExpression().Expression == node {
			return true
		}
		diagnostics = append(diagnostics, actionDiagnostic(
			node,
			"ActionContext may not escape into state, context, returns, arguments, or longer-lived work",
		))
		return true
	})
	return diagnostics
}

func actionRenderInvocationDiagnostics(
	candidate componentCandidate,
	actionSymbols map[ast.SymbolId]string,
	typeChecker *checker.Checker,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, returned := range directCallableReturns(candidate.node) {
		render := resolveReturnedRender(returned, candidate.node, typeChecker)
		if render == nil {
			continue
		}
		walkNode(render.Body(), func(node *ast.Node) bool {
			if node != render.Body() && isCallableNode(node) && !eagerRenderCallback(node) {
				return false
			}
			if !ast.IsCallExpression(node) ||
				!ast.IsIdentifier(node.AsCallExpression().Expression) {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(node.AsCallExpression().Expression)
			if symbol == nil {
				return true
			}
			name, action := actionSymbols[ast.GetSymbolId(symbol)]
			if action {
				diagnostics = append(diagnostics, actionDiagnostic(
					node,
					fmt.Sprintf("action %s may not be invoked during rerunnable render work", name),
				))
			}
			return true
		})
	}
	return diagnostics
}

func actionDiagnostic(node *ast.Node, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT_COMPONENT_ACTION",
		Message:  "error: " + message,
		Start:    node.Pos(),
		Length:   node.End() - node.Pos(),
	}
}
