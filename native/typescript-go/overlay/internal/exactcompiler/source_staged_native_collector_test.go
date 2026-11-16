package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
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
				for _, effect := range executableSummary(t, response, "invoke").EffectSources {
					known = known || effect.Environment == "browser"
					unknown = unknown || effect.Environment == "unknown"
					if effect.Environment == "browser" && effect.Description == "document" {
						t.Fatal("stored returned callback became an eager effect")
					}
				}
				if known != row.browser || unknown != row.unknown {
					t.Fatalf("effect sources browser=%t unknown=%t", known, unknown)
				}
				issued := false
				for _, fact := range stagedDeclarationFacts(session) {
					if row.unknown && fact.node.Body() != nil {
						walkNode(fact.node.Body(), func(node *ast.Node) bool {
							if node != fact.node.Body() && ast.IsFunctionLike(node) {
								return false
							}
							if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "foreign" {
								if _, legacy := fact.staged.legacy[node]; legacy {
									t.Fatal("opaque source Call recursively prepared through legacy")
								}
								found := false
								for _, skipped := range fact.staged.operationSkipped {
									found = found || skipped == node
								}
								if !found {
									t.Fatal("opaque source invocation has no issuing producer")
								}
								for _, edge := range fact.summary.Calls {
									if fact.fieldEdgeOperations[edge.ID] == node && (edge.Resolved || edge.TargetID != "") {
										t.Fatal("bodyless declaration became an executable empty summary")
									}
								}
							}
							return true
						})
					}
					if fact.summary.Name != "invoke" {
						continue
					}
					for _, use := range fact.staged.operationUses {
						if use.request.producer.selector == (sourceStagedOperationSelector{}) && use.call == nil {
							issued = fact.staged.ready && fact.staged.settled && !fact.staged.operationsPending && len(fact.staged.operationSkipped) > 0
							if _, legacy := fact.staged.legacy[use.request.producer.operation]; legacy {
								t.Fatal("migrated native Call retained legacy invocation recovery")
							}
						}
					}
				}
				if !issued {
					t.Fatal("ordinary collector did not issue and settle native Effects through the source graph")
				}
				if row.browser && target == TargetClient {
					cached := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-native-collector.ts", Source: source, Target: target, Diagnostics: "semantic"})
					originalEffects, err := json.Marshal(executableSummary(t, response, "invoke").EffectSources)
					if err != nil {
						t.Fatal(err)
					}
					cachedEffects, err := json.Marshal(executableSummary(t, cached, "invoke").EffectSources)
					if err != nil {
						t.Fatal(err)
					}
					if cached.Error != "" || hasErrorDiagnostic(cached.Diagnostics) || cached.Code != response.Code || !bytes.Equal(originalEffects, cachedEffects) {
						t.Fatal("cached Session changed emitted code or public EffectSources")
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

// Per-occurrence registration can describe a native source in a broader body.
// Unmapped input/receiver protocols retain the original consumer. Passive
// registration alone is neither adoption nor pending execution.
func TestStagedNativeCollectorLegacyBoundaries(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		unknown, adopted bool
	}{
		{"independent known and foreign", `declare function foreign():void;export function invoke(){window;foreign();return Object.defineProperty({},'run',{})}`, true, false},
		{"receiver", `export function invoke(){window;return Object.defineProperty({},'run',{get value(){void this;return 1}})}`, false, false},
		{"authored shadow", `const Object={defineProperty(target:object,key:string,descriptor:PropertyDescriptor){window;return target}};export function invoke(){return Object.defineProperty({},'run',{})}`, false, false},
		{"eager key", `function key(){window;return 'run'}export function invoke(){return Object.defineProperty({},key(),{})}`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-native-legacy.ts", Source: row.source, Diagnostics: "semantic"})
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
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name == "invoke" {
					adopted := false
					for _, use := range fact.staged.operationUses {
						for _, recipe := range fact.staged.operationRecipes {
							adopted = adopted || recipe.nativeGet != nil && recipe.key == use.request.producer && recipe.key.selector == (sourceStagedOperationSelector{})
						}
					}
					if adopted != row.adopted {
						t.Fatal("original native consumer adoption", adopted, row.adopted)
					}
				}
			}
		})
	}
}

// This unchanged source first exposed the missing conditional body transport.
// It retains both required donors in ordinary analysis, independently of the
// compile/emitted journeys above. The original failing capture is preserved.
func TestStagedNativeForeignGetterAcceptanceTarget(t *testing.T) {
	const source = `declare function foreign():void;export function invoke(){return Object.defineProperty({},'run',{get value(){window;foreign();return 1}})}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/staged-native-legacy.ts", Source: source, Diagnostics: "semantic"})
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
	for _, source := range []string{
		`export function invoke(){return Object.defineProperty({},'run',{get value(){window;return 1}})}`,
		stagedNestedLiteralCallWitness,
		`export function invoke(prototype:object){return Object.freeze(Object.create(prototype))}`,
	} {
		var previous []byte
		for _, packageType := range []string{"application", "library"} {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/staged-native-definition.ts", Source: source, PackageType: packageType, Diagnostics: "semantic"})
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
