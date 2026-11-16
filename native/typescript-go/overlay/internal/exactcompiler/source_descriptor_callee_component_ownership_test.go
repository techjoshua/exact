package exactcompiler

import (
	"context"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

func TestDescriptorCalleeComponentOriginalCollector(t *testing.T) {
	for _, initializer := range []string{`{value:1}`, `[]`} {
		t.Run(initializer, func(t *testing.T) {
			source := fmt.Sprintf(`export{};const target:object=%s;export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`, initializer)
			withModuleCreationDataWork(t, source, func(collection *projectCallableCollection, result callableAnalysis, _ *ast.Node) {
				recipe, found := descriptorCalleeOwnershipRecipe(collection)
				if !found {
					t.Fatal("original selected descriptor algorithm UNREACHED")
				}
				id, adopted := collection.work.operationIDs[recipe.key]
				if !adopted || id.epoch != collection.work.operationEpoch || id.index == 0 || int(id.index) >= len(collection.work.operations) {
					t.Fatal("original descriptor algorithm adoption UNREACHED")
				}
				state := &collection.work.operations[id.index]
				if state.descriptorEnumeration == nil || !state.descriptorEnumeration.represented || !state.resultSourceRequested || !recipe.delta.extracted || !state.delta.extracted || !validDescriptorEffectsPhase(recipe) {
					t.Fatal("original once enumeration/completion UNREACHED")
				}
				if len(result.pending) != 0 {
					t.Fatalf("original collector still pending after genuine algorithm completion: %#v", result.pending)
				}
			})
		})
	}
}

// Refusers below use a fresh ordinary source API query while the real collector
// owns the generation, publisher and registered original Get. This tests the
// synchronous event seam; the preceding control tests the actual collector call.
// There are no manual query cuts, pending fields, observations or fact stamps.
func TestDescriptorCalleeComponentEventRefusers(t *testing.T) {
	const source = `export{};const target={value:1};export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`
	withModuleCreationDataWork(t, source, func(collection *projectCallableCollection, _ callableAnalysis, binding *ast.Node) {
		recipe, found := descriptorCalleeOwnershipRecipe(collection)
		if !found {
			t.Fatal("genuine original descriptor source UNREACHED")
		}
		work, owner := &collection.work, collection.owner
		proof := work.currentNativeCalleeEffects(recipe.nativeGet)
		if proof == nil {
			t.Fatal("genuine original callee Get source UNREACHED")
		}
		seen := 0
		var expired sourceCalleeEffectsObservation
		observer := sourceEffectsObserver{callee: func(o *sourceCalleeEffectsObservation) bool {
			if o.call != recipe.key.operation {
				return false
			}
			if !work.descriptorCalleeComponentsOwned(collection.facts, owner, recipe, o) {
				t.Error("actual finished original callee event refused")
				return false
			}
			seen++
			expired = *o
			copy := *o
			if work.descriptorCalleeComponentsOwned(collection.facts, owner, recipe, &copy) {
				t.Error("copied event borrowed live observation identity")
			}
			for _, row := range []struct {
				name   string
				change func(*sourceCalleeEffectsObservation)
			}{
				{"wrong-Get", func(c *sourceCalleeEffectsObservation) { get := *c.get; c.get = &get }},
				{"copied-query", func(c *sourceCalleeEffectsObservation) { query := *c.issuer; c.issuer = &query }},
				{"wrong-cut", func(c *sourceCalleeEffectsObservation) { c.cut.initializing = nil }},
				{"wrong-consumer", func(c *sourceCalleeEffectsObservation) { c.consumer = binding }},
				{"wrong-generation", func(c *sourceCalleeEffectsObservation) { c.generation = nil }},
				{"foreign-component-part", func(c *sourceCalleeEffectsObservation) {
					part := *c.result
					part.nativeDescriptorEffects = append(append([]sourceNativeDescriptorEffect(nil), part.nativeDescriptorEffects...), sourceNativeDescriptorEffect{acquired: binding, kind: sourceStandardObjectEntry})
					c.result = &part
				}},
			} {
				t.Run(row.name, func(t *testing.T) {
					changed := *o
					row.change(&changed)
					// This checks contextual correspondence only. Description equality never
					// substitutes for the live-event pointer check in the actual consumer.
					if descriptorCalleeObservationContextMatches(recipe.nativeGet, proof, &changed) {
						t.Fatal("foreign Get/cut/owner/component description matched")
					}
				})
			}
			foreignOwner := *owner
			if work.descriptorCalleeComponentsOwned(collection.facts, &foreignOwner, recipe, o) {
				t.Error("foreign publisher owner borrowed original event")
			}
			return true
		}}
		queryResult := sourceInvocationDependenciesObserved(recipe.key.operation, recipe.key.operation, owner.checker, owner, recipe.key.declaration, nil, observer)
		if seen == 0 {
			t.Fatalf("actual original callee event UNREACHED: %d", seen)
		}
		if len(queryResult.nativeDescriptorEffects) != 0 {
			t.Fatal("owned callee integrity components remained unaccounted")
		}
		if !queryResult.valueIncomplete || len(queryResult.environmentEffects) == 0 {
			t.Fatal("conditional result/runtime MAY/Throw was erased")
		}
		if work.descriptorCalleeComponentsOwned(collection.facts, owner, recipe, &expired) {
			t.Fatal("expired source event retained accounting authority")
		}
	})
}

func TestDescriptorCalleeComponentForeignArgument(t *testing.T) {
	const source = `export{};const target={value:1};const key=Object.freeze as unknown as PropertyKey;export function probe(){return Object.getOwnPropertyDescriptor(target,key)?.value}`
	withModuleCreationDataWork(t, source, func(collection *projectCallableCollection, _ callableAnalysis, _ *ast.Node) {
		recipe, found := descriptorCalleeOwnershipRecipe(collection)
		if !found {
			t.Fatal("genuine conditional descriptor source UNREACHED")
		}
		work, owner := &collection.work, collection.owner
		accounted := false
		candidates := sourceInvocationDependenciesObserved(recipe.key.operation, recipe.key.operation, owner.checker, owner, recipe.key.declaration, nil, sourceEffectsObserver{callee: func(o *sourceCalleeEffectsObservation) bool {
			accepted := work.descriptorCalleeComponentsOwned(collection.facts, owner, recipe, o)
			accounted = accounted || accepted
			return accepted
		}})
		if !accounted {
			t.Fatal("actual callee accounting before foreign argument UNREACHED")
		}
		if len(candidates.nativeDescriptorEffects) == 0 || !frameworkEffectsCompilerPendingWithoutSourceBodies(candidates) {
			t.Fatal("unassociated argument descriptor components were paid by callee accounting")
		}
	})
}

func TestDescriptorCalleeComponentAuthoredDonors(t *testing.T) {
	for _, row := range []struct {
		name, setup string
		getter      bool
	}{
		{"standard-entry-getter", `const original=Object.getOwnPropertyDescriptor;Object.defineProperty(Object,'getOwnPropertyDescriptor',{configurable:true,get(){document.title='getter';return original;}});`, true},
		{"modeled-replacement", `Object.getOwnPropertyDescriptor=(_target:unknown,_key:PropertyKey)=>{document.title='replacement';return undefined;};`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `export{};const target={value:1};` + row.setup + `export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`
			withModuleCreationDataWork(t, source, func(collection *projectCallableCollection, _ callableAnalysis, binding *ast.Node) {
				var call, donor *ast.Node
				file := ast.GetSourceFileOfNode(binding)
				walkNode(file.AsNode(), func(n *ast.Node) bool {
					if row.getter && ast.IsGetAccessorDeclaration(n) {
						donor = n
					}
					if !row.getter && ast.IsArrowFunction(n) {
						donor = n
					}
					if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "probe" {
						for _, statement := range n.Body().AsBlock().Statements.Nodes {
							if ast.IsReturnStatement(statement) {
								value := statement.AsReturnStatement().Expression
								if ast.IsPropertyAccessExpression(value) {
									call = value.Expression()
								}
							}
						}
					}
					return true
				})
				if call == nil || donor == nil {
					t.Fatal("actual authored donor fixture association absent")
				}
				owner := collection.owner
				recipe, found := descriptorCalleeOwnershipRecipe(collection)
				retained := sourceInvocationDependenciesObserved(call, call, owner.checker, owner, enclosingCallableNode(call), nil, sourceEffectsObserver{callee: func(o *sourceCalleeEffectsObservation) bool {
					if !found {
						return false
					}
					return collection.work.descriptorCalleeComponentsOwned(collection.facts, owner, recipe, o)
				}})
				known := false
				for _, effect := range retained.effects {
					known = known || effect.declaration == donor
				}
				if !known {
					t.Fatal("known authored getter/replacement donor was lost beside native/unknown alternatives")
				}
			})
		})
	}
}

