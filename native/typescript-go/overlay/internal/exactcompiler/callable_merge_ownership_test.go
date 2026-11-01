package exactcompiler

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

// Resolution must not rewrite retained source-local facts used by subsequent project merges.
func TestProjectCallableMergeOwnsMutableSummaries(t *testing.T) {
	fixture := newExecutableFixture(t, map[string]string{
		"entry.ts":  `import {read} from './callee.js';export function run(){read();}`,
		"callee.ts": `export function read(){return window.name;}`,
	})
	if response := fixture.synchronize([]ExecutableEdge{{Importer: "entry.ts", Slot: 0, Specifier: "./callee.js", Kind: "import", Selected: "callee.ts"}}); response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, file := range []string{"callee.ts", "entry.ts"} {
		response := fixture.session.Execute(fixture.request("analyze", file))
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal("invalid selected source fixture", response.Error, response.Diagnostics)
		}
	}
	var project *projectState
	for _, candidate := range fixture.session.projects {
		project = candidate
	}
	if project == nil || project.callableCache == nil || project.callableCache.owner == nil {
		t.Fatal("missing actual callable owner")
	}
	cache := project.callableCache
	currentChecker, release := project.program.GetCheckerPool().GetChecker(context.Background(), nil)
	defer release()
	if !cache.ownsGeneration(project.program, currentChecker) {
		t.Fatal("merge fixture does not own its current checker")
	}
	caller := project.program.GetSourceFile(filepath.Join(fixture.root, "entry.ts"))
	callee := project.program.GetSourceFile(filepath.Join(fixture.root, "callee.ts"))
	if caller == nil || callee == nil {
		t.Fatal("missing checker-owned fixture sources")
	}
	analyses := cache.analyses
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
	first := mergeProjectCallableEffects(caller, analyses, cache.owner)
	if len(first.summaries) != 1 || first.summaries[0].Effect != "browser" || len(first.summaries[0].Calls) == 0 {
		t.Fatalf("cross-source effects lost: %#v", first.summaries)
	}
	projected := projectCallableAnalysisForSource(callee, first)
	if len(projected.summaries) != 1 || projected.summaries[0].Name != "read" {
		t.Fatal("requested source projection lost its callable")
	}
	for _, edge := range first.summaries[0].Calls {
		if !edge.Resolved || edge.TargetID != projected.summaries[0].ID {
			t.Fatal("actual call route lost its source target", edge)
		}
	}
	callerProjection := projectCallableAnalysisForSource(caller, first)
	mergedBefore, err := json.Marshal(first.summaries)
	if err != nil {
		t.Fatal(err)
	}
	projected.summaries[0].Name = "request-local"
	if projectCallableAnalysisForSource(callee, first).summaries[0].Name != "read" ||
		!reflect.DeepEqual(projectCallableAnalysisForSource(caller, first).summaries, callerProjection.summaries) {
		t.Fatal("source projection rewrote the retained graph or another request")
	}
	mergedAfter, err := json.Marshal(first.summaries)
	if err != nil || string(mergedAfter) != string(mergedBefore) {
		t.Fatal("source projection rewrote the published merge", err)
	}
	mergeProjectCallableEffects(callee, analyses, cache.owner)
	repeated := mergeProjectCallableEffects(caller, analyses, cache.owner)
	if snapshot() != before {
		t.Fatal("merge mutated source-owned summary")
	}
	if !reflect.DeepEqual(first.summaries, repeated.summaries) {
		t.Fatal("repeated merge diverged")
	}
}
