package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStagedQualifiedSessionIncremental(t *testing.T) {
	const initialSource = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
	const runtime = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);const value=m.invoke();assert.equal(value.x,2);assert.equal(Object.isFrozen(value),true);assert.notEqual(m.invoke(),value);`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			fixture := newExecutableFixture(t, map[string]string{"entry.ts": initialSource})
			request := fixture.request("compile", "entry.ts")
			request.Target = target
			initial := fixture.session.Execute(request)
			assertQualifiedIncrementalResponse(t, initial)
			repeated := fixture.session.Execute(request)
			assertQualifiedIncrementalResponse(t, repeated)
			if initial.Code != repeated.Code {
				t.Fatal("warm compile changed the emitted artifact")
			}
			project := qualifiedIncrementalProject(t, fixture.session)
			oldProgram, oldCache := project.program, project.callableCache

			request.Source = strings.Replace(initialSource, "value:1", "value:2", 1)
			reused := fixture.session.Execute(request)
			fresh := NewSession().Execute(request)
			assertQualifiedIncrementalResponse(t, reused)
			assertQualifiedIncrementalResponse(t, fresh)
			if reused.Code != fresh.Code {
				t.Fatal("warm and fresh compiles emitted different artifacts after the edit")
			}
			current := qualifiedIncrementalProject(t, fixture.session)
			cache := current.callableCache
			if current.program == oldProgram || oldCache.ownsGeneration(current.program, cache.owner.checker) || cache.ownsGeneration(oldProgram, oldCache.owner.checker) {
				t.Fatal("edited program accepted retired checker-bound callable ownership")
			}
			runQualifiedIncrementalArtifact(t, reused.Code, runtime)
		})
	}
}

func assertQualifiedIncrementalResponse(t *testing.T, response Response) {
	t.Helper()
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
}

func qualifiedIncrementalProject(t *testing.T, session *Session) *projectState {
	t.Helper()
	for _, project := range session.projects {
		if project.callableCache != nil {
			return project
		}
	}
	t.Fatal("actual Session callable generation unavailable")
	return nil
}

func runQualifiedIncrementalArtifact(t *testing.T, code, runtime string) {
	t.Helper()
	module := filepath.Join(t.TempDir(), "edited.mts")
	if err := os.WriteFile(module, []byte(code), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runtime, module).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(output))
	}
}
