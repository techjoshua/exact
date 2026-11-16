package exactcompiler

import (
	"context"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This source control uses the unchanged owned composition. It requests its
// actual four original module Symbol sites without running unrelated legacy
// function consumers. Facts supply original source ownership only. They are not
// marked extracted, so import publication must remain independently pending.
func TestStagedModuleActivationUnchangedCompositionSites(t *testing.T) {
	const id = "/virtual/component-abi/opaque-operation.ts"
	sources := map[string]string{id: writerInputOpaqueComposition, "/virtual/component/contract-versions.ts": `export const componentContractVersion=6;`, "/virtual/component/contracts.ts": `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`}
	request := Request{Kind: "analyze", ID: id, Source: writerInputOpaqueComposition, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectStateWithSources(request, id, sources)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, writerInputOpaqueComposition)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		converted := projectDiagnostic(diagnostic)
		if hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	facts := []callableFacts{}
	for _, path := range []string{id, "/virtual/component/contract-versions.ts", "/virtual/component/contracts.ts"} {
		file := project.program.GetSourceFile(path)
		if file == nil {
			t.Fatal("original selected dependency missing", path)
		}
		for _, node := range collectCallableNodes(file) {
			name, kind, _ := callableIdentity(node, nil)
			facts = append(facts, callableFacts{node: node, sourceFile: file, summary: CallableSummary{ID: fmt.Sprintf("callable:%s:%d", file.FileName(), node.Pos()), Name: name, Kind: kind}})
		}
	}
	work := callableEffectWork{extracting: -1}
	work.indexOperationSources(facts)
	calls := []*ast.Node{}
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && sourceStagedModuleOwner(node) != nil && stagedNativeInputIntent(node.Expression()) == sourceNativeSymbolFor {
			calls = append(calls, node)
		}
		return true
	})
	if len(calls) != 4 {
		t.Fatal("unchanged original four module sites missing", len(calls))
	}
	for ordinal, call := range calls {
		declaration := sourceStagedModuleOwner(call)
		occurrence, supported := work.describeNativeInputOccurrence(facts, work.memberNodes[declaration], call, owner)
		if !supported {
			t.Fatal("original module callee still requires recursive writer recovery", ordinal, call.Pos())
		}
		if occurrence.callee == nil || !occurrence.callee.noUserEntry {
			t.Fatal("original callee source has no positive no-user-entry contribution", ordinal)
		}
		if !work.adoptNativeInputOccurrence(facts, occurrence) {
			t.Fatal("represented original site not adopted", ordinal)
		}
		if len(work.operationRecipes[occurrence.source.request.producer].nativeGet.activationImports) == 0 {
			t.Fatal("actual import initialization requirements missing", ordinal)
		}
	}
	work.prepareOperationUses(facts, owner)
	// Import facts were deliberately not extracted by this source-only harness.
	// No source no-entry receipt may manufacture their publication or artifacts.
	closed := work.closedOperationDependencies()
	for _, call := range calls {
		key := sourceStagedOperationKey{declaration: sourceStagedModuleOwner(call), operation: call, kind: relativeDemandEffects}
		id, known := work.operationIDs[key]
		if !known || closed[id.index] {
			t.Fatal("original import availability was paid by source no-entry law")
		}
	}
}

