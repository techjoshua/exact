package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Original constructor selection can encounter a writer's returned target before
// its creating association is delivered. The member source set retains that
// data dependency without a native Call loan, a replay or a selected category.
func TestStagedCallResultOriginalNewMember(t *testing.T) {
	const source = `declare const choose:boolean;function factory(){if(choose)return globalThis;return {get WeakMap(){window.name;return ()=>document.title}}}function overwrite(){Object.defineProperty(factory(),'WeakMap',{value:()=>document.title})}export function invoke(){overwrite();return new WeakMap()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		var node *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsNewExpression(n) {
				node = n
			}
			return true
		})
		if node == nil {
			t.Fatal("original New")
		}
		facts := stagedReturnSourceFacts(file)
		work := callableEffectWork{extracting: -1, extractionCalls: make(map[*ast.Node]struct{}), extractionPhases: make([]callableExtractionPhase, len(facts))}
		work.indexOperationSources(facts)
		consumer := work.memberNodes[enclosingCallableNode(node)]
		root, registered := work.registerStagedConstructionEffects(facts, consumer, node, owner)
		if !registered {
			t.Fatal("original construction source registration")
		}
		request := stagedCallResultRequest(creating, enclosingCallableNode(creating))
		recipe := work.operationRecipes[request.producer]
		if recipe.callResult == nil || len(recipe.callResult.readings) == 0 {
			t.Fatal("original New member fell back before registering returned target data")
		}
		matched := false
		for i, reading := range recipe.callResult.readings {
			parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer}
			if reading.reading == root.producer && validStagedCallResultReading(reading, parent, recipe.callResult.readCuts[i]) {
				for _, c := range work.operationRecipes {
					if c.memberSource == nil || c.memberSource.coverage == nil || !sameOperationRequest(c.memberSource.parent, root) {
						continue
					}
					for _, required := range c.delta.required {
						matched = matched || sameOperationRequest(required, reading)
					}
				}
			}
		}
		if !matched {
			t.Fatal("original source set did not consume exact returned-data relationship")
		}
		query := newSourceDependencyQuery(node, owner.checker, owner, facts[consumer].node)
		query.standardConstructionSource, query.protectedMember = node, node
		revoke, installed := work.beginStagedMemberWork(query, facts, root)
		if !installed {
			t.Fatal("original constructor member interval")
		}
		query.stagedMember.constructionCallee = true
		sink := query.stagedMember.returnResult
		yielded, refused := false, false
		query.stagedMember.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
			copied := *query
			if copied.deferStagedCallReturn(call, sourceCallResultInterest{purpose: resultSourceProjection}) || query.deferStagedCallReturn(call, sourceCallResultInterest{purpose: resultSourceProjection}) {
				t.Fatal("copied issuer or reentry inherited result observation")
			}
			if b := query.stagedMember; !refused && b.coverage != nil {
				key := b.coverage.request.producer
				prior := work.operationRecipes[key]
				if !validStagedMemberCoverageRecipe(prior) {
					t.Fatal("actual source parent before result transfer")
				}
				// Supplied mismatched-parent metadata tests refusal, never admission.
				bad := prior
				bad.memberSource = cloneStagedMemberSource(prior.memberSource)
				bad.memberSource.coverage.cut.returning = creating
				work.operationRecipes[key] = bad
				required, covered := len(b.required), len(b.coverage.required)
				accepted := sink(call, interest)
				work.operationRecipes[key] = prior
				if accepted.accepted || len(b.required) != required || len(b.coverage.required) != covered {
					t.Fatal("refused result reading changed original borrower prefix")
				}
				refused = true
			}
			accepted := sink(call, interest)
			yielded = yielded || call == creating && accepted.accepted
			return accepted
		}
		result := accessorCandidates{}
		query.selectSourceConstruction(node, nil, &result)
		revoke()
		query.publishDependencyStatistics()
		if sink(creating, sourceCallResultInterest{purpose: resultSourceProjection}).accepted {
			t.Fatal("expired member loan accepted result data")
		}
		if !yielded || !refused {
			t.Fatal("original New selector replayed returned-target acquisition instead of yielding")
		}
		// Passive registration supplies no ordinary IDs or invocation of the value.
		if len(work.operationIDs) != 0 {
			t.Fatal("returned-data registration adopted a constructor")
		}
		for _, reading := range recipe.callResult.readings {
			for _, mutate := range []func(*sourceStagedOperationRequest){
				func(r *sourceStagedOperationRequest) { r.edge += ":forged" },
				func(r *sourceStagedOperationRequest) { r.cut.initializing = node },
				func(r *sourceStagedOperationRequest) { r.inputs = &sourceRelativeInputEdge{} },
			} {
				bad := reading
				mutate(&bad)
				if acceptedStagedCallResultRequest(recipe.callResult, bad) {
					t.Fatal("unissued result reading accepted")
				}
			}
			if _, ok := work.requireOperation(facts, reading); !ok {
				t.Fatal("exact data subscriber refused")
			}
		}
		work.extracting = work.memberNodes[enclosingCallableNode(creating)]
		if !work.stageSourceDeclarationCall(facts, work.extracting, creating, owner) {
			t.Fatal("original creating association")
		}
		work.extracting = -1
		work.prepareOperationUses(facts, owner)
		id := work.operationIDs[request.producer]
		state := work.operations[id.index]
		if state.revision == 0 || len(state.delta.exposures) == 0 || state.resultBody == nil {
			t.Fatal("original creating packet did not deliver data through existing queue")
		}
		for _, subscriber := range state.subscribers {
			if subscriber.blocked || subscriber.applied != state.revision || len(subscriber.returned) == 0 {
				t.Fatal("member data delivery incomplete")
			}
		}
		if work.operationRecipes[stagedConstructionRequest(root, "algorithm").producer].delta.extracted {
			t.Fatal("returned prefix granted constructor selection")
		}
	})
}

// An earlier native Call can expose a writer through one of its actuals. This
// production New selector must issue that data reading while its original Get
// is live, rather than borrowing the earlier Call's temporary recovery cut.
func TestStagedCallResultWriterRecoveryOriginalCut(t *testing.T) {
	const source = `function latent(target:Record<PropertyKey,unknown>,key:PropertyKey){window.name;target[key]=()=>document.title}const prefix=Object.freeze(Object.defineProperties({}, {tag:{value:true}}));function factory(){return prefix}export function invoke(){factory();return new WeakMap()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, factory *ast.Node) {
		file := ast.GetSourceFileOfNode(factory)
		var original, nested *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				original = node
			}
			if ast.IsCallExpression(node) && stagedNativeInputIntent(node.Expression()) == sourceNativeObjectDefineProperties {
				nested = node
			}
			return true
		})
		if original == nil || nested == nil {
			t.Fatal("original New and nested native Call")
		}
		facts := stagedReturnSourceFacts(file)
		work := newCallableEffectWork(facts)
		consumer := work.memberNodes[enclosingCallableNode(original)]
		root, registered := work.registerStagedConstructionEffects(facts, consumer, original, owner)
		if !registered {
			t.Fatal("original New production registration")
		}
		request := stagedCallResultRequest(nested, sourceStagedModuleOwner(nested))
		recipe := work.operationRecipes[request.producer]
		if recipe.callResult == nil || !recipe.callResult.nativeCall || len(recipe.callResult.readings) == 0 {
			t.Fatal("writer recovery missed pre-cut original result reading")
		}
		connected := false
		for i, reading := range recipe.callResult.readings {
			cut := recipe.callResult.readCuts[i]
			if reading.reading != root.producer || cut.operation != original.Expression() || cut.initializing != original || cut.reading != original.Expression() || !work.stagedMemberResultReading(reading, root, cut) {
				t.Fatal("temporary earlier Call replaced frozen New observation", cut)
			}
			for _, source := range work.operationRecipes {
				if source.memberSource == nil || source.memberSource.coverage == nil || !sameOperationRequest(source.memberSource.parent, root) {
					continue
				}
				for _, required := range source.delta.required {
					connected = connected || sameOperationRequest(required, reading)
				}
			}
			if _, accepted := work.requireOperation(facts, reading); !accepted {
				t.Fatal("original data consumer refused exact reading")
			}
		}
		if !connected {
			t.Fatal("original source parent did not consume result dependency")
		}
		work.prepareOperationUses(facts, owner)
		id := work.operationIDs[request.producer]
		state := work.operations[id.index]
		if state.revision == 0 || len(state.delta.required) == 0 {
			t.Fatal("native result producer failed to deliver required original Effects")
		}
		for _, subscriber := range state.subscribers {
			if subscriber.blocked || subscriber.applied != state.revision {
				t.Fatal("original result consumer did not receive current revision")
			}
		}
		if work.operationRecipes[stagedConstructionRequest(root, "algorithm").producer].delta.extracted {
			t.Fatal("deferred result reading selected a constructor")
		}
	})
}
