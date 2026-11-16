package exactcompiler

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A successful edit must replace the original task association and capture
// donors through Session's normal generation boundary. Cached descriptions are
// inspected only after Execute; they cannot supply live publication authority.
func TestTaskReferenceEffectsSessionEdit(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			source := strings.Replace(taskReferenceEffectsSource, "props:{initial:number}", "props:{initial:number;updated:number}", 1)
			request := Request{Kind: "compile", ID: "task-reference-incremental.tsx", Source: source, Target: target, Diagnostics: "semantic"}
			session := NewSession()
			initial := taskReferenceIncrementalSignature(t, session.Execute(request), "prepare", "initial", "nonblocking")
			repeated := taskReferenceIncrementalSignature(t, session.Execute(request), "prepare", "initial", "nonblocking")
			if !slices.Equal(initial, repeated) {
				t.Fatal("unchanged public task semantics changed", initial, repeated)
			}
			oldFact, oldReference := assertTaskReferenceEffectsDescription(t, session)
			oldProject := qualifiedIncrementalProject(t, session)
			oldProgram, oldCache := oldProject.program, oldProject.callableCache

			request.Source = strings.NewReplacer("prepare", "refresh", "props.initial", "props.updated", "TaskContext.client().latest()", "TaskContext.client().latest().blocking()").Replace(source)
			if request.Source == source {
				t.Fatal("task association edit missing")
			}
			reused := taskReferenceIncrementalSignature(t, session.Execute(request), "refresh", "updated", "blocking")
			freshSession := NewSession()
			fresh := taskReferenceIncrementalSignature(t, freshSession.Execute(request), "refresh", "updated", "blocking")
			if !slices.Equal(reused, fresh) {
				t.Fatal("fresh/reused edited task semantics differ", reused, fresh)
			}
			for _, currentSession := range []*Session{session, freshSession} {
				project := qualifiedIncrementalProject(t, currentSession)
				cache := project.callableCache
				if project.program == oldProgram || oldCache.ownsGeneration(project.program, cache.owner.checker) || cache.ownsGeneration(oldProgram, oldCache.owner.checker) {
					t.Fatal("edited task accepted retired program/checker ownership")
				}
				if _, valid := describeTaskEffectsReference(oldFact, oldReference.call, cache.owner); valid {
					t.Fatal("old task reference description accepted by edited owner")
				}
				_, current := assertTaskReferenceEffectsDescription(t, currentSession)
				if current.task == oldReference.task || current.binding == oldReference.binding || current.generation == oldReference.generation || current.read.Text() != "refresh" {
					t.Fatal("edited task description retained the old association")
				}
			}
		})
	}
}

// Compare semantic fields, including unresolved capture provenance, rather than
// emitted spelling or opaque operation/program identities. Generic capture Get
// debt is retained; this test does not promote it to a completed value receipt.
func taskReferenceIncrementalSignature(t *testing.T, response Response, name, capture, readiness string) []string {
	t.Helper()
	if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
		t.Fatal("task edit public compilation", response.Error, frameworkConsumerDiagnostics(response.Diagnostics))
	}
	if len(response.Analysis.Tasks) != 1 {
		t.Fatal("task definition count changed", len(response.Analysis.Tasks))
	}
	task := response.Analysis.Tasks[0]
	if task.Component != "Probe" || task.Placement != "client" || task.RequestedPlacement != "client" || task.Concurrency != "latest" || task.Readiness != readiness {
		t.Fatal("task association/policy was not rebuilt", task.Component, task.Placement, task.RequestedPlacement, task.Concurrency, task.Readiness)
	}
	rows := []string{fmt.Sprintf("task:%s:%s:%s:%s:%s:%s", task.Component, task.Placement, task.RequestedPlacement, task.Concurrency, task.Readiness, task.EnvironmentEffect)}
	state, err := json.Marshal([][]StateEffect{task.Reads, task.Writes})
	if err != nil {
		t.Fatal(err)
	}
	rows = append(rows, "task/state:"+string(state))
	for _, effect := range task.EffectSources {
		rows = append(rows, fmt.Sprintf("task/effect:%s:%s:%t:%t:%q", effect.Environment, effect.Description, effect.Opaque, effect.provenanceIncomplete, effect.Path))
	}
	body := executableSummary(t, response, name)
	browser, runtime, captured, write := false, false, false, false
	for _, summary := range []CallableSummary{executableSummary(t, response, "Probe"), body} {
		targets := append([]string(nil), summary.ArtifactTargets...)
		sort.Strings(targets)
		rows = append(rows, fmt.Sprintf("summary:%s:%s:%s:%v", summary.Name, summary.DirectEffect, summary.Effect, targets))
		state, err := json.Marshal([][]StateEffect{summary.StateReads, summary.StateWrites})
		if err != nil {
			t.Fatal(err)
		}
		rows = append(rows, summary.Name+"/state:"+string(state))
		for _, effect := range summary.EffectSources {
			origin := ""
			if field := effect.fieldOrigin; field != nil && field.operation != nil {
				origin = strings.TrimSpace(sourceText(ast.GetSourceFileOfNode(field.operation), field.operation))
			}
			rows = append(rows, fmt.Sprintf("%s/effect:%s:%s:%t:%t:%q:%s", summary.Name, effect.Environment, effect.Description, effect.Opaque, effect.provenanceIncomplete, effect.Path, origin))
			if summary.Name == name {
				browser = browser || effect.Environment == "browser"
				runtime = runtime || effect.Environment == "unknown" && !effect.provenanceIncomplete
				captured = captured || origin == "props."+capture
				if capture == "updated" && origin == "props.initial" {
					t.Fatal("edited task retained the old capture Get")
				}
			}
		}
	}
	for _, effect := range body.StateWrites {
		write = write || effect.Path == "value"
	}
	if !browser || !runtime || !captured || !write {
		t.Fatal("task edit lost original body/capture obligations", browser, runtime, captured, write)
	}
	sort.Strings(rows)
	return rows
}
