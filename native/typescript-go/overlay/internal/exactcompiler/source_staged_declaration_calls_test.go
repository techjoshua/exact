package exactcompiler

import (
	"context"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"
)

// These source-produced witnesses qualify the complete declaration-edge path:
// queued local producers, canonical Call consumers and public effect summaries.
// Their staged records are a contract check that the covered Call did not fall
// through to the recursive invocation collector, not credit for ledger APIs.
func TestStagedDeclarationCallsPublishEffects(t *testing.T) {
	declarations := []string{
		`function leaf(input:number):number{window;foreign();return input;}`,
		`function left(input:number):number{return leaf(input);}`,
		`function right(input:number):number{leaf(input);return input;}`,
		`function a(input:number):number{left(input);return b(input);}`,
		`function b(input:number):number{right(input);if(input)return a(input);return input;}`,
		`function dormant(){document;}`,
		`export function root(input:number):number{a(input);return b(input);}`,
	}
	var expected []string
	for _, reverse := range []bool{false, true} {
		ordered := append([]string(nil), declarations...)
		if reverse {
			slices.Reverse(ordered)
		}
		source := `declare function foreign():void;` + strings.Join(ordered, "\n")
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-declarations.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("source qualification: %s %#v", response.Error, response.Diagnostics)
		}
		root := executableSummary(t, response, "root")
		known, unknown, unrelated := false, false, false
		var actual []string
		for _, effect := range root.EffectSources {
			known = known || effect.Environment == "browser"
			unknown = unknown || effect.Environment == "unknown"
			unrelated = unrelated || effect.Description == "document"
			description := effect.Description
			// Reordering declarations changes absolute offsets. Compare the
			// original owning declaration/Call instead of ignoring provenance.
			for _, fact := range stagedDeclarationFacts(session) {
				for call := range fact.staged.legacy {
					location := fmt.Sprintf(" at %s:%d", fact.sourceFile.FileName(), call.Pos())
					if strings.HasSuffix(description, location) {
						description = strings.TrimSuffix(description, location) + " at " + fact.summary.Name + ":" + strings.TrimSpace(sourceText(fact.sourceFile, call))
					}
				}
			}
			actual = append(actual, effect.Environment+":"+description)
		}
		if !known || !unknown || unrelated {
			t.Fatalf("known/unknown/dormant transfer: %#v", root)
		}
		sort.Strings(actual)
		if expected != nil && !slices.Equal(actual, expected) {
			t.Fatalf("source order changed effects: %v versus %v", actual, expected)
		}
		expected = actual
		stagedCalls, opaqueForeign := 0, false
		for _, fact := range stagedDeclarationFacts(session) {
			if !fact.staged.ready {
				t.Fatalf("published before local extraction: %s", fact.summary.Name)
			}
			for _, call := range fact.staged.calls {
				stagedCalls++
				if _, legacy := fact.staged.legacy[call.invocation.operation]; legacy {
					t.Fatal("covered Call entered legacy collection")
				}
				if call.kind != relativeDemandEffects || call.invocation.declaration == nil || !call.invocation.actualsKnown {
					t.Fatal("missing authenticated producer or argument extent")
				}
				for _, actual := range call.invocation.actuals {
					if actual.endpoint.kind != relativeEndpointRole || actual.endpoint.role.kind != relativeRoleFormal || actual.endpoint.role.declaration != fact.node {
						t.Fatal("forwarding lost declaration-relative input")
					}
				}
			}
			if fact.summary.Name == "leaf" {
				for _, call := range fact.staged.operationSkipped {
					if ast.IsCallExpression(call) && ast.IsIdentifier(call.Expression()) && call.Expression().Text() == "foreign" {
						opaqueForeign = true
						if _, legacy := fact.staged.legacy[call]; legacy {
							t.Fatal("opaque runtime source reentered legacy preparation")
						}
					}
				}
			}
		}
		if stagedCalls != 8 || !opaqueForeign {
			t.Fatalf("staged Calls=%d, explicit opaque source=%t", stagedCalls, opaqueForeign)
		}
	}
}

func TestStagedDeclarationCallsKeepUnsupportedInputs(t *testing.T) {
	for _, control := range []struct{ name, source string }{
		{"script-global", `function leaf(){return 1;}function root(){return leaf();}`},
		{"default", `function leaf(input=window.innerWidth){return input;}export function root(){return leaf();}`},
		{"rest", `function leaf(...inputs:number[]){return inputs[0];}export function root(input:number){return leaf(input);}`},
		{"written-callee", `let leaf=()=>1;leaf=()=>window.innerWidth;export function root(){return leaf();}`},
		{"value-coercion", `function leaf(){return {toString(){return window.name;}};}export function root(){return ''+leaf();}`},
	} {
		t.Run(control.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-refusal-" + control.name + ".ts", Source: control.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("source qualification: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "root" {
					continue
				}
				found = true
				if len(fact.staged.calls) != 0 || len(fact.staged.legacy) == 0 {
					t.Fatalf("unsupported input claimed migrated: %#v", fact.staged)
				}
			}
			if !found {
				t.Fatal("missing source-produced root fact")
			}
		})
	}
}

func TestStagedDeclarationCallsPreserveEmission(t *testing.T) {
	const source = `const events:string[]=[];function leaf(input:number){events.push('leaf:'+input);return input;}function left(input:number){return leaf(input);}function right(input:number){leaf(input);return input;}export function run(input:number){left(input);right(input);return events;}function dormant(){throw new Error('dormant');}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/staged-emission.ts", Target: target, Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("compile %s: %s %#v", target, response.Error, response.Diagnostics)
		}
		filename := filepath.Join(t.TempDir(), "staged.mts")
		if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(m.run(7),['leaf:7','leaf:7']);`
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("emission %s: %v %s", target, err, output)
		}
	}
}

func stagedDeclarationFacts(session *Session) []callableFacts {
	var result []callableFacts
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, analysis := range project.callableCache.bySource {
			result = append(result, analysis.facts...)
		}
	}
	return result
}