// These controls request only the original callee Get. Later actual evaluation
// remains an independent producer and cannot move a writer before this cut.
func TestStagedModuleActivationOriginalCalleeOrder(t *testing.T) {
	for _, row := range []struct {
		name, source    string
		module, noEntry bool
	}{
		{"deferred writer", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}const key=Symbol.for('key');export function invoke(){return key}`, true, true},
		{"deferred protocol", `declare function foreign():void;function latent(){window.name;foreign()}const key=Symbol.for('key');export function invoke(){return key}`, true, true},
		{"unprovided global binding read", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}const scope=globalThis;const key=Symbol.for('key');export function invoke(){return{scope,key}}`, true, false},
		{"authored global binding accessor", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}Object.defineProperty(globalThis,'globalThis',{get(){window.name;rewrite();return{}}});const scope=globalThis;const key=Symbol.for('key');export function invoke(){return{scope,key}}`, true, false},
		{"shadowed global binding", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}declare const globalThis:typeof window;const scope=globalThis;const key=Symbol.for('key');export function invoke(){return{scope,key}}`, true, false},
		{"later argument writer", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}const key=Symbol.for((rewrite(),'key'));export function invoke(){return key}`, true, true},
		{"earlier user entry", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}rewrite();const key=Symbol.for('key');export function invoke(){return key}`, true, false},
		{"function prior invocation state", `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}export function invoke(){return Symbol.for('key')}`, false, false},
		{"function prior protocol", `declare function foreign():void;function latent(){window.name;foreign()}export function invoke(){return Symbol.for('key')}`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			const id = "/virtual/module-activation-order.ts"
			project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: row.source, Diagnostics: "semantic"}, id, map[string]string{id: row.source})
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), id, row.source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
				if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
					t.Fatal(converted)
				}
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			var call *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && stagedNativeInputIntent(node.Expression()) == sourceNativeSymbolFor {
					call = node
				}
				return true
			})
			if call == nil {
				t.Fatal("original Symbol call")
			}
			declaration := sourceStagedModuleOwner(call)
			if !row.module {
				declaration = enclosingCallableNode(call)
			}
			var facts []callableFacts
			for _, node := range collectCallableNodes(generation.sourceFile) {
				facts = append(facts, callableFacts{node: node, sourceFile: generation.sourceFile, summary: CallableSummary{ID: fmt.Sprintf("callable:%d", node.Pos())}})
			}
			work := callableEffectWork{extracting: -1}
			work.indexOperationSources(facts)
			fact := &facts[work.memberNodes[declaration]]
			request, valid := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, "module-order")
			if !valid {
				t.Fatal("original call partition")
			}
			occurrence := sourceStagedNativeOccurrence{}
			query := newSourceDependencyQuery(call, owner.checker, owner, declaration)
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: call, get: call.Expression(), request: request, algorithmKind: sourceNativeSymbolFor, occurrence: &occurrence})
			if !installed {
				t.Fatal("original callee interval")
			}
			query.receiverCandidates(call, nil)
			revoke()
			conditionalBinding := row.name == "unprovided global binding read" || row.name == "authored global binding accessor" || row.name == "shadowed global binding"
			if row.name == "deferred protocol" || row.name == "function prior protocol" || conditionalBinding {
				protocols := 0
				for _, recipe := range work.operationRecipes {
					source := recipe.memberSource
					if source == nil || !sameOperationRequest(source.parent, request) || !source.candidate.protocol || source.candidate.region == nil || source.moduleExcluded == nil {
						continue
					}
					protocols++
					proof := source.moduleExcluded
					if !validStagedMemberRecipe(recipe) || !stagedModuleProtocolReadOwned(request, proof) || !sameOperationRequest(proof.source.request, request) || proof.source.generation != owner.values.generation {
						t.Fatal("deferred protocol lost its original pre-argument source phase")
					}
				}
				if (protocols != 0) != (row.module && row.noEntry) {
					t.Fatal("protocol handoff missing or function history borrowed module prefix", protocols)
				}
			}
			got := occurrence.callee != nil && occurrence.callee.noUserEntry
			if !conditionalBinding && row.name != "function prior protocol" && got != row.noEntry {
				t.Fatalf("original callee no-user-entry=%v want=%v", got, row.noEntry)
			}
			if got && row.noEntry {
				excluded := 0
				for _, recipe := range work.operationRecipes {
					if recipe.memberSource == nil || !sameOperationRequest(recipe.memberSource.parent, request) || recipe.memberSource.candidate.region == nil {
						continue
					}
					if recipe.memberSource.candidate.protocol {
						// This is exclusion of an earlier activation, not execution
						// of the protocol or the current callee Get. Both retain their
						// own source owners and required input/body producers.
						proof := recipe.memberSource.moduleExcluded
						if proof == nil {
							if !validOperationEnvelope(recipe) || recipe.delta.extracted && recipe.memberSource.protocolSource == nil {
								t.Fatal("unrepresented protocol acquired extraction authority")
							}
							continue // Another original protocol owner retains this child.
						}
						if !row.module || !proof.supported || !proof.accounted || !stagedModuleProtocolReadOwned(request, proof) || !sameOperationRequest(proof.source.request, request) || proof.source.cut != recipe.memberSource.candidate.cut || recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 {
							t.Fatal("protocol exclusion lost its original prior-activation authority")
						}
						excluded++
						continue
					}
					if recipe.memberSource.moduleExcluded == nil || recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 {
						t.Fatal("module exclusion did not reach original deferred source ticket")
					}
					excluded++
					id, accepted := work.requireOperation(facts, recipe.memberSource.request)
					if !accepted || !work.publishStagedModuleWriterExclusion(facts, id) || !work.operations[id.index].delta.extracted {
						t.Fatal("original graph module exclusion not published")
					}
					cloned := cloneCallableExtraction(sourceCallableExtractionFact{operationRecipes: []sourceStagedOperationRecipe{recipe}})
					if cloned.operationRecipes[0].delta.extracted || cloned.operationRecipes[0].memberSource.moduleExcluded != nil {
						t.Fatal("clone retained original module exclusion authority")
					}
				}
				if excluded == 0 {
					t.Fatal("no actual deferred writer source ticket exercised")
				}
				for _, recipe := range work.operationRecipes {
					if recipe.nativeGet == nil || recipe.nativeGet.calleeEntry == nil {
						continue
					}
					cloned := cloneCallableExtraction(sourceCallableExtractionFact{operationRecipes: []sourceStagedOperationRecipe{recipe}})
					if cloned.operationRecipes[0].nativeGet.calleeEntry != nil {
						t.Fatal("clone retained live module callee disposition")
					}
				}
			}
		})
	}
}

