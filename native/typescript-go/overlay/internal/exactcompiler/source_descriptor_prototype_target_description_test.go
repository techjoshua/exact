package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// These controls enter through the same real project collector as the original
// prototype-mutation journey. A pending operand description alone cannot supply
// the original target Get, its source receipts, or final descriptor delivery.
func TestDescriptorOriginalPrototypeTargetSourceBoundaries(t *testing.T) {
	for _, method := range []string{"Object.defineProperty", "Reflect.defineProperty"} {
		t.Run(method, func(t *testing.T) {
			source := fmt.Sprintf("export{};export function probe(value:object){%s(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}", method)
			descriptorContractCollection(t, source, func(collection *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, true)
				assertOriginalDescriptorGetUseCurrent(t, collection, descriptorStrictComparisonEffects)
				work := &collection.work
				closed := work.closedOperationDependencies()
				reached := false
				for _, recipe := range work.operationRecipes {
					source := recipe.nativeGet
					if source == nil || source.installation == nil || recipe.key != nativeEagerTargetRequest(source).producer {
						continue
					}
					actuals := restrictedInvocationArguments(source.request.producer.operation.AsCallExpression())
					if len(actuals) != 3 || !ast.IsPropertyAccessExpression(actuals[0]) || callableNameText(actuals[0].Name()) != "prototype" {
						continue
					}
					id, adopted := work.operationIDs[recipe.key]
					if !adopted || id.index == 0 || int(id.index) >= len(closed) {
						t.Fatal("original target role adoption UNREACHED")
					}
					state := &work.operations[id.index]
					proof := state.nativeTarget
					if !state.targetSourceRequested || proof == nil || !state.delta.extracted || !closed[id.index] || proof.generation != work.operationGeneration || !validStagedNativeTargetEffects(*proof, source) {
						t.Fatal("genuine original target Get/extraction/current/full closure UNREACHED")
					}
					if proof.target != actuals[0] || proof.cut != (sourceRelativeCut{operation: actuals[0], reading: actuals[0]}) {
						t.Fatal("physical target Get cut replaced by parent Call/source coverage")
					}
					indexed, issued := work.memberProtocolSources[actuals[0]]
					if !issued || !sameOperationRequest(indexed, nativeEagerTargetRequest(source)) {
						t.Fatal("actual target Get protocol-source index UNREACHED")
					}
					// Mutate descriptions only after a genuine positive. These are structural
					// correlation refusers, not fabricated graph receipts or currentness tests.
					for _, row := range []struct {
						name   string
						change func(*sourceStagedNativeTargetEffects)
					}{
						{"target", func(p *sourceStagedNativeTargetEffects) { p.target = source.get }},
						{"cut", func(p *sourceStagedNativeTargetEffects) { p.cut.use = p.target }},
						{"generation", func(p *sourceStagedNativeTargetEffects) { p.generation = nil }},
						{"request", func(p *sourceStagedNativeTargetEffects) { p.request.consumer = source.request.producer.operation }},
					} {
						t.Run(row.name, func(t *testing.T) {
							copy := *proof
							row.change(&copy)
							if validStagedNativeTargetEffects(copy, source) {
								t.Fatal("foreign copied target description admitted")
							}
						})
					}
					reached = true
				}
				if !reached {
					t.Fatal("original target-Get SOURCE relationship UNREACHED")
				}
			})
		})
	}
}

func TestDescriptorPrototypeTargetDescriptionKeepsUnknown(t *testing.T) {
	for _, row := range []struct{ name, prefix string }{
		{"ordinary-same-name", "const other={prototype:{}};"},
		{"unknown-target", "declare const other:{prototype:object};"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.prefix + "export function probe(value:object){Object.defineProperty(other.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
			withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
				cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
				collection := beginProjectCallableCollection(cache, cache.owner)
				defer collection.close()
				collection.collect()
				result := collection.resolve(file)
				if len(result.pending) == 0 {
					t.Fatal("same spelling or unknown target paid original target SOURCE debt")
				}
				work := &collection.work
				reached := false
				for _, recipe := range work.operationRecipes {
					source := recipe.nativeGet
					if source == nil || source.eager == nil || !source.eager.targetPending || len(source.eager.actuals) != 3 {
						continue
					}
					target := source.eager.actuals[0].expression
					if !ast.IsPropertyAccessExpression(target) || !ast.IsIdentifier(target.Expression()) || target.Expression().Text() != "other" {
						continue
					}
					request := nativeEagerTargetRequest(source)
					id, adopted := work.operationIDs[request.producer]
					if !adopted || id.index == 0 {
						t.Fatal("pending target description did not require its existing source owner")
					}
					state := &work.operations[id.index]
					if !state.targetSourceRequested {
						t.Fatal("original unknown target owner UNREACHED")
					}
					if state.nativeTarget != nil || state.delta.extracted {
						t.Fatal("pending description granted standard target acquisition")
					}
					reached = true
				}
				if !reached {
					t.Fatal("actual pending target description/queued owner UNREACHED")
				}
			})
		})
	}
}
