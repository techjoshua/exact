package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var renderGlobalEffectCalls = map[string]string{
	"fetch":                 "start asynchronous work",
	"queueMicrotask":        "schedule asynchronous work",
	"requestAnimationFrame": "schedule asynchronous work",
	"requestIdleCallback":   "schedule asynchronous work",
	"setInterval":           "schedule asynchronous work",
	"setTimeout":            "schedule asynchronous work",
}

var renderBrowserEffectMethods = map[string]string{
	"addEventListener":    "register an event listener",
	"removeEventListener": "mutate an event listener registration",
	"dispatchEvent":       "dispatch an event",
	"append":              "mutate the DOM",
	"appendChild":         "mutate the DOM",
	"insertBefore":        "mutate the DOM",
	"prepend":             "mutate the DOM",
	"remove":              "mutate the DOM",
	"removeChild":         "mutate the DOM",
	"replaceChildren":     "mutate the DOM",
	"replaceWith":         "mutate the DOM",
	"setAttribute":        "mutate the DOM",
	"clear":               "mutate persistent storage",
	"removeItem":          "mutate persistent storage",
	"setItem":             "mutate persistent storage",
}

var renderLifecycleCalls = map[string]string{
	"onActivate":   "register lifecycle work",
	"onDeactivate": "register lifecycle work",
	"onMount":      "register lifecycle work",
	"onRender":     "register lifecycle work",
	"onUnmount":    "register lifecycle work",
	"action":       "register action work",
	"reactive":     "allocate a component-owned reactive value",
	"setContext":   "mutate component context",
	"task":         "register task work",
}

type componentRender struct {
	component componentCandidate
	callable  *ast.Node
	returned  *ast.Node
}

// renderDiagnostics enforces the rerunnable render contract. Ordinary
// deterministic statements and calls remain legal; mutations and known
// scheduling, lifecycle, storage, or DOM effects must live in setup, a task,
// or an interaction callback.
func renderDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateWrites []StateWrite,
) []Diagnostic {
	var diagnostics []Diagnostic
	writeStarts := make(map[int]struct{}, len(stateWrites))
	for _, write := range stateWrites {
		writeStarts[write.Start] = struct{}{}
	}
	for _, render := range resolveComponentRenders(sourceFile, typeChecker) {
		if ast.HasSyntacticModifier(render.callable, ast.ModifierFlagsAsync) {
			diagnostics = append(diagnostics, renderDiagnostic(
				render.returned,
				"render functions must be synchronous; move asynchronous work into component setup or a local task function",
			))
		}
		walkNode(render.callable, func(node *ast.Node) bool {
			if node != render.callable && ast.IsFunctionLike(node) &&
				!eagerRenderCallback(node) {
				return false
			}
			target, _ := stateWriteTarget(node, typeChecker)
			_, directStateWrite := statePath(
				target,
				map[ast.SymbolId]stateAliasBinding{},
				typeChecker,
				true,
			)
			if _, stateWrite := writeStarts[node.Pos()]; stateWrite || directStateWrite {
				diagnostics = append(diagnostics, renderDiagnostic(
					node,
					"render functions may not write component state because render work can run again",
				))
				return false
			}
			if ast.IsCallExpression(node) {
				if action := knownRenderEffect(
					node.AsCallExpression(),
					sourceFile,
					typeChecker,
				); action != "" {
					diagnostics = append(diagnostics, renderDiagnostic(
						node,
						"render functions may not "+action+"; move the effect into component setup, a local task function, or an interaction callback",
					))
					return false
				}
			}
			return true
		})
	}
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		for _, returned := range directCallableReturns(candidate.node) {
			if invalidReturnedRenderArrow(returned, candidate.node, typeChecker) {
				diagnostics = append(diagnostics, renderDiagnostic(
					returned,
					"a shared arrow cannot be used directly as a render function because its component receiver cannot be established; use a component-local arrow, a shared regular function, or an explicit wrapper",
				))
			}
		}
	}
	return diagnostics
}

func invalidReturnedRenderArrow(
	returned *ast.Node,
	component *ast.Node,
	typeChecker *checker.Checker,
) bool {
	expression := unwrapRenderExpression(returned)
	if !ast.IsIdentifier(expression) {
		return false
	}
	callable := resolveRenderReference(expression, typeChecker)
	return callable != nil &&
		ast.IsArrowFunction(callable) &&
		!nodeInside(callable, component)
}

