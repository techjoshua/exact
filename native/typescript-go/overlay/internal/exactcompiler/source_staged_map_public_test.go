package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Original module partitions and nested input composition consume the same map
// source protocols. Source Effects closure never invokes stored descriptor data.
func TestStagedMapModuleCompositionSession(t *testing.T) {
	const source = `declare function foreign():void;function latentWriter(target:PropertyDescriptorMap){window.name;foreign();target.run={value:()=>document.title}}const prototype=Object.freeze(Object.defineProperties({}, {run:{value:()=>document.title},token:{value:7}}));export function invoke(){return prototype}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-module-map.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatal("map activated data or lost source coverage", effect)
				}
			}
			mapRoot, freezeRoot := false, false
			for _, fact := range stagedDeclarationFacts(session) {
				for _, use := range fact.staged.operationUses {
					if use.request.producer.selector == (sourceStagedOperationSelector{}) {
						for _, recipe := range fact.staged.operationRecipes {
							if recipe.key == use.request.producer && recipe.nativeGet != nil {
								mapRoot = mapRoot || recipe.nativeGet.kind == sourceNativeObjectDefineProperties
								freezeRoot = freezeRoot || recipe.nativeGet.kind == sourceNativeObjectFreeze
							}
						}
						if _, legacy := fact.staged.legacy[use.request.producer.operation]; legacy {
							t.Fatal("adopted input root retained legacy Call")
						}
						if fact.staged.operationsPending {
							t.Fatal("original map/freeze still pending")
						}
					}
				}
			}
			if !mapRoot || !freezeRoot {
				t.Fatal("module composition did not use both original staged roots")
			}
			assertStagedMapEnumProductionParents(t, session)
			path := filepath.Join(t.TempDir(), "map.mts")
			if err := os.WriteFile(path, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;globalThis.window={get name(){throw new Error('latent writer executed')}};globalThis.foreign=()=>{throw new Error('latent opaque call executed')};globalThis.document={get title(){reads++;return'known'}};const m=await import(pathToFileURL(process.argv[1]).href);const p=m.invoke();assert.equal(reads,0);assert.equal(Object.isFrozen(p),true);assert.equal(p.token,7);assert.equal(p.run(),'known');assert.equal(reads,1);assert.equal(m.invoke(),p);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, path).CombinedOutput()
			if err != nil {
				t.Fatal(err, string(output))
			}
		})
	}
}
