package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

const symbolPrimitiveModuleInput = `export{};const incompatibleTag=Symbol.for('@exactjs/component-input-incompatibility');export function probe(value:unknown){if(typeof value!=='object'||value===null)return false;return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value===true}`

// The first positive is an original collector connection, not a manufactured
// selected value or an expression-only result. Target descriptor closure is a
// separate role: this control pays only the actual key DATA relationship.
func TestSelectedSymbolPrimitiveModuleDescriptorInput(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"original-module-key", symbolPrimitiveModuleInput},
		{"immutable-key-alias", strings.Replace(symbolPrimitiveModuleInput, "export function probe", "const alias=incompatibleTag;export function probe", 1)},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.source
			if row.name == "immutable-key-alias" {
				source = strings.Replace(source, "Descriptor(value,incompatibleTag)", "Descriptor(value,alias)", 1)
			}
			var retained *callableEffectWork
			var detached sourceRelativeEndpoint
			withSymbolPrimitiveCollection(t, source, func(collection *projectCallableCollection, _ *ast.SourceFile) {
				detached = symbolPrimitiveOriginalInput(t, collection)
				retained = &collection.work
				copy := cloneSourceRelativeEndpoint(detached)
				if !sameOperationEndpoint(copy, detached) || copy.nativePrimitive == detached.nativePrimitive || &copy.nativePrimitive.inputData[0] == &detached.nativePrimitive.inputData[0] {
					t.Fatal("primitive DATA clone aliases description or loses semantic equality")
				}
				copy.nativePrimitive.method = nil
				if sameOperationEndpoint(copy, detached) || validNativePrimitiveEndpoint(copy) {
					t.Fatal("changed method borrowed primitive source")
				}
				if detached.expression != nil || detached.kind != relativeEndpointNativePrimitive || detached.moduleConstruction != nil || detached.descriptorView != nil || detached.frameworkView != nil || detached.constructionCallable != nil {
					t.Fatal("primitive result promoted to raw/object/descriptor source")
				}
				if stagedSourceDataValue(detached.expression) {
					t.Fatal("primitive description gained raw literal/native admission")
				}
				primitive := detached.nativePrimitive
				wrong := cloneNativePrimitiveResult(primitive)
				wrong.request.cut.reading = primitive.method
				if collection.work.nativePrimitiveSourceCurrent(wrong) {
					t.Fatal("foreign primitive cut borrowed original source")
				}
				foreign := primitive.request
				foreign.edge += ":copied-description"
				if _, applied := collection.work.nativePrimitiveDataApplied(foreign); applied {
					t.Fatal("copied description manufactured an unregistered reader")
				}
				ordinary := collection.work.operationRecipes[primitive.request.producer]
				if collection.work.nativeResultSource(ordinary) != nil || collection.work.stagedNativeResultNoncallable(ordinary) {
					t.Fatal("primitive source entered ordinary/native-object result rights")
				}
			})
			if retained == nil || retained.nativePrimitiveSourceCurrent(detached.nativePrimitive) {
				t.Fatal("released generation retained primitive currentness")
			}
		})
	}
}

func withSymbolPrimitiveCollection(t *testing.T, source string, inspect func(*projectCallableCollection, *ast.SourceFile)) {
	t.Helper()
	withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file) // First normal resolve only; unrelated target roles can remain pending.
		inspect(collection, file)
	})
}

func symbolPrimitiveOriginalInput(t *testing.T, collection *projectCallableCollection) sourceRelativeEndpoint {
	t.Helper()
	work := &collection.work
	primitiveApplied, inputApplied := false, false
	var endpoint sourceRelativeEndpoint
	for _, recipe := range work.operationRecipes {
		if recipe.callResult == nil || !recipe.callResult.nativeCall || !nativePrimitivePayloadPresent(recipe) {
			continue
		}
		data, applied := work.nativePrimitiveDataApplied(recipe.callResult.request)
		if !applied || !data.delta.extracted || len(data.delta.exposures) != 1 {
			continue
		}
		value := data.delta.exposures[0]
		if value.creating != nil || !validNativePrimitiveEndpoint(value.endpoint) || !work.nativePrimitiveSourceCurrent(value.endpoint.nativePrimitive) {
			t.Fatal("actual primitive DATA lacks original selected current source")
		}
		endpoint = cloneSourceRelativeEndpoint(value.endpoint)
		primitiveApplied = true
	}
	if !primitiveApplied {
		t.Fatal("original selected SymbolFor primitive DATA/APPLIED UNREACHED")
	}
	for _, recipe := range work.operationRecipes {
		source := recipe.nativeGet
		if source == nil || !validDescriptorRetrieval(source) || recipe.key != nativeRootDebtRequest(source, "algorithm").producer || !work.nativeEffectsGetCurrent(source) {
			continue
		}
		actual := source.descriptorRead.actuals[1].expression
		if actual == nil || !ast.IsIdentifier(actual) {
			continue
		}
		input, applied := work.descriptorInputData(source.descriptorRead, 1)
		if !applied || input.construction || !operationContainsRequest(recipe.delta.required, input.request) || !work.descriptorInputSnapshotCurrent(source.descriptorRead, 1, input) {
			continue
		}
		data, delivered := work.nativePrimitiveDataApplied(input.request)
		if !delivered || !data.delta.extracted {
			continue
		}
		id := work.operationIDs[input.request.producer]
		state := &work.operations[id.index]
		if len(state.moduleInputs) != 1 {
			t.Fatal("module key DATA lost independent original initializer availability")
		}
		module := state.moduleInputs[0]
		consumer := work.memberNodes[recipe.key.declaration]
		dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, module.edge}]
		if module.producer < 0 || module.producer >= len(collection.facts) || dependency == nil || dependency.invalid || dependency.projectionPending || dependency.consumed != work.stagedRevisions[module.producer] || !collection.facts[module.producer].staged.ready || collection.facts[module.producer].staged.operationsPending {
			t.Fatal("original initializer Effects/summary delivery UNREACHED")
		}
		for _, value := range input.alternatives {
			if value.creating == nil && validNativePrimitiveEndpoint(value.endpoint) && sameNativePrimitiveResult(value.endpoint.nativePrimitive, endpoint.nativePrimitive) && work.nativePrimitivePayloadsApplied(work.operationRecipes[input.request.producer]) {
				inputApplied = true
			}
		}
	}
	if !inputApplied {
		t.Fatal("actual module binding -> gOPD arg1 DATA/current snapshot/APPLIED UNREACHED")
	}
	return endpoint
}

