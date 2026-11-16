package exactcompiler

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedReturnedInstalledWitness = `function makeGetter(){return()=>window.name}export function invoke(){Object.defineProperty(Object.prototype,'value',{configurable:true,get:makeGetter()});return Object.defineProperty({},'run',{})}`

// Original member selection, creating B and later inherited Get are all driven
// by source. Installation/value completeness stays independent of the known body.
func TestStagedReturnedInstalledGetSource(t *testing.T) {
	for _, reverse := range []bool{false, true} {
		source := stagedReturnedInstalledWitness
		if reverse {
			source = `declare function foreign():void;` + strings.Replace(source, `function makeGetter(){`, `function makeGetter(){foreign();`, 1)
		}
		withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, reader *ast.Node) {
			facts := installationSourceFacts(query)
			work := callableEffectWork{extracting: -1}
			var writer *ast.Node
			walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && node != reader && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
					writer = node
				}
				return !ast.IsFunctionLike(node)
			})
			if writer == nil {
				t.Fatal("missing original writer")
			}
			calls := []*ast.Node{writer, reader}
			if reverse {
				calls[0], calls[1] = calls[1], calls[0]
			}
			for _, call := range calls {
				registerInstallationSource(t, &work, facts, query, call)
			}
			work.prepareOperationUses(facts, query.executable)
			key := sourceStagedOperationKey{declaration: enclosingCallableNode(reader), operation: reader, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: restrictedInvocationArguments(reader.AsCallExpression())[2], field: "value"}}
			state := work.operations[work.operationIDs[key].index]
			if len(state.getters) != 1 || state.getters[0].installed == nil || !state.getters[0].bodyTransferred {
				t.Fatalf("returned installed getter not consumed: %#v", state.getters)
			}
			getter := state.getters[0]
			exposure := work.operations[getter.installed.exposure.index]
			if len(exposure.delta.exposures) != 1 || exposure.delta.exposures[0].creating == nil {
				t.Fatal("original creating association lost")
			}
			alternative := exposure.delta.exposures[0]
			if getter.installed.creating != alternative.creating {
				t.Fatal("later Get lost its sealed creating association")
			}
			if alternative.endpoint.creation == reader || alternative.endpoint.creation == writer || alternative.endpoint.cut != alternative.creating.request.cut || alternative.endpoint.returning == nil {
				t.Fatal("return/creation moved to later Get")
			}
			resolveCallableEffects(facts, query.executable)
			beforeWork := query.executable.values.work
			work.prepareOperationUses(facts, query.executable)
			if query.executable.values.work != beforeWork {
				t.Fatal("late canonical summary delivery replayed original source acquisition")
			}
			found, unknown := false, false
			for _, effect := range facts[work.memberNodes[key.declaration]].summary.EffectSources {
				found = found || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !found || reverse && !unknown {
				t.Fatal("known returned getter browser donor lost")
			}
			// This observes one graph's prefix after external canonical progress.
			// The dedicated closure and public controls run the whole fixed point.
		})
	}
}

