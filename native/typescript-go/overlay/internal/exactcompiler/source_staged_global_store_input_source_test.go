package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This continues the original module-A -> cloned-work-B journey. Only the real
// writer registration and extraction queue may renew the original Freeze law;
// neither this assertion nor the clone collector invokes the module again.
func assertGlobalStoreRequestedInputSource(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	var root, site *ast.Node
	for _, fact := range facts {
		if !ast.IsVariableStatement(fact.node) {
			continue
		}
		for _, decl := range fact.node.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			if decl.Name() == nil {
				continue
			}
			switch decl.Name().Text() {
			case "emptyOperationPrototype":
				root = decl.Initializer()
			case "domainOperationPrototypes":
				site = decl.Initializer()
			}
		}
	}
	if root == nil || site == nil || !ast.IsCallExpression(root) || !ast.IsNewExpression(site) {
		t.Fatal("original module producer/constructor missing")
	}
	module := sourceStagedModuleOwner(root)
	key := sourceStagedOperationKey{declaration: module, operation: root, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: root.Expression(), field: "direct-input-invocation"}}
	cached := work.operationRecipes[key]
	if !validNativeInputInvocationRecipe(cached) || work.nativeInputInvocationCurrent(cached) {
		t.Fatal("clone lost source description or inherited current law")
	}
	work.observeRequestedNativeInputInvocation(facts, sourceStagedOperationID{}, owner)
	if work.nativeInputInvocationCurrent(work.operationRecipes[key]) {
		t.Fatal("unadopted source invocation borrowed task authority")
	}
	// This owning dispatcher prepares the actual constructor source, registers its
	// typed demand before recovery, executes the queued producer and applies ACKs.
	work.prepareOperationUses(facts, owner)
	current := work.operationRecipes[key]
	id, adopted := work.operationIDs[key]
	if !adopted || !work.nativeInputInvocationCurrent(current) || id.epoch != work.operationEpoch || work.operations[id.index].revision == 0 || !work.operations[id.index].delta.extracted {
		t.Fatal("demanded original module source task did not renew local law")
	}
	state := &work.operations[id.index]
	for _, required := range nativeInputInvocationRequirements(current.nativeGet) {
		if !operationContainsRequest(state.delta.required, required) {
			t.Fatal("renewed law dropped original full Effects/Get premise")
		}
	}
	resumed := false
	for _, subscriber := range state.subscribers {
		parent := work.operationRecipes[subscriber.request.reading].memberSource
		if parent == nil || parent.coverage == nil || parent.parent.producer.operation != site {
			continue
		}
		if subscriber.blocked || subscriber.applied != state.revision || !sameOperationRequest(subscriber.request, nativeInputInvocationReading(current.nativeGet.inputInvocation.request, parent.request)) {
			t.Fatal("constructor reader did not apply exact current producer revision")
		}
		if !operationContainsRequest(work.operationRecipes[parent.request.producer].delta.required, subscriber.request) {
			t.Fatal("initial constructor C lost source subscription")
		}
		observation := work.constructionEffectsObserved[parent.parent.producer]
		callee := work.operationRecipes[stagedConstructionRequest(parent.parent, "callee").producer]
		if observation == nil || observation.generation != work.operationGeneration || observation.constructor == nil || observation.root.producer.operation != site || !callee.delta.extracted {
			t.Fatal("ACK did not resume original constructor callee observation")
		}
		resumed = true
	}
	if !resumed {
		t.Fatal("actual later constructor never subscribed to original module law")
	}
	before := state.revision
	queued := len(work.extractionQueue)
	work.prepareOperationUses(facts, owner)
	for _, task := range work.extractionQueue[queued:] {
		if task.operation == id && !task.delivery {
			t.Fatal("current source reuse queued another producer traversal")
		}
	}
	work.observeRequestedNativeInputInvocation(facts, id, owner)
	if state.revision != before || work.operations[id.index].writerSourceRunning {
		t.Fatal("cached/current source use reentered task or changed revision")
	}
}
