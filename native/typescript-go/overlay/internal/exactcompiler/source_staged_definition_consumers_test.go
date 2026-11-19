package exactcompiler

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Public definitions retain their MAY summaries. Application invocation inputs
// qualify their own render edges without specializing a shared library body.
func TestStagedDefinitionCompositionConsumers(t *testing.T) {
	const librarySource = stagedFrameworkConsumerSource + `
export function View(props:{label:string;read(this:{label:string},suffix:string):string}){
 return()=> <output>{props.read(props.label)}</output>;
}`
	for _, target := range []Target{TargetClient, TargetServer} {
		if !t.Run(string(target), func(t *testing.T) {
			root, config := collectionSourceFixture(t)
			library := filepath.Join(root, "Library.tsx")
			application := filepath.Join(root, "Application.tsx")
			if err := os.WriteFile(library, []byte(librarySource), 0600); err != nil {
				t.Fatal(err)
			}
			session := NewSession()
			request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: library, Source: librarySource, Target: target, Diagnostics: "semantic"}
			baseline := session.Execute(request)
			assertDefinitionConsumerCompile(t, baseline)
			original := definitionConsumerSemantics(t, session, baseline)
			for _, row := range []struct{ name, body, placement string }{
				{"portable", `return this.label+suffix+captured;`, "isomorphic"},
				{"browser", `return this.label+suffix+captured+document.title;`, "client"},
			} {
				if !t.Run(row.name, func(t *testing.T) {
					source := `import{View,Probe}from'./Library.js';const captured='capture';function read(this:{label:string},suffix:string){` + row.body + `}export function Parent(){return()=> <main><View label="label" read={read}/><Probe/></main>}`
					prepared := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: library, Source: librarySource}, {ID: application, Source: source}}})
					if prepared.Error != "" || hasErrorDiagnostic(prepared.Diagnostics) {
						t.Fatal("source synchronization", prepared.Error, frameworkConsumerDiagnostics(prepared.Diagnostics))
					}
					appRequest := request
					appRequest.ID, appRequest.Source = application, source
					composed := session.Execute(appRequest)
					assertDefinitionConsumerCompile(t, composed)
					definition := session.Execute(request)
					assertDefinitionConsumerCompile(t, definition)
					parent := findComponent(t, composed.Analysis.Components, "Parent")
					if len(parent.RenderEdges) != 2 {
						t.Fatal("missing actual imported composition", parent.RenderEdges)
					}
					view, probe := false, false
					for _, edge := range parent.RenderEdges {
						// Resolved native imports carry their actual component identity;
						// module/export strings describe opaque package edges instead.
						if edge.Name != edge.Tag || edge.ComponentID == "" || edge.ComponentID != findComponent(t, definition.Analysis.Components, edge.Name).ID {
							t.Fatal("composition lost original library target", edge)
						}
						view = view || edge.Name == "View" && edge.Placement == row.placement
						probe = probe || edge.Name == "Probe"
					}
					if !view || !probe || row.placement == "client" && parent.RenderCapability.Server != "unsupported" {
						t.Fatal("actual receiver/capture invocation did not constrain its own edge", row.name, parent)
					}
					if current := definitionConsumerSemantics(t, session, definition); !reflect.DeepEqual(original, current) {
						t.Fatalf("application changed public library definition:\nbefore=%q\nafter=%q", original, current)
					}
				}) {
					return
				}
			}
			invalid := `import{View}from'./Library.js';function read(this:{label:number},suffix:string){return suffix}export function Parent(){return()=> <View label="label" read={read}/>}`
			prepared := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: library, Source: librarySource}, {ID: application, Source: invalid}}})
			if prepared.Error != "" {
				t.Fatal("invalid-input synchronization", prepared.Error)
			}
			invalidRequest := request
			invalidRequest.ID, invalidRequest.Source = application, invalid
			refused := session.Execute(invalidRequest)
			if refused.Error != "" || !containsDiagnosticCode(refused.Diagnostics, "TS2322") {
				t.Fatal("incompatible actual receiver escaped TypeScript checking", refused.Error, frameworkConsumerDiagnostics(refused.Diagnostics))
			}
			// Raw compilation may include a diagnostic artifact. The public check
			// projection never returns executable code; host publication separately
			// rejects error diagnostics before admitting a compiled result.
			invalidRequest.Kind, invalidRequest.Target = "check", TargetDefault
			checked := session.Execute(invalidRequest)
			if checked.Error != "" || !containsDiagnosticCode(checked.Diagnostics, "TS2322") || checked.Code != "" {
				t.Fatal("invalid actual receiver escaped public checking", checked.Error, frameworkConsumerDiagnostics(checked.Diagnostics))
			}

		}) {
			return
		}
	}
}