// This is the ordinary public compiler/emission boundary. The staged source
// journey above separately proves the new required consumer, while unrepresented
// target/Value domains keep their existing owners rather than gaining authority.
func TestStagedReturnedInstalledGetPublicTarget(t *testing.T) {
	for _, foreign := range []bool{false, true} {
		source := stagedReturnedInstalledWitness
		if foreign {
			source = `declare function foreign():void;` + strings.Replace(source, `function makeGetter(){`, `function makeGetter(){foreign();`, 1)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/returned-installed.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile %s foreign=%t: %s %#v", target, foreign, response.Error, response.Diagnostics)
			}
			browser, unknown := false, false
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				browser = browser || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || foreign && !unknown {
				t.Fatalf("known/independent unknown lost: browser=%t unknown=%t", browser, unknown)
			}
			issued := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "invoke" {
					continue
				}
				roots := 0
				for _, use := range fact.staged.operationUses {
					if use.request.producer.selector == (sourceStagedOperationSelector{}) && use.request.producer.kind == relativeDemandEffects {
						roots++
					}
				}
				issued = roots == 2 && fact.staged.settled && !fact.staged.operationsPending
				for operation := range fact.staged.legacy {
					if ast.IsCallExpression(operation) {
						t.Fatal("covered original Call retained a recursive legacy prerequisite")
					}
				}
			}
			if !issued {
				t.Fatal("public collector did not issue and settle both original Calls")
			}
			path := filepath.Join(t.TempDir(), "returned.mts")
			if err := os.WriteFile(path, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			for _, mode := range []string{"normal", "throw"} {
				runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0,foreignCalls=0;const failure=new Error('getter');globalThis.window={get name(){reads++;if(process.argv[2]==='throw')throw failure;return 'name'}};globalThis.foreign=()=>foreignCalls++;const m=await import(pathToFileURL(process.argv[1]).href);try{if(process.argv[2]==='throw'){assert.throws(()=>m.invoke(),e=>e===failure)}else{assert.equal(m.invoke().run,'name')}assert.equal(reads,1);assert.equal(foreignCalls,Number(process.argv[3]));if(process.argv[2]==='normal'){assert.throws(()=>m.invoke(),TypeError);assert.equal(reads,2);assert.equal(foreignCalls,2*Number(process.argv[3]))}}finally{delete Object.prototype.value}`
				marker := "0"
				if foreign {
					marker = "1"
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, path, mode, marker).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("runtime %s/%s foreign=%t: %v %s", target, mode, foreign, err, output)
				}
			}
		}
	}
}

func TestStagedReturnedInstalledGetUnsupported(t *testing.T) {
	for _, returned := range []string{`(value=window.name)=>value`, `function(this:{label:string}){return this.label}`, `()=>captured`} {
		source := strings.Replace(stagedReturnedInstalledWitness, `return()=>window.name`, `const captured='saved';return `+returned, 1)
		withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, reader *ast.Node) {
			facts := installationSourceFacts(query)
			work := callableEffectWork{extracting: -1}
			walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
					registerInstallationSource(t, &work, facts, query, node)
				}
				return !ast.IsFunctionLike(node)
			})
			work.prepareOperationUses(facts, query.executable)
			key := sourceStagedOperationKey{declaration: enclosingCallableNode(reader), operation: reader, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: restrictedInvocationArguments(reader.AsCallExpression())[2], field: "value"}}
			if len(work.operations[work.operationIDs[key].index].getters) != 0 {
				t.Fatal("unmapped default/receiver/capture acquired invocation authority")
			}
		})
	}
}

// The supported one-return entry keeps creation separate from a later runtime
// Get. This artifact control does not claim the open public prototype-installation
// analysis target above or complete Value-source coverage.
func TestStagedReturnedGetterArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		source := `function makeGetter(){return()=>window.name}export function invoke(){return Object.defineProperty({},'run',{get:makeGetter(),set:()=>document.title})}`
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/returned-getter-artifact.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			if effect.Environment == "browser" {
				t.Fatal("stored getter or setter body activated by creation")
			}
		}
		path := filepath.Join(t.TempDir(), "getter.mts")
		if err := os.WriteFile(path, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0,writes=0;const failure=new Error('get');globalThis.window={get name(){reads++;if(process.argv[2]==='throw')throw failure;return 'name'}};globalThis.document={get title(){writes++;return 'title'}};const m=await import(pathToFileURL(process.argv[1]).href);const value=m.invoke();assert.equal(reads,0);assert.equal(writes,0);if(process.argv[2]==='throw'){assert.throws(()=>value.run,e=>e===failure)}else{assert.equal(value.run,'name');value.run=1;assert.equal(writes,1)}assert.equal(reads,1);`
		for _, mode := range []string{"normal", "throw"} {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, path, mode).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatalf("%s/%s: %v %s", target, mode, err, output)
			}
		}
	}
}

func TestStagedInstalledSequenceDefinitionSources(t *testing.T) {
	var prior string
	for _, packageType := range []string{"application", "library"} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/installed-definition.ts", Source: stagedReturnedInstalledWitness, PackageType: packageType, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		sources, err := json.Marshal(executableSummary(t, response, "invoke").EffectSources)
		if err != nil {
			t.Fatal(err)
		}
		if prior != "" && prior != string(sources) {
			t.Fatal("definition EffectSources vary by caller package")
		}
		prior = string(sources)
	}
}