// Public output still follows the original JavaScript execution. The deferred
// writer is emitted but does not run while the earlier module key is evaluated.
func TestStagedModuleActivationPublicArtifacts(t *testing.T) {
	const source = `function rewrite(){Symbol.for=(name:string)=>Symbol(name)}const key=Symbol.for('module-key');export function invoke(){return key}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/module-entry-public.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			if effect.Environment == "browser" || effect.Environment == "unknown" {
				t.Fatal("deferred writer leaked into module binding", effect)
			}
		}
		runStagedKeyModule(t, response.Code, `assert.equal(m.invoke(),Symbol.for('module-key'));assert.equal(reads,0);`)
	}
}

// Selected import source laws and selected initialization availability remain
// separate. Missing, cyclic or user-entering initialization cannot be erased by
// a quiet local prefix or by a declarative imported binding read.
func TestStagedModuleActivationSelectedImports(t *testing.T) {
	for _, row := range []struct {
		name, dependency, other string
		noEntry                 bool
	}{
		{"inert selected initializer", `export const version=6;`, "", true},
		{"selected user entry", `function init(){window.name}init();export const version=6;`, "", false},
		{"selected cycle", `import{other}from'./other';export const version:number=other;`, `import{version}from'./dependency';export const other:number=version;`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			const id = "/virtual/module-import-entry.ts"
			const source = `import{version}from'./dependency';function rewrite(){Symbol.for=(name:string)=>Symbol(name)}const key=Symbol.for('key');export function invoke(){return [key,version]}`
			sources := map[string]string{id: source, "/virtual/dependency.ts": row.dependency}
			if row.other != "" {
				sources["/virtual/other.ts"] = row.other
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
			for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
				if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
					t.Fatal(converted)
				}
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			var facts []callableFacts
			for path := range sources {
				file := project.program.GetSourceFile(path)
				if file == nil {
					t.Fatal("selected original source absent", path)
				}
				for _, node := range collectCallableNodes(file) {
					facts = append(facts, callableFacts{node: node, sourceFile: file, summary: CallableSummary{ID: fmt.Sprintf("callable:%s:%d", path, node.Pos())}})
				}
			}
			var call *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && stagedNativeInputIntent(node.Expression()) == sourceNativeSymbolFor {
					call = node
				}
				return true
			})
			if call == nil {
				t.Fatal("original key Call")
			}
			declaration := sourceStagedModuleOwner(call)
			work := callableEffectWork{extracting: -1}
			work.indexOperationSources(facts)
			request, ok := sourceStagedOccurrenceRequest(&facts[work.memberNodes[declaration]], call, relativeDemandEffects, "selected-module-entry")
			if !ok {
				t.Fatal("original occurrence")
			}
			query := newSourceDependencyQuery(call, owner.checker, owner, declaration)
			occurrence := sourceStagedNativeOccurrence{}
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: call, get: call.Expression(), algorithmKind: sourceNativeSymbolFor, request: request, occurrence: &occurrence})
			if !installed {
				t.Fatal("original callee issuer")
			}
			query.receiverCandidates(call, nil)
			revoke()
			if got := occurrence.callee != nil && occurrence.callee.noUserEntry; got != row.noEntry {
				t.Fatalf("selected import no-user-entry=%v want=%v", got, row.noEntry)
			}
		})
	}
}
