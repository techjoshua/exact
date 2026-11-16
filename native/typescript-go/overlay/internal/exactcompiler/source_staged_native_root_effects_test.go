package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Both shared obligations are produced at their original owners. Field-local
// extraction cannot stand in for the completed callee or eager input phase.
func TestStagedNativeRootEffectsOriginalOwners(t *testing.T) {
	const source = `export function invoke(){return Object.defineProperty({},'run',{})}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		request := installationSourceRequest(call)
		revoke, installed := beginStagedNativeDescriptorSource(query, &work, facts, request)
		if !installed {
			t.Fatal("original source owner refused")
		}
		borrow := query.stagedNativeGet
		acquired := query.receiverCandidates(call, nil)
		revoke()
		for _, role := range []string{"callee-get", "eager-inputs"} {
			source := work.operationRecipes[request.request.producer].nativeGet
			key := nativeRootDebtRequest(source, role).producer
			id, registered := work.operationIDs[key]
			if !registered || !work.operations[id.index].delta.extracted || work.operations[id.index].revision == 0 {
				t.Fatalf("%s not produced: legacyPrepare=%t contextual=%t opaque=%t valueIncomplete=%t receiverIncomplete=%t values=%d effects=%d fallbacks=%d", role, borrow.legacyPrepared, borrow.contextual, acquired.opaque, acquired.valueIncomplete, acquired.receiverIncomplete, len(acquired.values), len(acquired.effects), len(acquired.callFallbacks)+len(acquired.fieldFallbacks))
			}
		}
		work.prepareOperationUses(facts, query.executable)
		closed := work.closedOperationDependencies()
		root := work.operationIDs[request.request.producer]
		if !closed[root.index] {
			for index := 1; index < len(work.operations); index++ {
				state := work.operations[index]
				if !closed[index] {
					t.Logf("open %s local=%t revision=%d registered=%t dependencies=%d invalid=%t", state.key.selector.field, state.delta.extracted, state.revision, state.dependenciesRegistered, len(state.dependencies), state.invalid)
				}
			}
			t.Fatal("original six-field algorithm and two shared obligations did not settle")
		}
		for _, field := range work.operationRecipes[nativeRootDebtRequest(work.operationRecipes[request.request.producer].nativeGet, "algorithm").producer].delta.required {
			id := work.operationIDs[field.producer]
			if !closed[id.index] || !work.operations[id.index].delta.extracted {
				t.Fatal("root settled without a field source")
			}
		}
		calleeKey := nativeRootDebtRequest(work.operationRecipes[request.request.producer].nativeGet, "callee-get").producer
		if work.operationRecipes[calleeKey].delta.extracted {
			t.Fatal("original Get result was cached in a declaration recipe")
		}
		firstReceipt := work.operations[work.operationIDs[calleeKey].index].nativeCallee
		cloned := make([]callableFacts, len(facts))
		for index := range facts {
			cloned[index] = cloneProjectCallableFact(facts[index])
		}
		other := callableEffectWork{extracting: -1}
		other.prepareOperationUses(cloned, query.executable)
		otherRoot := other.operationIDs[request.request.producer]
		otherReceipt := other.operations[other.operationIDs[calleeKey].index]
		if !other.closedOperationDependencies()[otherRoot.index] || otherReceipt.nativeCallee == nil || otherReceipt.nativeCallee == firstReceipt || !otherReceipt.calleeSourceRequested {
			t.Fatal("cloned graph reused a Get receipt or did not request its original producer")
		}
		other.operationGeneration = &projectGeneration{}
		if other.closedOperationDependencies()[otherRoot.index] {
			t.Fatal("expired Get generation retained source completion")
		}
	})
}

// A source writer with no installed invocation remains an unmigrated relative
// obligation. An empty legacy alternative list cannot manufacture callee coverage.
func TestStagedNativeRootWriterRemainsPending(t *testing.T) {
	const source = `export function writer(target:Record<string,unknown>){target['defineProperty']=()=>0}export function invoke(){return Object.defineProperty({},'run',{})}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		request := installationSourceRequest(call)
		revoke, installed := beginStagedNativeDescriptorSource(query, &work, facts, request)
		if !installed {
			t.Fatal("source request refused")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		work.prepareOperationUses(facts, query.executable)
		source := work.operationRecipes[request.request.producer].nativeGet
		id := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
		state := &work.operations[id.index]
		if !state.calleeSourceRequested || state.nativeCallee != nil || !state.delta.extracted || !validNativeMemberEffects(state.nativeMemberEffects, source) || state.nativeMemberEffects.generation != work.operationGeneration {
			t.Fatal("original Get did not retain its finite Effects-only source receipt")
		}
		// Finite extraction can finish before the writer's actual input owner.
		// The original source-set child must retain that exact unfinished exit.
		closed := work.closedOperationDependencies()
		writerPending := false
		for _, scope := range state.nativeMemberEffects.sources {
			coverage := work.operationRecipes[scope.producer]
			if !validStagedMemberCoverageRecipe(coverage) || work.memberCoverageObserved[scope.producer] != work.operationGeneration {
				t.Fatal("Get receipt lost its current original source-set observation")
			}
			for _, required := range coverage.delta.required {
				child := work.operationRecipes[required.producer].memberSource
				if child != nil && child.writeEffects && plainStagedAssignment(child.candidate.operation) {
					dependency, issued := work.operationIDs[required.producer]
					writerPending = writerPending || issued && !closed[dependency.index] && sameOperationRequest(child.parent, source.request)
				}
			}
		}
		if !writerPending || closed[id.index] || closed[work.operationIDs[request.request.producer].index] {
			t.Fatal("uninstalled original writer input did not block both callee and root closure")
		}
	})
}