func assertDefinitionConsumerCompile(t *testing.T, response Response) {
	t.Helper()
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal("public definition/composition compile", response.Error, frameworkConsumerDiagnostics(response.Diagnostics))
	}
}

// Only semantic public fields participate: program IDs, AST pointers and emitted
// formatting are not definition-publication contracts. Private provenance debt
// is checked independently rather than hidden by JSON serialization.
func definitionConsumerSemantics(t *testing.T, session *Session, response Response) []string {
	t.Helper()
	rows := []string{}
	for _, name := range []string{"Probe", "View", "observe", "run"} {
		summary := executableSummary(t, response, name)
		for group, effects := range [][]EnvironmentEffectSource{summary.DirectEffectSources, summary.EffectSources} {
			for _, effect := range effects {
				if effect.provenanceIncomplete {
					t.Fatal("definition published compiler coverage debt", name, effect.Description)
				}
				rows = append(rows, fmt.Sprintf("%s/effects%d/%s/%s/%t/%q", name, group, effect.Environment, effect.Description, effect.Opaque, effect.Path))
			}
		}
		state, err := json.Marshal([][]StateEffect{summary.StateReads, summary.StateWrites})
		if err != nil {
			t.Fatal(err)
		}
		rows = append(rows, name+"/state/"+string(state))
	}
	for _, name := range []string{"Probe", "View"} {
		component := findComponent(t, response.Analysis.Components, name)
		rows = append(rows, fmt.Sprintf("%s/component/%s/%s/%t", name, component.Placement, component.EnvironmentEffect, component.Surface.Reactivity))
	}
	// The declaration-relative input descriptor is descriptive. Local placement
	// alone is not a claim that an unknown actual callable has been consumed.
	demandFound := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "View" {
			continue
		}
		if len(fact.componentCallableInputs) != 1 {
			t.Fatal("missing original named callable input", len(fact.componentCallableInputs))
		}
		demand := fact.componentCallableInputs[0]
		if demand.declaration != fact.node || demand.slot != fact.node.Parameters()[0] || demand.key != "read" || !ast.IsCallExpression(demand.operation) {
			t.Fatal("declaration-relative input association changed")
		}
		call := demand.operation.AsCallExpression()
		if call.Arguments == nil || len(call.Arguments.Nodes) != 1 || !ast.IsPropertyAccessExpression(call.Expression) || !ast.IsPropertyAccessExpression(call.Arguments.Nodes[0]) {
			t.Fatal("original receiver/argument Call syntax lost")
		}
		callee := call.Expression.AsPropertyAccessExpression()
		argument := call.Arguments.Nodes[0].AsPropertyAccessExpression()
		if callee.Name().Text() != "read" || !ast.IsIdentifier(callee.Expression) || callee.Expression.Text() != "props" || argument.Name().Text() != "label" || !ast.IsIdentifier(argument.Expression) || argument.Expression.Text() != "props" {
			t.Fatal("input descriptor retargeted receiver/argument")
		}
		rows = append(rows, "View/call-input/props.read(props.label)")
		demandFound = true
	}
	if !demandFound {
		t.Fatal("original public definition input descriptor absent")
	}
	known, unknown, taskFound := false, false, false
	for _, task := range response.Analysis.Tasks {
		if task.CompilerComputation {
			continue
		}
		taskFound = true
		if task.Component != "Probe" || task.Placement != "client" || task.Concurrency != "latest" || !containsString(task.ReactiveDependencies, "label") {
			t.Fatal("library task policy/dependency changed", task.Component, task.Placement, task.ReactiveDependencies)
		}
		for _, effect := range task.EffectSources {
			known = known || effect.Environment == "browser"
			unknown = unknown || effect.Environment == "unknown"
			if effect.provenanceIncomplete {
				t.Fatal("task published compiler debt", effect.Description)
			}
			rows = append(rows, fmt.Sprintf("task/effect/%s/%s/%t/%q", effect.Environment, effect.Description, effect.Opaque, effect.Path))
		}
		state, err := json.Marshal([][]StateEffect{task.Reads, task.Writes})
		if err != nil {
			t.Fatal(err)
		}
		rows = append(rows, "task/state/"+string(state))
	}
	if !taskFound || !known || !unknown {
		t.Fatal("library lost task or independent known/runtime-MAY donors", taskFound, known, unknown)
	}
	sort.Strings(rows)
	return rows
}
