package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This models only the readonly prefix relation using the actual checker index.
// The unchanged earlier-call emitted test separately proves real construction.
func TestEnteredPropertyCallPrefixProjection(t *testing.T) {
	const id = "/virtual/property-call-projection.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `export {};function read(){Object.defineProperty(Function.prototype,'apply',{get(){return ()=> 'installed'},configurable:true});return 1}export const first=read.call(undefined);export const value=read.apply(undefined,[]);`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		owner := project.callableCache.owner
		source := project.program.GetSourceFile(id)
		if source == nil {
			continue
		}
		var body, first, last, native *ast.Node
		walkNode(source.AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) && n.Name().Text() == "read" {
				body = n
			}
			if ast.IsCallExpression(n) {
				if enclosingCallableNode(n) == body {
					native = n
				}
				if enclosingCallableNode(n) == nil {
					if first == nil {
						first = n
					} else {
						last = n
					}
				}
			}
			return true
		})
		if body == nil || first == nil || last == nil || native == nil {
			t.Fatal("missing source-owned operations")
		}
		module := owner.values.normalPopulation(source.AsNode())
		entry := module.entries[first]
		if entry == nil || entry.statement == nil || module.entries[last] == nil || module.entries[last].statement == nil {
			t.Fatal("missing caller index")
		}
		for _, name := range []string{"valid", "not-producing", "missing-domain", "wrong-population", "missing-slot", "consumed-slot", "wrong-generation", "cyclic", "wrong-index"} {
			t.Run(name, func(t *testing.T) {
				// An active identity models this pure relation. It holds no checker
				// lease and is never used to execute a query or publish a component.
				generation := &projectGeneration{active: true}
				root := module.entries[last].statement
				rootInputs := &sourceValueInputs{declaration: root}
				view := &sourcePropertyReferenceView{frame: rootInputs, root: root, source: source, owner: owner.values, executable: owner, program: project.program, checker: owner.checker, generation: generation, producing: true}
				rootInputs.properties = view
				selected := &sourceNormalSourceIdentity{source: source, population: module, domains: map[*ast.Node]*sourceNormalPopulation{source.AsNode(): module}}
				view.normalSources = map[*ast.SourceFile]*sourceNormalSourceIdentity{source: selected}
				parent := &sourceValueInputs{declaration: source.AsNode(), population: module, properties: view}
				slot := &sourceNormalOperation{state: sourceOperationInProgress, population: module, entry: entry, authority: sourceNormalAuthority{owner: owner.values, program: project.program, checker: owner.checker, generation: generation, executable: owner}}
				parent.operations = map[*ast.Node]*sourceNormalOperation{first: slot}
				inputs := &sourceValueInputs{declaration: body, population: owner.values.normalPopulation(body), properties: view}
				inputs.consumedCall = &sourceConsumedCallInputs{operation: first, declaration: body, inputs: inputs, parent: parent, entered: true}
				op := &sourceReflectiveOperation{operation: native, owner: body, frame: inputs}
				switch name {
				case "not-producing":
					view.producing = false
				case "missing-domain":
					delete(selected.domains, source.AsNode())
				case "wrong-population":
					parent.population = inputs.population
				case "missing-slot":
					parent.operations = nil
				case "consumed-slot":
					slot.state = sourceOperationConsumed
				case "wrong-generation":
					slot.authority.generation = &projectGeneration{active: true}
				case "cyclic":
					selected.cyclic = true
				case "wrong-index":
					slot.entry = module.entries[last]
				}
				if got := enteredPropertyCallPrefix(view, op); (got != nil) != (name == "valid") {
					t.Fatal("source-file projection relation", name)
				}
			})
		}
		checked = true
	}
	if !checked {
		t.Fatal("missing maintained source analysis")
	}
}
