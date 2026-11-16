package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const ambientArgumentSource = `declare const left:number;declare const right:number;
function factory<T,U>(value:T,other:U){return {value,other}}
export function invoke(){return factory(left,right).value}`

// The original collector, real argument references and required Call/BODY all
// close on their ordinary work. An unknown donor does not substitute for DATA.
func TestAmbientArgumentOriginalCallAndLifetime(t *testing.T) {
	for _, row := range []struct {
		name, source string
		effects      int
	}{{"ordered", ambientArgumentSource, 2}, {"duplicate", strings.Replace(ambientArgumentSource, "factory(left,right).value", "factory(left,left).value", 1), 1}} {
		t.Run(row.name, func(t *testing.T) { assertAmbientArgumentOriginalCall(t, row.source, row.effects) })
	}
}

func assertAmbientArgumentOriginalCall(t *testing.T, source string, expectedEffects int) {
	t.Helper()
	var expired []sourceAmbientArgumentRead
	withStagedReturnProgram(t, source, func(initial *executableBodyOwner, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		request := stagedDeclarationCallEffectsRequest(call, enclosingCallableNode(call))
		recipe, ok := work.operationRecipes[request.producer]
		if !ok || recipe.declarationCall == nil || len(recipe.declarationCall.ambientReads) != 2 {
			t.Fatal("UNREACHED: original ambient argument Call source")
		}
		if !validStagedDeclarationCallEffectsRecipe(recipe) || !recipe.delta.extracted || len(recipe.delta.effects) != expectedEffects {
			t.Fatal("typed argument donors were not published", recipe.delta)
		}
		id := work.operationIDs[request.producer]
		if id.epoch != work.operationEpoch || id.index == 0 {
			t.Fatal("UNREACHED: actual argument Effects consumer")
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if state.revision == 0 || !state.delta.extracted || state.invalid || !state.dependenciesRegistered || sub == nil || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision || !work.closedOperationDependencies()[id.index] {
			t.Fatal("original Call Effects/current/APPLIED/BODY closure unpaid")
		}
		if _, current := work.currentDeclarationCallEffects(recipe); !current {
			t.Fatal("source description replaced the original Call association")
		}
		consumer := work.memberNodes[request.consumer]
		unknown := 0
		for _, effect := range collection.facts[consumer].summary.DirectEffectSources {
			if strings.HasPrefix(effect.Description, "external ambient argument read ") {
				unknown++
				if effect.Environment != "unknown" || !effect.Opaque {
					t.Fatal("ambient input became neutral", effect)
				}
			}
		}
		if unknown != expectedEffects {
			t.Fatal("original reference/recipe delivery duplicated or lost argument donors", unknown)
		}
		for i, read := range recipe.declarationCall.ambientReads {
			if read.call != call || read.ordinal != i || read.argument != call.AsCallExpression().Arguments.Nodes[i] || read.cut.reading != read.argument || read.reference.declaration == nil {
				t.Fatal("original argument order/identity lost")
			}
		}
		// Mutable output copies cannot alter the immutable shared classification.
		first := recipe.declarationCall.ambientReads[0]
		copyEffects := ambientReferenceEffectsForOwner(first.reference.effects, "other")
		copyEffects[0].Description = "changed"
		copyEffects[0].Path[0] = "changed"
		if first.reference.effects[0].Description == "changed" || first.reference.effects[0].Path[0] != "" {
			t.Fatal("publisher mutated cached source classification")
		}
		invalid := recipe
		invalid.declarationCall = cloneStagedDeclarationCall(recipe.declarationCall)
		invalid.declarationCall.ambientReads[0].ordinal = 1
		if validStagedDeclarationCallEffectsRecipe(invalid) || recipe.declarationCall.ambientReads[0].ordinal != 0 {
			t.Fatal("foreign ordinal or clone mutation borrowed source")
		}
		invalid = recipe
		invalid.delta = cloneOperationDelta(recipe.delta)
		invalid.delta.effects[0].Environment = "neutral"
		if validStagedDeclarationCallEffectsRecipe(invalid) {
			t.Fatal("unmatched donor passed the typed recipe")
		}
		cloned := append([]callableFacts(nil), collection.facts...)
		for i := range cloned {
			cloned[i].staged = cloneCallableExtraction(cloned[i].staged)
		}
		fresh := registerCallableEffectWork(cloned)
		fresh.operationGeneration = work.operationGeneration
		copied := fresh.operationRecipes[request.producer]
		if fresh.passiveDeclarationCallEffectsReady(copied) {
			t.Fatal("cloned classification inherited graph source observation")
		}
		expired = append([]sourceAmbientArgumentRead(nil), recipe.declarationCall.ambientReads...)
	})
	if len(expired) == 0 {
		t.Fatal("UNREACHED: expired source control")
	}
	if ambientArgumentReadsCurrent(expired, expired[0].reference.generation) {
		t.Fatal("released generation retained ambient currentness")
	}
}

// A genuine passive source has no canonical Call or BODY delivery. Its runtime
// uncertainty cannot pay missing compiler-owned work in a fresh graph.
func TestAmbientArgumentPassiveSourceKeepsCompilerDebt(t *testing.T) {
	withStagedReturnProgram(t, ambientArgumentSource, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		caller := work.memberNodes[enclosingCallableNode(call)]
		request, ok := work.registerStagedDeclarationCallEffects(facts, caller, call, owner)
		if !ok {
			t.Fatal("UNREACHED: authenticated passive ambient source")
		}
		recipe := work.operationRecipes[request.producer]
		if len(recipe.declarationCall.ambientReads) != 2 || len(recipe.delta.effects) != 2 || !recipe.delta.extracted {
			t.Fatal("passive source lost its conditional argument Effects")
		}
		id, ok := work.requireOperation(facts, request)
		if !ok {
			t.Fatal("source dependency refused")
		}
		work.prepareOperationUses(facts, owner)
		if len(facts[caller].staged.calls) != 0 || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("ambient uncertainty fabricated original Call")
		}
		if _, current := work.currentDeclarationCallEffects(work.operationRecipes[request.producer]); current || work.closedOperationDependencies()[id.index] {
			t.Fatal("unknown argument paid missing Call/BODY")
		}
	})
}

