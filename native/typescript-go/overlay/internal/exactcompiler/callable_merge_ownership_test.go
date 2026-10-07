package exactcompiler

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// Resolution must not rewrite retained source-local facts used by subsequent project merges.
func TestProjectCallableMergeOwnsMutableSummaries(t *testing.T) {
	parse := func(name, source string) *ast.SourceFile {
		return parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: name, Path: tspath.Path(name)}, source, core.ScriptKindTS)
	}
	caller := parse("/caller.ts", `export function run(){read();}`)
	callee := parse("/callee.ts", `export function read(){return window.name;}`)
	analyses := []callableAnalysis{
		{facts: []callableFacts{{sourceFile: caller, node: caller.Statements.Nodes[0], summary: CallableSummary{ID: "caller", Name: "run", ExportNames: []string{"run"}, DirectEffectSources: []EnvironmentEffectSource{{Environment: "unknown", Description: "unresolved call read"}}, Calls: []CallEdge{{ID: "edge", Name: "read", ModuleSpecifier: "./callee.js", ExportName: "read"}}}}}},
		{facts: []callableFacts{{sourceFile: callee, node: callee.Statements.Nodes[0], summary: CallableSummary{ID: "callee", Name: "read", ExportNames: []string{"read"}, DirectEffectSources: []EnvironmentEffectSource{{Environment: "browser", Description: "window"}}}}}},
	}
	snapshot := func() string {
		summaries := []CallableSummary{}
		for _, analysis := range analyses {
			for _, fact := range analysis.facts {
				summaries = append(summaries, fact.summary)
			}
		}
		data, err := json.Marshal(summaries)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	before := snapshot()
	first := mergeProjectCallableEffects(caller, analyses)
	if len(first.summaries) != 1 || first.summaries[0].Effect != "browser" || !first.summaries[0].Calls[0].Resolved {
		t.Fatalf("cross-source effects lost: %#v", first.summaries)
	}
	mergeProjectCallableEffects(callee, analyses)
	repeated := mergeProjectCallableEffects(caller, analyses)
	if snapshot() != before {
		t.Fatal("merge mutated source-owned summary")
	}
	if !reflect.DeepEqual(first.summaries, repeated.summaries) {
		t.Fatal("repeated merge diverged")
	}
}