func resolveComponentRenders(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []componentRender {
	var result []componentRender
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		if directlyReturnsRenderedValue(candidate.node) {
			returned := candidate.node
			if returns := directCallableReturns(candidate.node); len(returns) != 0 {
				returned = returns[0]
			}
			result = append(result, componentRender{
				component: candidate,
				callable:  candidate.node,
				returned:  returned,
			})
		}
		for _, returned := range directCallableReturns(candidate.node) {
			callable := resolveReturnedRender(returned, candidate.node, typeChecker)
			if callable == nil {
				continue
			}
			result = append(result, componentRender{
				component: candidate,
				callable:  callable,
				returned:  returned,
			})
		}
	}
	return result
}

func resolveReturnedRender(
	returned *ast.Node,
	component *ast.Node,
	typeChecker *checker.Checker,
) *ast.Node {
	expression := unwrapRenderExpression(returned)
	if ast.IsArrowFunction(expression) || ast.IsFunctionExpression(expression) {
		return expression
	}
	if ast.IsCallExpression(expression) {
		call := expression.AsCallExpression()
		if ast.IsPropertyAccessExpression(call.Expression) {
			member := call.Expression.AsPropertyAccessExpression()
			if member.Name() != nil && member.Name().Text() == "bind" &&
				call.Arguments != nil && len(call.Arguments.Nodes) != 0 &&
				call.Arguments.Nodes[0].Kind == ast.KindThisKeyword {
				return resolveRenderReference(member.Expression, typeChecker)
			}
		}
		return nil
	}
	if ast.IsIdentifier(expression) {
		callable := resolveRenderReference(expression, typeChecker)
		if callable == nil {
			return nil
		}
		if ast.IsArrowFunction(callable) && !nodeInside(callable, component) {
			return nil
		}
		return callable
	}
	return nil
}

func resolveRenderReference(
	expression *ast.Node,
	typeChecker *checker.Checker,
) *ast.Node {
	expression = unwrapRenderExpression(expression)
	if expression == nil {
		return nil
	}
	if ast.IsArrowFunction(expression) || ast.IsFunctionExpression(expression) ||
		ast.IsFunctionDeclaration(expression) {
		return expression
	}
	if !ast.IsIdentifier(expression) || typeChecker == nil {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil {
		return nil
	}
	symbol = typeChecker.SkipAlias(symbol)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsFunctionDeclaration(declaration) {
			return declaration
		}
		if ast.IsVariableDeclaration(declaration) {
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer != nil &&
				(ast.IsArrowFunction(initializer) ||
					ast.IsFunctionExpression(initializer)) {
				return initializer
			}
		}
	}
	return nil
}

func nodeInside(node *ast.Node, ancestor *ast.Node) bool {
	return node != nil && ancestor != nil &&
		node.Pos() >= ancestor.Pos() && node.End() <= ancestor.End()
}

func eagerRenderCallback(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsCallExpression(parent) {
		call := parent.AsCallExpression()
		if ast.IsPropertyAccessExpression(call.Expression) {
			name := call.Expression.AsPropertyAccessExpression().Name()
			return name != nil && (name.Text() == "map" ||
				name.Text() == "flatMap" ||
				name.Text() == "filter" ||
				name.Text() == "reduce" ||
				name.Text() == "reduceRight" ||
				name.Text() == "some" ||
				name.Text() == "every" ||
				name.Text() == "find" ||
				name.Text() == "findIndex")
		}
	}
	return false
}

func knownRenderEffect(
	call *ast.CallExpression,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) string {
	if ast.IsIdentifier(call.Expression) {
		name := call.Expression.Text()
		if action := renderGlobalEffectCalls[name]; action != "" &&
			symbolIsOutsideSource(
				typeChecker.GetSymbolAtLocation(call.Expression),
				sourceFile,
			) {
			return action
		}
		return ""
	}
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return ""
	}
	member := call.Expression.AsPropertyAccessExpression()
	if member.Name() == nil {
		return ""
	}
	name := member.Name().Text()
	if member.Expression.Kind == ast.KindThisKeyword {
		return renderLifecycleCalls[name]
	}
	for receiver := member.Expression; ast.IsPropertyAccessExpression(receiver); {
		facet := receiver.AsPropertyAccessExpression()
		if facet.Expression.Kind == ast.KindThisKeyword {
			return renderLifecycleCalls[facet.Name().Text()]
		}
		receiver = facet.Expression
	}
	if receiverTypeEnvironment(call.Expression, typeChecker) == "browser" {
		return renderBrowserEffectMethods[name]
	}
	return ""
}

func renderDiagnostic(node *ast.Node, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT_RENDER",
		Message:  "error: " + strings.TrimSpace(message),
		Start:    node.Pos(),
		Length:   node.End() - node.Pos(),
	}
}