func descriptorCalleeOwnershipRecipe(collection *projectCallableCollection) (sourceStagedOperationRecipe, bool) {
	for _, recipe := range collection.work.operationRecipes {
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil && recipe.key.selector.field == "algorithm" {
			return recipe, true
		}
	}
	return sourceStagedOperationRecipe{}, false
}

// Cached source descriptions must issue another original callee event on each
// graph; an edited generation cannot inherit its predecessor's observation.
func TestDescriptorCalleeComponentCanonicalReissue(t *testing.T) {
	const id = "/virtual/descriptor-callee-reissue.ts"
	const source = `export{};const target={value:1};export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	type observation struct {
		epoch  *sourceStagedOperationEpoch
		proof  *sourceStagedNativeCalleeEffects
		source *sourceStagedNativeGetSource
	}
	observe := func(file *ast.SourceFile, owner *executableBodyOwner, cached bool) observation {
		cache, _ := prepareProjectCallableContexts(project, file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		entry := cache.bySource[file]
		if entry.sourceContext == nil || entry.sourceContext.collect == cached {
			t.Fatalf("actual canonical cache source path UNREACHED cached=%t", cached)
		}
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		for _, state := range collection.work.operations {
			if state.nativeCallee != nil || state.descriptorEnumeration != nil {
				t.Fatal("fresh graph inherited native/body observation")
			}
		}
		collection.collect()
		result := collection.resolve(file)
		recipe, found := descriptorCalleeOwnershipRecipe(collection)
		if !found {
			t.Fatal("fresh original descriptor source UNREACHED")
		}
		id := collection.work.operationIDs[recipe.key]
		if id.epoch != collection.work.operationEpoch || id.index == 0 || int(id.index) >= len(collection.work.operations) {
			t.Fatal("fresh original descriptor task UNREACHED")
		}
		state := &collection.work.operations[id.index]
		proof := collection.work.currentNativeCalleeEffects(recipe.nativeGet)
		if proof == nil || state.descriptorEnumeration == nil || !state.descriptorEnumeration.represented || !state.delta.extracted || len(result.pending) != 0 {
			t.Fatalf("fresh original callee/enumeration completion UNREACHED: %#v", result.pending)
		}
		return observation{collection.work.operationEpoch, proof, recipe.nativeGet}
	}
	first := observe(generation.sourceFile, newExecutableBodyOwner(project, generation.checker), false)
	cache := project.callableCache
	second := observe(generation.sourceFile, cache.owner, true)
	if first.epoch == second.epoch || first.proof == second.proof || !sameNativeGetSource(first.source, second.source) {
		t.Fatal("cached source failed to reissue graph-local original callee observation")
	}
	generation.release()
	edited := strings.Replace(source, "value:1", "value:2", 1)
	next, err := project.advance(context.Background(), id, edited)
	if err != nil {
		t.Fatal(err)
	}
	defer next.release()
	fresh := observe(next.sourceFile, newExecutableBodyOwner(project, next.checker), false)
	if project.callableCache == cache || fresh.epoch == second.epoch || fresh.proof.generation != next || fresh.source.descriptorRead.generation != next || sameNativeGetSource(first.source, fresh.source) {
		t.Fatal("edited source renewed retired callee description or observation")
	}
}
