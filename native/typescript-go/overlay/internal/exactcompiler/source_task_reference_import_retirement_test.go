package exactcompiler

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// Reversing only an imported donor must retire its old MAY contribution from
// both the unchanged task declaration and public task projection. Other body,
// capture, state and policy obligations retain their original semantics.
func TestTaskReferenceEffectsImportedHelperRetirement(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		if !t.Run(string(target), func(t *testing.T) {
			component := "import{touch}from'./helper.js';\n" + strings.Replace(taskReferenceEffectsSource, "window.name;foreign();", "window.name;foreign();touch();", 1)
			const harmless = `export function touch(){}`
			f := newExecutableFixture(t, map[string]string{"entry.ts": `export{Probe}from'./component.js';`, "component.tsx": component, "helper.ts": harmless})
			config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","jsx":"preserve","strict":true,"skipLibCheck":true},"files":["entry.ts"]}`
			if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			request := f.request("compile", "component.tsx")
			request.Target = target
			initialResponse := f.session.Execute(request)
			initial := taskReferenceIncrementalSignature(t, initialResponse, "prepare", "initial", "nonblocking")
			assertTaskImportedDocumentDonor(t, initialResponse, false)
			_, previousReference := assertTaskReferenceEffectsDescription(t, f.session)
			previousProject := qualifiedIncrementalProject(t, f.session)
			previousProgram, previousCache := previousProject.program, previousProject.callableCache

			for _, step := range []struct {
				name, source string
				document     bool
			}{
				{"add-document", `export function touch(){document;}`, true},
				{"retire-document", harmless, false},
			} {
				if !t.Run(step.name, func(t *testing.T) {
					f.files["helper.ts"] = step.source
					if err := os.WriteFile(filepath.Join(f.root, "helper.ts"), []byte(step.source), 0600); err != nil {
						t.Fatal(err)
					}
					// This is the established public dependency update; no cached
					// merged graph is resolved or given source/current receipts.
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
						t.Fatal("fresh/reused helper retirement semantics differ", reused, fresh)
					}
					assertTaskImportedDocumentDonor(t, reusedResponse, step.document)
					assertTaskImportedDocumentDonor(t, freshResponse, step.document)
					if !step.document && !slices.Equal(initial, reused) {
						t.Fatal("helper reversal did not restore original task semantics", initial, reused)
					}
					for _, session := range []*Session{f.session, freshSession} {
						project := qualifiedIncrementalProject(t, session)
						cache := project.callableCache
						if project.program == previousProgram || previousCache.ownsGeneration(project.program, cache.owner.checker) || cache.ownsGeneration(previousProgram, previousCache.owner.checker) {
							t.Fatal("helper reversal accepted retired program/checker ownership")
						}
						_, current := assertTaskReferenceEffectsDescription(t, session)
						if current.generation == previousReference.generation {
							t.Fatal("helper reversal retained retired task generation")
						}
					}
					bytes, err := os.ReadFile(request.ID)
					if err != nil || string(bytes) != component || request.Source != component {
						t.Fatal("component changed during helper reversal", err)
					}
					previousProject = qualifiedIncrementalProject(t, f.session)
					previousProgram, previousCache = previousProject.program, previousProject.callableCache
					_, previousReference = assertTaskReferenceEffectsDescription(t, f.session)
				}) {
					return
				}
			}
		}) {
			return
		}
	}
}
