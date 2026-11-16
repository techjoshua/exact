package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This uses the actual selected member-owner handoff. The descriptive producer
// never calls admission or executes a stored callback, setter or algorithm.
func TestSelectedNativeInstallationOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		selected     bool
	}{
		{"Object", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, true},
		{"Reflect", `export function invoke(){return Reflect.defineProperty({},'run',{value:()=>document.title})}`, true},
		{"unresolved descriptor stays descriptive", `export function invoke(descriptor:PropertyDescriptor){return Object.defineProperty({},'run',descriptor)}`, true},
		{"shadow", `const Object={defineProperty(...args:unknown[]){return args}};export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				request := installationSourceRequest(call)
				work := callableEffectWork{extracting: -1}
				deliveries := 0
				revoke, ok := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					deliveries++
					initialRecipes, initialStates := len(work.operationRecipes), len(work.operations)
					relation, described := describeSelectedNativeInstallation(selection)
					if !described || !sameOperationRequest(relation.request, request.request) || !sameOperationEndpoint(relation.target, selection.actuals[0]) || !sameOperationEndpoint(relation.key, selection.actuals[1]) || !sameOperationEndpoint(relation.descriptor, selection.actuals[2]) {
						t.Fatal("original selected source vector not preserved")
					}
					original := relation.target.expression
					selection.actuals[0].expression = selection.actuals[2].expression
					if relation.target.expression != original {
						t.Fatal("installation retained the borrowed vector")
					}
					if len(work.operationRecipes) != initialRecipes || len(work.operations) != initialStates {
						t.Fatal("description acquired field or algorithm admission")
					}
					for _, state := range work.operations[1:] {
						if member := work.operationRecipes[state.key].memberSource; member != nil {
							if member.coverage == nil || !validStagedMemberCoverageRecipe(work.operationRecipes[state.key]) || work.closedOperationDependencies()[work.operationIDs[state.key].index] {
								t.Fatal("earlier receiver source registration settled an unrepresented protocol")
							}
							continue
						}
						if state.key.selector.field == "eager-inputs" && state.delta.extracted {
							source := work.operationRecipes[state.key].nativeGet
							if state.revision == 0 || source == nil || !sameOperationRequest(source.request, request.request) || source.eager == nil || !validStagedNativeEagerInputs(*source.eager, source) || !sameOperationRequest(source.eager.request, nativeRootDebtRequest(source, "eager-inputs")) || source.eager.actuals[0].expression != original {
								t.Fatal("eager readiness lost its original independent creation proof")
							}
							continue
						}
						if state.revision != 0 || state.delta.extracted {
							t.Fatal("preinventory callback settled callee, root or algorithm work")
						}
					}
				})
				if !ok {
					t.Fatal("original source issuer refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if (deliveries != 0) != row.selected {
					t.Fatalf("selected source deliveries=%d want=%t", deliveries, row.selected)
				}
				parent := facts[installationFactIndex(t, facts, enclosingCallableNode(call))]
				for _, effect := range parent.summary.EffectSources {
					if effect.Environment == "browser" && effect.Description == "document" {
						t.Fatal("stored callback activated by source installation")
					}
				}
			})
		})
	}
}

// The source issuer may retain a conditional native MAY branch or withhold its
// handoff for an unsupported receiver. Neither outcome removes authored/unknown
// siblings or permits native-only acknowledgement of the original Call.
func TestSelectedNativeInstallationIndependentAlternatives(t *testing.T) {
	for _, row := range []struct {
		name, source string
		authored     bool
	}{
		{"own authored replacement", `const owner={defineProperty:Object.defineProperty};owner.defineProperty=function replacement<T>(target:T,key:PropertyKey,descriptor:PropertyDescriptor):T{window.name;return target};export function invoke(){return owner.defineProperty({},'run',{value:()=>document.title})}`, true},
		{"unknown receiver sibling", `declare const other:typeof Object;export function invoke(flag:boolean){return (flag?Object:other).defineProperty({},'run',{value:()=>document.title})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				request := installationSourceRequest(call)
				work := callableEffectWork{extracting: -1}
				revoke, ok := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					if _, valid := describeSelectedNativeInstallation(selection); !valid {
						t.Fatal("selected standard alternative lost descriptive relationship")
					}
					for _, state := range work.operations[1:] {
						if state.delta.extracted {
							t.Fatal("conditional installation acknowledged siblings")
						}
					}
				})
				if !ok {
					t.Fatal("original source issuer refused")
				}
				defer revoke()
				acquired := query.receiverCandidates(call, nil)
				authored, native := false, false
				for _, value := range acquired.values {
					authored = authored || value.node != nil && ast.IsFunctionLike(value.node) && callableNameText(value.node.Name()) == "replacement"
					native = native || value.native != nil && reflectiveNative(value.native.kind)
				}
				if row.authored && !authored {
					t.Fatal("ordinary own authored alternative lost")
				}
				if !row.authored && (!native || !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete) {
					t.Fatal("known standard or unresolved receiver alternative lost")
				}
			})
		})
	}
}

