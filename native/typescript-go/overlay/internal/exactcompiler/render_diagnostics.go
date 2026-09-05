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

// renderDiagnostics keeps the returned view declarative. Component-owned
// declarations and control flow live in the outer component definition; the render callable contains
// only its returned view expression, including JSX branches and list callbacks.
func renderDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateWrites []StateWrite,
) []Diagnostic {
	var diagnostics []Diagnostic
	candidates := rawComponentCandidates(sourceFile)
	microTargets := lexicalMicroComponentTargets(candidates, sourceFile)
	callables := callableCandidatesByName(candidates)
	writeStarts := make(map[int]struct{}, len(stateWrites))
	for _, write := range stateWrites {
		if write.Interaction {
			continue
		}
		writeStarts[write.Start] = struct{}{}
	}
	for _, render := range resolveComponentRenders(sourceFile) {
		if _, micro := microTargets[render.callable]; micro &&
			!immutableMicroComponent(render.callable) {
			diagnostics = append(diagnostics, renderDiagnostic(
				render.callable,
				"micro-components must use an immutable const declaration",
			))
		}
		if body := render.callable.Body(); body != nil && ast.IsBlock(body) {
			diagnostics = append(diagnostics, renderDiagnostic(
				body,
				"render functions must contain one view expression; move declarations and control flow into the outer component definition and keep conditional view logic in JSX",
			))
		}
		if ast.HasSyntacticModifier(render.callable, ast.ModifierFlagsAsync) {
			diagnostics = append(diagnostics, renderDiagnostic(
				render.returned,
				"render functions must be synchronous; move asynchronous work into the outer component definition or a local task function",
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
						"render functions may not "+action+"; move the effect into the outer component definition, a local task function, or an interaction callback",
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
		if ast.IsArrowFunction(candidate.node) {
			body := unwrapRenderExpression(candidate.node.Body())
			if body != nil && !ast.IsBlock(body) &&
				len(resolveReturnedRenderCallables(body, callables, make(map[string]struct{}))) == 0 {
				diagnostics = append(diagnostics, renderDiagnostic(
					body,
					"the outer component definition must return a component-local render arrow or invoke a local setup helper that returns one; compose reusable view structure with lexical micro-components declared there",
				))
			}
		}
		for _, returned := range directCallableReturns(candidate.node) {
			if len(resolveReturnedRenderCallables(returned, callables, make(map[string]struct{}))) == 0 {
				diagnostics = append(diagnostics, renderDiagnostic(
					returned,
					"the outer component definition must return a component-local render arrow or invoke a local setup helper that returns one; compose reusable view structure with lexical micro-components declared there",
				))
			}
		}
	}
	return diagnostics
}

func resolveComponentRenders(sourceFile *ast.SourceFile) []componentRender {
	var result []componentRender
	candidates := rawComponentCandidates(sourceFile)
	callables := callableCandidatesByName(candidates)
	microTargets := lexicalMicroComponentTargets(candidates, sourceFile)
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		if ast.IsArrowFunction(candidate.node) {
			body := unwrapRenderExpression(candidate.node.Body())
			for _, callable := range resolveReturnedRenderCallables(
				body,
				callables,
				make(map[string]struct{}),
			) {
				result = append(result, componentRender{
					component: candidate,
					callable:  callable,
					returned:  body,
				})
			}
		}
		for _, returned := range directCallableReturns(candidate.node) {
			for _, callable := range resolveReturnedRenderCallables(
				returned,
				callables,
				make(map[string]struct{}),
			) {
				result = append(result, componentRender{
					component: candidate,
					callable:  callable,
					returned:  returned,
				})
			}
		}
	}
	for _, candidate := range candidates {
		owner, micro := microTargets[candidate.node]
		if !micro {
			continue
		}
		result = append(result, componentRender{
			component: owner,
			callable:  candidate.node,
			returned:  candidate.node,
		})
	}
	return result
}

func callableCandidatesByName(candidates []componentCandidate) map[string]*ast.Node {
	result := make(map[string]*ast.Node, len(candidates))
	for _, candidate := range candidates {
		result[candidate.name] = candidate.node
	}
	return result
}

// resolveReturnedRenderCallables follows statically local setup helpers to the
// lexical arrows they create. The returned arrows remain owned by each calling
// component instance even when their source factory is shared.
func resolveReturnedRenderCallables(
	expression *ast.Node,
	callables map[string]*ast.Node,
	seen map[string]struct{},
) []*ast.Node {
	expression = unwrapRenderExpression(expression)
	if expression == nil {
		return nil
	}
	if ast.IsArrowFunction(expression) {
		return []*ast.Node{expression}
	}
	if !ast.IsCallExpression(expression) {
		return nil
	}
	call := expression.AsCallExpression()
	calleeName := ""
	if ast.IsIdentifier(call.Expression) {
		calleeName = call.Expression.Text()
	} else if ast.IsPropertyAccessExpression(call.Expression) {
		member := call.Expression.AsPropertyAccessExpression()
		if member.Name() != nil && member.Name().Text() == "call" &&
			ast.IsIdentifier(member.Expression) &&
			call.Arguments != nil && len(call.Arguments.Nodes) != 0 &&
			call.Arguments.Nodes[0].Kind == ast.KindThisKeyword {
			calleeName = member.Expression.Text()
		}
	}
	callable := callables[calleeName]
	if callable == nil {
		return nil
	}
	if _, exists := seen[calleeName]; exists {
		return nil
	}
	seen[calleeName] = struct{}{}
	defer delete(seen, calleeName)
	result := []*ast.Node{}
	for _, returned := range directCallableReturns(callable) {
		resolved := resolveReturnedRenderCallables(returned, callables, seen)
		if len(resolved) == 0 {
			return nil
		}
		result = append(result, resolved...)
	}
	return result
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