// Emission retains argument order, duplicate reads and abrupt completion. This
// is ordinary authored code, not permission to mount an unknown native target.
func TestAmbientArgumentEmissionOrderAndThrow(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, row := range []struct{ name, source string }{{"ordered", ambientArgumentSource}, {"duplicate", strings.Replace(ambientArgumentSource, "factory(left,right).value", "factory(left,left).value", 1)}} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/ambient-arguments.ts", Source: row.source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(target, response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "invoke")
			if !containsEnvironment(summary.EffectSources, "unknown") {
				t.Fatal("authentic ambient read lost runtime uncertainty")
			}
			filename := filepath.Join(t.TempDir(), "ambient.mts")
			if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let events=[];let fail=false;const error=new Error('left');Object.defineProperty(globalThis,'left',{configurable:true,get(){events.push('left');if(fail)throw error;return 11}});Object.defineProperty(globalThis,'right',{configurable:true,get(){events.push('right');return 22}});const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.invoke(),11);assert.deepEqual(events,process.argv[2]==='duplicate'?['left','left']:['left','right']);events=[];fail=true;assert.throws(()=>m.invoke(),e=>e===error);assert.deepEqual(events,['left']);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename, row.name).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatal(target, err, string(output))
			}
		}
	}
}

const ambientComponentSource = `/// <reference path="./jsx-types.d.ts" />
declare const input:number;function select(value:number){return {value}}
export function Child(){return()=> <p>{select(input).value}</p>}`

// PackageType is real compiler input. Render uncertainty and complete portable
// metadata must agree; legacy coordination labels are not render capability.
func TestAmbientArgumentPortableUnknownContract(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			root := t.TempDir()
			id := filepath.Join(root, "child.tsx")
			if err := os.WriteFile(filepath.Join(root, "jsx-types.d.ts"), []byte(`declare namespace JSX{interface Element{}interface IntrinsicElements{p:{children?:unknown}}}`), 0600); err != nil {
				t.Fatal(err)
			}
			var baseline Response
			for _, packageType := range []string{"application", "library"} {
				response := NewSession().Execute(Request{Kind: "compile", ID: id, Root: root, Source: ambientComponentSource, Target: target, PackageType: packageType})
				if response.Error != "" {
					t.Fatal("original ambient component", response.Error, response.Diagnostics)
				}
				c := findComponent(t, response.Analysis.Components, "Child")
				if c.RenderCapability != (ComponentRenderCapability{Server: "unknown", Client: "unknown"}) {
					t.Fatal("unknown read became target execution authority", c)
				}
				// Render uncertainty comes from the authentic original argument READ,
				// not a missing compiler task or a legacy placement diagnostic.
				read := false
				for _, callable := range response.Analysis.Callables {
					for _, effect := range callable.DirectEffectSources {
						if effect.Description == "external ambient argument read input" {
							read = true
							if effect.Environment != "unknown" || !effect.Opaque {
								t.Fatal("ambient argument READ lost uncertainty", effect)
							}
						}
					}
				}
				if !read {
					t.Fatal("UNREACHED: published original ambient argument READ")
				}
				if packageType == "application" {
					baseline = response
				} else if baseline.Code != response.Code || !reflect.DeepEqual(baseline.Analysis.Components, response.Analysis.Components) || !reflect.DeepEqual(baseline.Diagnostics, response.Diagnostics) {
					t.Fatal("package context changed portable unknown contract")
				}
			}
		})
	}
}