// Unpaid input/compiler work and local/replaced/mixed callees cannot become a
// primitive result merely by spelling. These are real collector intervals; no
// positive receipt or pending flag is installed by the tests.
func TestSelectedSymbolPrimitiveRefusedSources(t *testing.T) {
	for _, row := range []struct {
		name, source string
		dynamic      bool
	}{
		{"dynamic-source-pending", `export{};const spelling='k';const incompatibleTag=Symbol.for(spelling);export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, true},
		{"local-shadow", `export{};const Symbol={for(_key:string){document.title;return 'local'}};const incompatibleTag=Symbol.for('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
		{"modeled-replacement", `export{};const original=Symbol.for;Symbol.for=(key:string)=>{document.title;return original(key)};const incompatibleTag=Symbol.for('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
		{"mixed-slot", `export{};declare const choice:boolean;const original=Symbol.for;Symbol.for=choice?original:((key:string)=>{document.title;return original(key)});const incompatibleTag=Symbol.for('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
		{"unsupported-entry-alias", `export{};const make=Symbol.for;const incompatibleTag=make('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSymbolPrimitiveCollection(t, row.source, func(collection *projectCallableCollection, file *ast.SourceFile) {
				var initializer *ast.Node
				walkNode(file.AsNode(), func(n *ast.Node) bool {
					if ast.IsVariableDeclaration(n) && n.Name() != nil && n.Name().Text() == "incompatibleTag" {
						initializer = n.Initializer()
					}
					return true
				})
				if initializer == nil {
					t.Fatal("original refused source initializer absent")
				}
				dynamicRetained := false
				for _, recipe := range collection.work.operationRecipes {
					if recipe.key.operation != initializer || recipe.callResult == nil {
						continue
					}
					for _, value := range recipe.delta.exposures {
						if value.endpoint.nativePrimitive != nil && recipe.delta.extracted && collection.work.nativePrimitiveSourceCurrent(value.endpoint.nativePrimitive) {
							t.Fatal("unsupported/mixed source manufactured complete primitive DATA")
						}
					}
					if row.dynamic {
						request, supported := nativePrimitiveInputRequest(initializer, recipe.key.declaration)
						if supported && request.producer.operation != nil && operationContainsRequest(recipe.delta.required, request) {
							_, registered := collection.work.operationRecipes[request.producer]
							data, applied := collection.work.nativePrimitiveDataApplied(request)
							dynamicRetained = registered && applied && data.delta.extracted
						}
					}
				}
				if row.dynamic && !dynamicRetained {
					t.Fatal("actual dynamic input DATA dependency UNREACHED")
				}
			})
		})
	}
}

func TestSelectedSymbolPrimitiveCanonicalReissue(t *testing.T) {
	const id = "/virtual/selected-symbol-primitive.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: symbolPrimitiveModuleInput, Diagnostics: "semantic"}, id, map[string]string{id: symbolPrimitiveModuleInput})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, symbolPrimitiveModuleInput)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	observe := func(file *ast.SourceFile, owner *executableBodyOwner) sourceRelativeEndpoint {
		cache, _ := prepareProjectCallableContexts(project, file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		for _, state := range collection.work.operations {
			if state.nativeCallee != nil {
				t.Fatal("fresh graph inherited native observation")
			}
		}
		collection.collect()
		collection.resolve(file)
		return symbolPrimitiveOriginalInput(t, collection)
	}
	first := observe(generation.sourceFile, newExecutableBodyOwner(project, generation.checker))
	second := observe(generation.sourceFile, project.callableCache.owner)
	if !sameOperationEndpoint(first, second) {
		t.Fatal("unchanged source description changed across fresh graph")
	}
	generation.release()
	edited := strings.Replace(symbolPrimitiveModuleInput, "input-incompatibility", "changed-input-incompatibility", 1)
	next, err := project.advance(context.Background(), id, edited)
	if err != nil {
		t.Fatal(err)
	}
	defer next.release()
	fresh := observe(next.sourceFile, newExecutableBodyOwner(project, next.checker))
	if sameOperationEndpoint(first, fresh) || fresh.nativePrimitive.generation != next {
		t.Fatal("edited generation reused retired primitive source")
	}
}
