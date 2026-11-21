package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStagedNativeCollectorSession(t *testing.T) {
	for _, row := range []struct {
		name, descriptor string
		browser, unknown bool
		oracle           string
	}{
		{"quiet", `{}`, false, false, `assert.equal(m.invoke().run,undefined);assert.equal(reads,0)`},
		{"eager getter", `{get value(){window;return 1}}`, true, false, `assert.equal(m.invoke().run,1);assert.equal(reads,1)`},
		{"dormant stored callback", `{value:()=>window}`, false, false, `const saved=m.invoke().run;assert.equal(typeof saved,'function');assert.equal(reads,0);saved();assert.equal(reads,1)`},
		{"conditional foreign getter", `{get value(){window;foreign();return 1}}`, true, true, `assert.equal(m.invoke().run,1);assert.equal(reads,1);assert.equal(foreignCalls,1)`},
		{"foreign getter with dormant result", `{get value(){window;foreign();return ()=>document}}`, true, true, `const saved=m.invoke().run;assert.equal(typeof saved,'function');assert.equal(reads,1);assert.equal(foreignCalls,1);assert.equal(documentReads,0);saved();assert.equal(documentReads,1)`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign():void;export function invoke(){return Object.defineProperty({},'run',` + row.descriptor + `)}`
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-native-collector.ts", Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("compile %s: %s %#v", target, response.Error, response.Diagnostics)
				}
				known, unknown := false, false
				fixture := nativeComponentCallFixture(t, source, "invoke()")
				component := executeComponentNativeCall(t, fixture, target, "")
				for _, effect := range executableSummary(t, component, "invoke").EffectSources {
					known = known || effect.Environment == "browser"
					unknown = unknown || effect.Environment == "unknown" && strings.Contains(effect.Description, "foreign")
					if effect.Environment == "browser" && effect.Description == "document" {
						t.Fatal("stored returned callback became an eager effect")
					}
				}
				if known != row.browser || unknown != row.unknown {
					t.Fatalf("effect sources browser=%t unknown=%t", known, unknown)
				}
				request := fixture.request("compile", "entry.ts")
				request.Target = target
				selected := fixture.session.Execute(request)
				if selected.Error != "" || hasErrorDiagnostic(selected.Diagnostics) || selected.Code == "" {
					t.Fatalf("component compile %s: %s %#v", target, selected.Error, selected.Diagnostics)
				}
				if row.browser && target == TargetClient {
					cached := fixture.session.Execute(request)
					originalEffects, err := json.Marshal(executableSummary(t, selected, "invoke").EffectSources)
					if err != nil {
						t.Fatal(err)
					}
					cachedEffects, err := json.Marshal(executableSummary(t, cached, "invoke").EffectSources)
					if err != nil {
						t.Fatal(err)
					}
					if cached.Error != "" || hasErrorDiagnostic(cached.Diagnostics) || cached.Code != selected.Code || !bytes.Equal(originalEffects, cachedEffects) {
						t.Fatal("cached Session changed emitted component code or helper EffectSources")
					}
				}

				file := filepath.Join(t.TempDir(), "native.mts")
				if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0,foreignCalls=0,documentReads=0;Object.defineProperty(globalThis,'document',{configurable:true,get(){documentReads++;return{}}});globalThis.foreign=()=>{foreignCalls++};Object.defineProperty(globalThis,'window',{configurable:true,get(){reads++;return{}}});const m=await import(pathToFileURL(process.argv[1]).href);` + row.oracle
				if row.unknown {
					runner += `;const failure=new Error('foreign');globalThis.foreign=()=>{throw failure};assert.throws(()=>m.invoke(),error=>error===failure);`
				}
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("runtime %s: %v %s", target, err, output)
				}
			}
		})
	}
}

// A component calling the operation retains the effects of key evaluation,
// descriptor conversion and authored replacements.
func TestStagedNativeCollectorLegacyBoundaries(t *testing.T) {
	for _, row := range []struct {
		name, source string
		unknown      bool
	}{
		{"independent known and foreign", `declare function foreign():void;export function invoke(){window;foreign();return Object.defineProperty({},'run',{})}`, true},
		{"receiver", `export function invoke(){window;return Object.defineProperty({},'run',{get value(){void this;return 1}})}`, false},
		{"authored shadow", `const Object={defineProperty(target:object,key:string,descriptor:PropertyDescriptor){window;return target}};export function invoke(){return Object.defineProperty({},'run',{})}`, false},
		{"eager key", `function key(){window;return 'run'}export function invoke(){return Object.defineProperty({},key(),{})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := analyzeComponentNativeCall(t, row.source, "invoke()", TargetServer)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("legacy source: %s %#v", response.Error, response.Diagnostics)
			}
			browser, unknown := false, false
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || row.unknown && !unknown {
				t.Fatalf("independent legacy donors browser=%t unknown=%t", browser, unknown)
			}
		})
	}
}

// A selected descriptor conversion retains its known browser donor and its
// independent unresolved invocation.
func TestStagedNativeForeignGetterAcceptanceTarget(t *testing.T) {
	const source = `declare function foreign():void;export function invoke(){return Object.defineProperty({},'run',{get value(){window;foreign();return 1}})}`
	response := analyzeComponentNativeCall(t, source, "invoke()", TargetServer)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("getter target: %s %#v", response.Error, response.Diagnostics)
	}
	browser, unknown := false, false
	for _, effect := range executableSummary(t, response, "invoke").EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatalf("required foreign getter donors browser=%t unknown=%t", browser, unknown)
	}
}

func TestStagedNativeCollectorDefinitionInvariant(t *testing.T) {
	for _, row := range []struct{ source, invocation string }{
		{`export function invoke(){return Object.defineProperty({},'run',{get value(){window;return 1}})}`, "invoke()"},
		{stagedNestedLiteralCallWitness, "invoke()"},
		{`export function invoke(prototype:object){return Object.freeze(Object.create(prototype))}`, "invoke({})"},
	} {
		var previous []byte
		fixture := nativeComponentCallFixture(t, row.source, row.invocation)
		for _, packageType := range []string{"application", "library"} {
			response := executeComponentNativeCall(t, fixture, TargetServer, packageType)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("definition: %s %#v", response.Error, response.Diagnostics)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "warning" && diagnostic.Code != "EXACT_ANALYSIS_COST" {
					t.Fatalf("new ordinary uncertainty warning: %#v", diagnostic)
				}
			}
			public, err := json.Marshal(executableSummary(t, response, "invoke").EffectSources)
			if err != nil {
				t.Fatal(err)
			}
			if previous != nil && !bytes.Equal(previous, public) {
				t.Fatalf("definition EffectSources changed: %s vs %s", previous, public)
			}
			previous = public
		}
	}
}
