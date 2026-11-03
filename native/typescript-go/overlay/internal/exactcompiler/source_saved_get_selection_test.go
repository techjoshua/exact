package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const savedGetChangedSource = `function work({inner}:{inner:{read():string}}){let read=inner.read;read=()=>"safe";return read()}export{work};`
const savedGetConditionalSource = `declare const flag:boolean;function work({inner}:{inner:{read():string}}){if(flag){const read=inner.read;return read()}return "safe"}export{work};`
const savedGetLoopSource = `function work({inner}:{inner:{read():string}}){for(let n=0;n<1;n++){const read=inner.read;read()}return "safe"}export{work};`
const savedGetNestedSource = `function work({inner}:{inner:{read():string}}){const read=inner.read;return (()=>read())()}export{work};`
const savedGetEvalSource = `function work({inner}:{inner:{read():string}}){const read=inner.read;eval("");return read()}export{work};`
const savedGetAliasSource = `function work({inner}:{inner:{read():string}}){const original=inner.read;const read=original;return read()}export{work};`

// These authored variants cannot use the unchanged, direct-body definition
// selection contract. Alias-chain support remains outside this bounded repair.
func TestSavedGetDefinitionSourceRefusals(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"changed", savedGetChangedSource}, {"conditional", savedGetConditionalSource},
		{"loop", savedGetLoopSource}, {"nested", savedGetNestedSource},
		{"eval", savedGetEvalSource}, {"alias-frontier", savedGetAliasSource},
	} {
		t.Run(row.name, func(t *testing.T) {
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "/virtual/saved-get-guard.ts", Source: row.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			for _, p := range session.projects {
				if p.callableCache == nil {
					continue
				}
				var call *ast.Node
				walkNode(p.program.GetSourceFile("/virtual/saved-get-guard.ts").AsNode(), func(n *ast.Node) bool {
					if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "read" {
						call = n
					}
					return true
				})
				if call == nil {
					t.Fatal("missing authored saved Call")
				}
				owner := p.callableCache.owner
				q := newSourceDependencyQuery(call, owner.values.checker, owner, enclosingCallableNode(call))
				result := accessorCandidates{}
				if q.retainDefinitionSavedGetSelection(call, nil, &result) || len(result.callFallbacks) != 0 {
					t.Fatal("unsupported source shape classified as direct saved selection")
				}
				return
			}
			t.Fatal("missing project")
		})
	}
}

// Definition classification retains one exact selection obligation and never
// consumes actual bindings, captured occurrences, normal operations or frames.
func TestSavedGetDefinitionSelectionGuards(t *testing.T) {
	const source = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const value=[make()][0]!({inner:{read(){return document.title}}});`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/closure.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		var call *ast.Node
		walkNode(project.program.GetSourceFile("/virtual/closure.ts").AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "read" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("missing saved Call")
		}
		owner := enclosingCallableNode(call)
		newQuery := func() *sourceValueQuery {
			return newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, owner)
		}
		q := newQuery()
		result := accessorCandidates{}
		if !q.retainDefinitionSavedGetSelection(call, nil, &result) || len(result.callFallbacks) != 1 || len(result.values) != 0 || result.opaque || !result.valueIncomplete || len(result.callOutcomes) != 0 {
			t.Fatal("definition selection acquired or completed a value", result)
		}
		fallback := result.callFallbacks[0]
		if fallback.operation != call || fallback.declaration != owner || fallback.consumer != owner || fallback.complete || fallback.phase != 0 {
			t.Fatal("inexact Call selection obligation")
		}
		for _, name := range []string{"binding", "creator", "normal", "frame", "operation", "different-consumer"} {
			t.Run(name, func(t *testing.T) {
				q := newQuery()
				var bindings sourceValueBindings
				switch name {
				case "binding":
					bindings = sourceValueBindings{1: {{node: call}}}
				case "creator":
					q.creators = map[*ast.Node]sourceValueCreation{owner: {invocation: call}}
				case "normal":
					q.dependenciesOnly = false
				case "frame":
					q.inputs = &sourceValueInputs{declaration: owner}
				case "operation":
					q.operation = &sourceOperationContext{node: call, owner: owner}
				case "different-consumer":
					q.effectOwner = nil
				}
				result := accessorCandidates{}
				cost := q.estimatedCost
				if q.retainDefinitionSavedGetSelection(call, bindings, &result) || len(result.callFallbacks) != 0 || len(result.values) != 0 || q.estimatedCost != cost {
					t.Fatal("scoped consumer classified or charged as definition")
				}
			})
		}
		return
	}
	t.Fatal("missing project")
}

// A definition-only saved Call may classify selection only when its original
// initializer Get already owns an independent obligation on the same fact.
func TestSavedGetOriginalFieldObligation(t *testing.T) {
	const source = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const value=[make()][0]!({inner:{read(){return document.title}}});`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/closure.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, fact := range project.callableCache.merged.facts {
			if !ast.IsArrowFunction(fact.node) {
				continue
			}
			var operation *ast.Node
			walkNode(fact.node.Body(), func(node *ast.Node) bool {
				if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && node.Name().Text() == "read" {
					operation = unwrapSourceCallableReference(node.Initializer())
				}
				return true
			})
			if operation == nil {
				continue
			}
			for _, effect := range fact.summary.DirectEffectSources {
				if demand := effect.fieldOrigin; demand != nil && demand.declaration == fact.node && demand.operation == operation && demand.key == "read" {
					return
				}
			}
			t.Fatal("original initializer Get lacks an independent field obligation on its owning fact")
		}
	}
	t.Fatal("missing owning fact")
}