// Real source replacement and disposal must renew semantic classification while
// retaining unknown render capability; a local initializer is not an ambient read.
func TestAmbientArgumentRetainedReplacement(t *testing.T) {
	root := t.TempDir()
	id := filepath.Join(root, "child.tsx")
	if err := os.WriteFile(filepath.Join(root, "jsx-types.d.ts"), []byte(`declare namespace JSX{interface Element{}interface IntrinsicElements{p:{children?:unknown}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	for i, source := range []string{ambientComponentSource, ambientComponentSource, strings.Replace(ambientComponentSource, "declare const input:number;", "const input=1;", 1), ambientComponentSource} {
		request := Request{Kind: "compile", ID: id, Root: root, Source: source, Target: TargetClient, PackageType: "application"}
		response := session.Execute(request)
		fresh := NewSession().Execute(request)
		if response.Error != "" || response.Error != fresh.Error || response.Code != fresh.Code || !reflect.DeepEqual(response.Diagnostics, fresh.Diagnostics) || !reflect.DeepEqual(response.Analysis.Components, fresh.Analysis.Components) {
			t.Fatal("retained source differs from fresh", i, response.Error, fresh.Error)
		}
		c := findComponent(t, response.Analysis.Components, "Child")
		want := ComponentRenderCapability{Server: "unknown", Client: "unknown"}
		if i == 2 {
			want = ComponentRenderCapability{Server: "supported", Client: "supported"}
		}
		if c.RenderCapability != want {
			t.Fatal("source identity retained stale ambient classification", i, c)
		}
		if i == 2 && response.Code == "" {
			t.Fatal("known local initializer lost its qualified output")
		}
	}
	if result := session.Execute(Request{Kind: "reset"}); result.Error != "" {
		t.Fatal(result.Error)
	}
	response := session.Execute(Request{Kind: "compile", ID: id, Root: root, Source: ambientComponentSource, Target: TargetClient, PackageType: "application"})
	if response.Error != "" || findComponent(t, response.Analysis.Components, "Child").RenderCapability != (ComponentRenderCapability{Server: "unknown", Client: "unknown"}) {
		t.Fatal("reset reused or lost ambient source", response.Error)
	}
}

// These are classification/API refusers, not claims that every older input
// family already completes public compilation. Their independent owners remain.
func TestAmbientArgumentReadScopeRefusers(t *testing.T) {
	const factory = `function factory<T>(value:T){return {value}}`
	rows := []struct {
		name, source string
		sources      map[string]string
		unresolved   bool
	}{
		{name: "shadow", source: `declare const input:number;` + factory + `export function invoke(input:number){return factory(input)}`},
		{name: "initialized", source: `const input=1;` + factory + `export function invoke(){return factory(input)}`},
		{name: "initialized-source-supplier", source: `declare function supplier():number;const input=supplier();` + factory + `export function invoke(){return factory(input)}`},
		{name: "merged-runtime-declaration", source: `declare var input:number;var input=3;` + factory + `export function invoke(){return factory(input)}`},
		{name: "written-ambient", source: `declare let input:number;` + factory + `export function invoke(){input=3;return factory(input)}`},
		{name: "unresolved", source: factory + `export function invoke(){return factory(missing)}`, unresolved: true},
		{name: "getter", source: `const holder={get value(){return 1}};` + factory + `export function invoke(){return factory(holder.value)}`},
		{name: "ambient-function-value", source: `declare function input():number;` + factory + `export function invoke(){return factory(input)}`},
		{name: "nested-shorthand", source: `declare const input:number;` + factory + `export function invoke(){return factory({input})}`},
		{name: "captured-formal", source: factory + `export function invoke(input:number){return()=>factory(input)}`},
		{name: "default-owned", source: `declare const input:number;function factory(value=input){return {value}}export function invoke(){return factory()}`},
		{name: "import", source: `import {input} from './arg-dep.js';` + factory + `export function invoke(){return factory(input)}`, sources: map[string]string{"/virtual/arg-dep.ts": `export const input=3;`}},
		{name: "re-export", source: `import {input} from './arg-dep.js';` + factory + `export function invoke(){return factory(input)}`, sources: map[string]string{"/virtual/arg-dep.ts": `export{value as input}from'./arg-origin.js';`, "/virtual/arg-origin.ts": `export const value=3;`}},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			withAmbientArgumentProgram(t, row.source, row.sources, row.unresolved, func(owner *executableBodyOwner, call *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
				work := registerCallableEffectWork(facts)
				restore := registerWriterInputFacts(owner, facts)
				defer restore()
				caller, known := work.memberNodes[enclosingCallableNode(call)]
				if !known {
					t.Fatal("UNREACHED: original refuser caller")
				}
				request, registered := work.registerStagedDeclarationCallEffects(facts, caller, call, owner)
				if registered {
					recipe := work.operationRecipes[request.producer]
					if len(recipe.declarationCall.ambientReads) != 0 {
						t.Fatal("unsupported source was replaced by external ambient uncertainty")
					}
					for _, effect := range recipe.delta.effects {
						if strings.HasPrefix(effect.Description, "external ambient argument read ") {
							t.Fatal("unsupported input received ambient donor")
						}
					}
					if row.name == "getter" && recipe.delta.extracted && len(recipe.delta.required) == 0 {
						t.Fatal("argument Get lost its independent owner")
					}
				}
				if owner.ambientArgumentReferences != nil && len(owner.ambientArgumentReferences.entries) != 0 {
					t.Fatal("refused input entered positive-only ambient cache")
				}
			})
		})
	}
}

// This helper uses an ordinary active Program/checker lease and exact virtual
// source dependencies. Only the explicit unresolved-symbol negative admits2304.
func withAmbientArgumentProgram(t *testing.T, source string, dependencies map[string]string, unresolved bool, inspect func(*executableBodyOwner, *ast.Node)) {
	t.Helper()
	const id = "/virtual/ambient-refusers.ts"
	sources := map[string]string{id: source}
	for name, text := range dependencies {
		sources[name] = text
	}
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, sources)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	unresolvedSeen := false
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		converted := projectDiagnostic(diagnostic)
		if converted.Code == "TS2304" && unresolved {
			unresolvedSeen = true
			continue
		}
		if hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal("semantic refuser fixture", converted)
		}
	}
	if unresolved != unresolvedSeen {
		t.Fatal("unresolved negative did not reach its intended diagnostic")
	}
	var call *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "factory" {
			call = node
		}
		return true
	})
	if call == nil {
		t.Fatal("UNREACHED: original refuser factory Call")
	}
	inspect(newExecutableBodyOwner(project, generation.checker), call)
}

// Known browser requirements must survive beside the new uncertainty. This
// asserts the target render refusal, rather than treating artifact lists as proof.
func TestAmbientArgumentKnownBrowserAndUnknown(t *testing.T) {
	root := t.TempDir()
	id := filepath.Join(root, "child.tsx")
	if err := os.WriteFile(filepath.Join(root, "jsx-types.d.ts"), []byte(`declare namespace JSX{interface Element{}interface IntrinsicElements{p:{children?:unknown}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	source := strings.Replace(ambientComponentSource, "return()=> <p>{select(input).value}</p>", "return()=>{void window;return <p>{select(input).value}</p>}", 1)
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: id, Root: root, Source: source, Target: target, PackageType: "application"})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		c := findComponent(t, response.Analysis.Components, "Child")
		if c.RenderCapability.Server != "unsupported" || c.RenderCapability.Client != "unknown" {
			t.Fatal("unknown absorbed known browser target refusal", c)
		}
		browser, unknown := false, false
		for _, summary := range response.Analysis.Callables {
			browser = browser || containsEnvironment(summary.EffectSources, "browser")
			unknown = unknown || containsEnvironment(summary.EffectSources, "unknown")
		}
		if !browser || !unknown {
			t.Fatal("known browser/independent runtime uncertainty lost")
		}
	}
}
