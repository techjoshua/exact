package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// The production module prefix includes an actual descriptor-map conversion,
// freeze and deferred writer before the next native callee. Each algorithm law
// must be consumed through its original required graph, not empty Effects.
func TestStagedNativeAlgorithmEntryModuleComposition(t *testing.T) {
	const source = `declare function foreign():void;function latent(target:Record<PropertyKey,unknown>,key:PropertyKey){window.name;foreign();target[key]=()=>document.title;Object.defineProperty(target,key,{value:()=>document.title})}const mapKey=Symbol.for('map-key');export const prefix=Object.freeze(Object.defineProperties({}, {tag:{value:true},[mapKey]:{value:7},callback:{value:()=>document.title}}));export const store=new WeakMap<object,unknown>();export const second=new WeakMap<object,unknown>();export const key=Symbol.for('entry-law');export function invoke(){return prefix}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/native-algorithm-entry.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			logStagedConstructionSessionFailure(t, session)
			for _, fact := range stagedDeclarationFacts(session) {
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.constructionEffects != nil || recipe.entryLaw != nil {
						t.Logf("entry source operation=%s@%d field=%s extracted=%t required=%#v", recipe.key.operation.Kind, recipe.key.operation.Pos(), recipe.key.selector.field, recipe.delta.extracted, recipe.delta.required)
					}
				}
			}
			t.Fatal(response.Error, response.Diagnostics)
		}
		facts := stagedDeclarationFacts(session)
		freezeInput := false
		recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
		for _, fact := range facts {
			for _, recipe := range fact.staged.operationRecipes {
				recipes[recipe.key] = recipe
			}
		}
		seen := make(map[sourceStagedOperationKey]bool)
		usedMapLaw, usedConstructions := false, 0
		var visit func(sourceStagedOperationRequest)
		visit = func(request sourceStagedOperationRequest) {
			if seen[request.producer] {
				return
			}
			seen[request.producer] = true
			recipe := recipes[request.producer]
			if law := recipe.entryLaw; law != nil {
				if law.kind == stagedEntryLawNativeAlgorithm {
					source := recipes[law.base.producer].nativeGet
					usedMapLaw = usedMapLaw || source != nil && source.kind == sourceNativeObjectDefineProperties
				}

			}
			for _, child := range recipe.delta.required {
				visit(child)
			}
			if source := recipe.memberSource; source != nil && source.moduleExcluded != nil {
				for _, child := range source.moduleExcluded.required {
					visit(child)
				}
			}
		}
		for _, fact := range facts {
			if !runtimeModuleEvaluation(fact.node) {
				continue
			}
			if !fact.staged.settled || fact.staged.operationsPending {
				t.Fatal("original module source did not settle")
			}
			for _, effect := range fact.summary.EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatal("latent body activated in module", effect)
				}
			}
			for _, recipe := range fact.staged.operationRecipes {
				if source := recipe.constructionEffects; source != nil && source.phase == "callee" {
					for _, required := range recipe.delta.required {
						if required.producer.operation == recipe.key.operation && required.producer.selector.field == "no-user-entry:construction" {
							t.Fatal("current New admission paid its own preceding callee Get")
						}
					}
				}
				if source := recipe.nativeGet; source != nil && source.kind == sourceNativeObjectFreeze && recipe.key == nativeRootDebtRequest(source, "algorithm").producer && validStagedNativeInputSource(source) {
					for _, required := range recipe.delta.required {
						child := recipes[required.producer].nativeGet
						freezeInput = freezeInput || sameOperationRequest(required, source.inputSource) && child != nil && child.kind == sourceNativeObjectDefineProperties
					}
				}
				if recipe.entryLaw == nil || recipe.entryLaw.kind != stagedEntryLawNativeAlgorithm {
					continue
				}
				if len(recipe.delta.required) < 2 {
					t.Fatal("algorithm lost original Effects/Get dependencies")
				}
			}
			for _, use := range fact.staged.operationUses {
				visit(use.request)
				if source := recipes[use.request.producer].constructionEffects; source != nil && source.phase == "" && sameOperationRequest(source.root, use.request) {
					usedConstructions++
				}
			}
		}
		if !usedMapLaw || !freezeInput || usedConstructions != 2 {
			t.Fatal("actual production module lost consumed map law, freeze input or original New adoption", usedMapLaw, freezeInput, usedConstructions)
		}
		file := filepath.Join(t.TempDir(), "native-algorithm-entry.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		runner := `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';Object.defineProperty(globalThis,'window',{configurable:true,get(){throw Error('latent window')}});Object.defineProperty(globalThis,'document',{configurable:true,get(){throw Error('dormant document')}});globalThis.foreign=()=>{throw Error('latent foreign')};assert.equal(Reflect.defineProperty(WeakMap,'prototype',{get(){throw Error('replacement prototype')}}),false);const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.prefix.tag,true);assert.equal(m.prefix[Symbol.for('map-key')],7);assert.equal(Object.isFrozen(m.prefix),true);assert.equal(m.invoke(),m.prefix);assert.equal(Object.getPrototypeOf(m.store),WeakMap.prototype);assert.equal(Object.getPrototypeOf(m.second),WeakMap.prototype);assert.notEqual(m.store,m.second);assert.equal(m.key,Symbol.for('entry-law'));`
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatal(err, string(output))
		}
	}
}

// Algorithm entry begins after actual evaluation. An eager computed-key Call
// must retain its own known body and external alternative before the next Get.
func TestStagedNativeAlgorithmEntryKeepsEagerChildren(t *testing.T) {
	const source = `declare function foreign():void;function makeKey(){window.name;foreign();return 'tag'}const prefix=Object.freeze(Object.defineProperties({}, {[makeKey()]:{value:true}}));export const store=new WeakMap<object,unknown>();export function invoke(){return prefix}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/native-algorithm-eager.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2101") || response.Code != "" {
			t.Fatal("eager user entry lost module placement requirement", response.Error, response.Diagnostics)
		}
		browser, unknown := false, false
		for _, fact := range stagedDeclarationFacts(session) {
			if !runtimeModuleEvaluation(fact.node) {
				continue
			}
			for _, effect := range fact.summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown" && effect.Opaque
			}
		}
		if !browser || !unknown {
			t.Fatal("algorithm law dropped eager known/unknown contributions", browser, unknown)
		}
	}
}