func TestSelectedNativeInstallationRejectsUncorrelatedVector(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		request := installationSourceRequest(call)
		work := callableEffectWork{extracting: -1}
		delivered := false
		revoke, ok := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
			delivered = true
			for _, control := range []struct {
				name   string
				change func(*sourceStagedNativeSelection)
			}{
				{"extent", func(s *sourceStagedNativeSelection) { s.actuals = s.actuals[:2] }},
				{"order", func(s *sourceStagedNativeSelection) { s.actuals[0], s.actuals[1] = s.actuals[1], s.actuals[0] }},
				{"operation", func(s *sourceStagedNativeSelection) { s.call = s.call.Parent }},
				{"callee Get", func(s *sourceStagedNativeSelection) { s.get = s.descriptorGet }},
				{"descriptor Get", func(s *sourceStagedNativeSelection) { s.descriptorGet = s.actuals[0].expression }},
				{"endpoint operation", func(s *sourceStagedNativeSelection) { s.actuals[0].producer = s.descriptorGet }},
				{"endpoint cut", func(s *sourceStagedNativeSelection) { s.actuals[0].cut.reading = s.descriptorGet }},
				{"request cut", func(s *sourceStagedNativeSelection) {
					s.request.cut.reading = s.descriptorGet
					for i := range s.actuals {
						s.actuals[i].cut = s.request.cut
					}
				}},
				{"projection", func(s *sourceStagedNativeSelection) { s.actuals[0].projection = []string{"value"} }},
				{"non-expression", func(s *sourceStagedNativeSelection) { s.actuals[2].kind = relativeEndpointResult }},
			} {
				invalid := selection
				invalid.actuals = cloneSourceRelativeEndpoints(selection.actuals)
				control.change(&invalid)
				if _, accepted := describeSelectedNativeInstallation(invalid); accepted {
					t.Fatalf("uncorrelated %s accepted", control.name)
				}
			}
		})
		if !ok {
			t.Fatal("original source issuer refused")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		if !delivered {
			t.Fatal("actual selected source control not reached")
		}
	})
}

func installationSourceFacts(query *sourceValueQuery) []callableFacts {
	var facts []callableFacts
	for _, analysis := range query.executable.project.callableCache.bySource {
		for _, fact := range analysis.facts {
			cloned := cloneProjectCallableFact(fact)
			// This harness issues a new original-owner request below. Ordinary
			// collector enrollment may already have issued the same source under
			// another consumer edge. Do not import that graph into this isolated
			// producer control. Dedicated clone controls retain issued recipes.
			native := make(map[sourceStagedOperationKey]bool)
			recipes := cloned.staged.operationRecipes[:0]
			for _, recipe := range cloned.staged.operationRecipes {
				if recipe.nativeGet != nil || recipe.mapEntry != nil {
					native[recipe.key] = true
				} else {
					recipes = append(recipes, recipe)
				}
			}
			// Original enum/member transports carry the removed native parent's
			// exact consumer edge. Retaining them would collide with this harness's
			// new issuer at the same finite selector. Independent Get sources and
			// dedicated same-graph clone controls keep their existing ownership.
			removedMembers := make(map[sourceStagedOperationKey]bool)
			isolated := recipes[:0]
			for _, recipe := range recipes {
				parent := sourceStagedOperationRequest{}
				if recipe.memberSource != nil {
					parent = recipe.memberSource.parent
					if field, _, contextual := stagedFieldMemberParent(parent); contextual {
						parent = field
					}
				}
				if recipe.memberSource != nil && native[parent.producer] {
					removedMembers[recipe.key] = true
				} else {
					isolated = append(isolated, recipe)
				}
			}
			cloned.staged.operationRecipes = isolated
			uses := cloned.staged.operationUses[:0]
			for _, use := range cloned.staged.operationUses {
				if !native[use.request.producer] && !removedMembers[use.request.producer] {
					uses = append(uses, use)
				}
			}
			cloned.staged.operationUses = uses
			facts = append(facts, cloned)
		}
	}
	return facts
}
func installationSourceRequest(call *ast.Node) sourceStagedNativeRequest {
	declaration := enclosingCallableNode(call)
	return sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "native-installation-source", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
}
func installationFactIndex(t *testing.T, facts []callableFacts, node *ast.Node) int {
	t.Helper()
	for index, fact := range facts {
		if fact.node == node {
			return index
		}
	}
	t.Fatal("missing original declaration fact")
	return -1
}
