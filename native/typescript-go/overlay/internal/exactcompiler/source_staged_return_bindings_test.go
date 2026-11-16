package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The actual completion/binding owner runs with source operands only. Native
// results remain pending tokens and no predicate, RHS or creating scope is read.
func TestStagedReturnBindingOriginalOwners(t *testing.T) {
	for _, row := range []struct {
		name, source string
		branches     int
		complete     bool
	}{
		{"conditional native data", `function factory(prototype:object){let value=Object.create(prototype);if(!prototype)value={};return value}export function invoke(p:object){return factory(p)}`, 2, true},
		{"completed local replacement", `function factory(){let value=()=>document.title;value=()=>window.name;return value}export function invoke(){return factory()}`, 1, true},
		{"replacing finally", `function factory(){try{return()=>document.title}finally{return()=>window.name}}export function invoke(){return factory()}`, 1, true},
		{"captured write pending", `function factory(input:()=>string){let value=input;function change(){value=()=>window.name}change();return value}export function invoke(input:()=>string){return factory(input)}`, 1, false},
		{"abrupt only", `function factory(){throw 0}export function invoke(){return factory()}`, 0, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, call *ast.Node) {
				association, valid := describeStagedInputSubstitution(call, enclosingCallableNode(call), owner)
				if !valid {
					t.Fatal("original entry source association")
				}
				plan, valid := describeStagedCallReturnSources(sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: association.invocation, sourceInputs: association}, owner)
				if !valid {
					t.Fatal("original return source association")
				}
				projection := describeStagedReturnBindings(plan, owner)
				if len(projection.branches) != row.branches || projection.locallyRepresented != row.complete {
					t.Fatalf("source branches=%d local=%v want %d/%v", len(projection.branches), projection.locallyRepresented, row.branches, row.complete)
				}
				for _, branch := range projection.branches {
					if branch.endpoint.creation != call || branch.endpoint.returning != branch.returning {
						t.Fatal("creating/return associations were lost")
					}
					if row.name == "conditional native data" && ast.IsCallExpression(branch.endpoint.expression) && !branch.pending {
						t.Fatal("binding source became native result/category")
					}
					if row.name == "completed local replacement" || row.name == "replacing finally" {
						file := ast.GetSourceFileOfNode(branch.endpoint.expression)
						if sourceText(file, branch.endpoint.expression) != "()=>window.name" {
							t.Fatal("original completion owner retained overridden source")
						}
					}
				}
			})
		})
	}
}

func withStagedReturnProgram(t *testing.T, source string, inspect func(*executableBodyOwner, *ast.Node)) {
	t.Helper()
	const id = "/virtual/return-source-owner.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	var call *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "factory" {
			call = node
		}
		return true
	})
	if call == nil {
		t.Fatal("original factory Call")
	}
	inspect(newExecutableBodyOwner(project, generation.checker), call)
}
