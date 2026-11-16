package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// The ordinary collector issues the original read. The original writer owner,
// not this test or source inventory, supplies activation and creating inputs.
// Dormant data and reached method invocation use separate source requirements.
func TestStagedWriterOriginalOwnerRequiredQueue(t *testing.T) {
	for _, row := range []struct {
		name, body string
		actual     string
		ready      bool
	}{
		{"formal", `map.get=next`, "replacement", true},
		{"stored callback", `map.get=()=>{return {read:()=>document.title}}`, "replacement", true},
		{"completed written capture", `try{map.get=()=>next({})}finally{next=()=>undefined}`, "replacement", true},
		{"conditional unknown retained", `map.get=next`, "flag?replacement:foreign", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := stagedConstructedReducedChain + `
declare const flag:boolean;declare const foreign:(key:object)=>object|undefined;function replacement(key:object):object|undefined{window.name;return undefined}function put(map:WeakMap<object,object>,next:(key:object)=>object|undefined){` + row.body + `}put(operationPrototypes,` + row.actual + `);`
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/writer-required-queue.ts", Source: source, Diagnostics: "semantic"})
			if hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Diagnostics)
			}
			if response.Error != "" && !strings.HasPrefix(response.Error, "Compiler analysis coverage gap: required staged effect contribution") {
				t.Fatal(response.Error)
			}
			if response.Error == "" {
				t.Fatal("unrepresented aggregate writer coverage closed")
			}
			if response.Code != "" || len(response.Analysis.Callables) != 0 {
				t.Fatal("pending writer returned partial artifact")
			}
			found := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "operationPrototype" {
					continue
				}
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.writer == nil || recipe.writer.callable {
						continue
					}
					found = true
					if recipe.delta.extracted != row.ready || len(recipe.writer.reads) == 0 || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
						t.Fatalf("source RHS disposition: %+v", recipe.delta)
					}
					if row.ready && len(recipe.delta.exposures) == 0 {
						t.Fatal("known dormant RHS missing")
					}
					if row.name == "conditional unknown retained" {
						endpoint := recipe.delta.exposures[0].endpoint
						actual := recipe.writer.reads[0].invocation.actuals[1]
						if endpoint.expression != actual.expression || !ast.IsConditionalExpression(endpoint.expression) || endpoint.expression.AsConditionalExpression().WhenFalse.Text() != "foreign" {
							t.Fatal("unknown source branch dropped or conditional became a selected callback")
						}
					}
					cloned := cloneProjectCallableFact(fact)
					for i := range cloned.staged.operationRecipes {
						copyRecipe := &cloned.staged.operationRecipes[i]
						if copyRecipe.key != recipe.key || copyRecipe.writer == nil {
							continue
						}
						copyRecipe.writer.reads[0].value.expression = nil
						if recipe.writer.reads[0].value.expression == nil {
							t.Fatal("clone shared writer source payload")
						}
						if len(copyRecipe.writer.reads[0].rhs.bindings) != 0 && len(copyRecipe.writer.reads[0].rhs.bindings[0].sources) != 0 {
							copyRecipe.writer.reads[0].rhs.bindings[0].sources[0].expression = nil
							if recipe.writer.reads[0].rhs.bindings[0].sources[0].expression == nil {
								t.Fatal("clone shared detached input endpoint")
							}
						}
					}
					parentFound := false
					for _, parent := range fact.staged.operationRecipes {
						if parent.key != recipe.writer.parent.producer {
							continue
						}
						for _, required := range parent.delta.required {
							parentFound = parentFound || sameOperationRequest(required, recipe.writer.request)
						}
						if parent.delta.extracted && parent.constructedDisposition == nil {
							t.Fatal("aggregate closure lacked independent source-use disposition")
						}
					}
					if !parentFound {
						t.Fatal("source publication lacked required parent membership")
					}
				}
			}
			if !found {
				t.Fatal("original writer did not publish required RHS source")
			}
			facts := stagedDeclarationFacts(session)
			for _, project := range session.projects {
				owner := project.callableCache.owner
				work := registerCallableEffectWork(facts)
				restore := registerPendingMemberFacts(owner, facts)
				work.prepareOperationUses(facts, owner)
				restore()
				closed := work.closedOperationDependencies()
				queued := false
				for key, recipe := range work.operationRecipes {
					if recipe.writer == nil {
						continue
					}
					id, adopted := work.operationIDs[key]
					if !adopted {
						if _, requiredParent := work.operationIDs[recipe.writer.parent.producer]; requiredParent {
							t.Fatal("required RHS had no queue membership")
						}
						// Descriptive raw candidate DATA is independent of its
						// Effects role. No ordinary consumer requested this parent.
						for _, use := range facts[work.memberNodes[recipe.writer.request.consumer]].staged.operationUses {
							if sameOperationRequest(use.request, recipe.writer.parent) || sameOperationRequest(use.request, recipe.writer.request) {
								t.Fatal("ordinary writer DATA use was not adopted")
							}
						}
						continue
					}
					state := &work.operations[id.index]
					wrong := recipe.writer.request
					wrong.reading = sourceStagedOperationKey{}
					if _, admitted := work.requireOperation(facts, wrong); admitted {
						t.Fatal("writer data paid another read role")
					}
					wrong = recipe.writer.request
					wrong.producer.selector.association = nil
					if _, admitted := work.requireOperation(facts, wrong); admitted {
						t.Fatal("writer data lost its original owning source anchor")
					}
					subscriber := state.subscribers[sourceStagedOperationConsumer{recipe.writer.request.consumer, recipe.writer.request.edge}]
					if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision {
						t.Fatal("typed source prefix not delivered")
					}
					invocationReady := row.ready && (!recipe.writer.callable || row.name != "completed written capture")
					if invocationReady && (len(subscriber.constructed) == 0 || !closed[id.index]) {
						t.Fatal("known stored source not delivered/settled independently")
					}
					if !invocationReady && closed[id.index] {
						t.Fatal("written capture pending endpoint closed")
					}
					parent := work.operationIDs[recipe.writer.parent.producer]
					if parent.index == 0 {
						t.Fatal("missing parent")
					}
					if recipe.writer.callable && (row.name == "formal" || row.name == "conditional unknown retained") {
						browser := false
						for _, method := range state.writerMethods {
							for _, effect := range facts[work.memberNodes[method.declaration]].summary.DirectEffectSources {
								browser = browser || method.transferred && effect.Environment == "browser"
							}
						}
						if !browser {
							t.Fatal("reached stored method lost browser donor")
						}
					}
					queued = true
				}
				if !queued {
					t.Fatal("writer queue lost sealed source on new graph")
				}
				work.operationGeneration = &projectGeneration{}
				for index, ready := range work.closedOperationDependencies() {
					if index != 0 && work.operationRecipes[work.operations[index].key].writer != nil && ready {
						t.Fatal("old generation source settled fresh graph")
					}
				}
			}
		})
	}
}
