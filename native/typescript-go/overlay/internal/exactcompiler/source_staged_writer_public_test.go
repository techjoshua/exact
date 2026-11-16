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

// The original writer and actual member Call share the same queue. A stored
// method contributes its body only when invoked, without granting its result a
// native category or activating a callback returned by that body. The existing
// unmigrated assignment Effects remain explicit opaque provenance through put.
func TestStagedWriterReachedMethodSession(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();function replacement(key:object):object|undefined{window.name;return undefined}function put(next:(key:object)=>object|undefined){table.get=next}function dormant(){return document.title}export function invoke(key:object){put(replacement);table.get(key);return 7}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-writer-public.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "invoke")
			browser, legacyWrite := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				if effect.Environment == "unknown" {
					if !effect.Opaque || !strings.Contains(strings.Join(effect.Path, " "), "put") {
						t.Fatal("unrelated unknown source", effect)
					}
					legacyWrite = true
				}
			}
			if !legacyWrite {
				t.Fatal("unmigrated write Effects were silently retired")
			}
			if !browser {
				t.Fatal("invoked replacement lost browser effect")
			}
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name == "invoke" {
					if fact.staged.operationsPending || !fact.staged.settled || len(fact.staged.constructedOccurrences) != 1 {
						t.Fatal("reached method did not settle through original occurrence")
					}
					for _, occurrence := range fact.staged.constructedOccurrences {
						if _, legacy := fact.staged.legacy[occurrence.request.producer.operation]; legacy {
							t.Fatal("adopted member used legacy Call recovery")
						}
					}
				}
			}
			file := filepath.Join(t.TempDir(), "writer.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;globalThis.window={get name(){reads++;return'known'}};Object.defineProperty(globalThis,'document',{get(){throw Error('dormant')}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(reads,0);assert.equal(m.invoke({}),7);assert.equal(reads,1);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			if err != nil {
				t.Fatal(err, string(output))
			}
		})
	}
}
