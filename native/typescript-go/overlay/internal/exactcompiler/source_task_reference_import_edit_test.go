package exactcompiler

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// Only the imported helper changes. The captured component and its original
// task reference remain byte-identical; checker ownership, not AST allocation
// or an aggregate browser classification, fences the edited dependency graph.
func TestTaskReferenceEffectsImportedHelperEdit(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			component := "import{touch}from'./helper.js';\n" + strings.Replace(taskReferenceEffectsSource, "window.name;foreign();", "window.name;foreign();touch();", 1)
			f := newExecutableFixture(t, map[string]string{"entry.ts": `export{Probe}from'./component.js';`, "component.tsx": component, "helper.ts": `export function touch(){}`})
			config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","jsx":"preserve","strict":true,"skipLibCheck":true},"files":["entry.ts"]}`
			if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			request := f.request("compile", "component.tsx")
			request.Target = target
			initialResponse := f.session.Execute(request)
			initial := taskReferenceIncrementalSignature(t, initialResponse, "prepare", "initial", "nonblocking")
			assertTaskImportedDocumentDonor(t, initialResponse, false)
			repeatedResponse := f.session.Execute(request)
			repeated := taskReferenceIncrementalSignature(t, repeatedResponse, "prepare", "initial", "nonblocking")
			assertTaskImportedDocumentDonor(t, repeatedResponse, false)
			if !slices.Equal(initial, repeated) {
				t.Fatal("unchanged imported task semantics differ")
			}
			_, oldReference := assertTaskReferenceEffectsDescription(t, f.session)
			oldProject := qualifiedIncrementalProject(t, f.session)
			oldProgram, oldCache := oldProject.program, oldProject.callableCache
			f.files["helper.ts"] = `export function touch(){document;}`
			if err := os.WriteFile(filepath.Join(f.root, "helper.ts"), []byte(f.files["helper.ts"]), 0600); err != nil {
				t.Fatal(err)
			}
			// The established public dependency-update entry, not cached fact resolution.
			update := f.request("compile", "helper.ts")
			update.Target = target
			updated := f.session.Execute(update)
			if updated.Error != "" || len(updated.Diagnostics) != 0 || updated.Code == "" {
				t.Fatal("helper update", updated.Error, frameworkConsumerDiagnostics(updated.Diagnostics))
			}
			reusedResponse := f.session.Execute(request)
			reused := taskReferenceIncrementalSignature(t, reusedResponse, "prepare", "initial", "nonblocking")
			freshSession := NewSession()
			freshResponse := freshSession.Execute(request)
			fresh := taskReferenceIncrementalSignature(t, freshResponse, "prepare", "initial", "nonblocking")
			if !slices.Equal(reused, fresh) {
				t.Fatal("fresh/reused imported task semantics differ", reused, fresh)
			}
			assertTaskImportedDocumentDonor(t, reusedResponse, true)
			assertTaskImportedDocumentDonor(t, freshResponse, true)
			for _, session := range []*Session{f.session, freshSession} {
				project := qualifiedIncrementalProject(t, session)
				cache := project.callableCache
				if project.program == oldProgram || oldCache.ownsGeneration(project.program, cache.owner.checker) || cache.ownsGeneration(oldProgram, oldCache.owner.checker) {
					t.Fatal("helper edit reused retired checker ownership")
				}
				_, current := assertTaskReferenceEffectsDescription(t, session)
				if current.generation == oldReference.generation {
					t.Fatal("helper edit retained retired task description generation")
				}
			}
			bytes, err := os.ReadFile(request.ID)
			if err != nil || string(bytes) != component || request.Source != component {
				t.Fatal("component changed during helper-only edit", err)
			}
		})
	}
}

// This exact donor must cross the imported call edge into both the task's MAY
// summary and public task projection. The existing window donor cannot mask it.
func assertTaskImportedDocumentDonor(t *testing.T, response Response, want bool) {
	t.Helper()
	found := func(effects []EnvironmentEffectSource) bool {
		for _, effect := range effects {
			if effect.Environment == "browser" && effect.Description == "document" && slices.Contains(effect.Path, "touch") {
				if effect.provenanceIncomplete {
					t.Fatal("supported helper Identifier donor became coverage debt")
				}
				return true
			}
		}
		return false
	}
	if actual := found(executableSummary(t, response, "prepare").EffectSources); actual != want {
		t.Fatal("imported helper donor missing/stale in task summary", actual, want)
	}
	if len(response.Analysis.Tasks) != 1 {
		t.Fatal("task count changed")
	}
	if actual := found(response.Analysis.Tasks[0].EffectSources); actual != want {
		t.Fatal("imported helper donor missing/stale in public task", actual, want)
	}
}
