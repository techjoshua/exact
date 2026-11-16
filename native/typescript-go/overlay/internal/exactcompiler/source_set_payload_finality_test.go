package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The unchanged whole fixture supplies both actual producer and original writer.
// No test-created issuer, operation, revision or queued task establishes entry.
func TestOriginalSetPayloadFinalityAndRevision(t *testing.T) {
	var expired func() bool
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		id, entered := work.operationIDs[root.producer]
		if !entered {
			t.Fatal("ENTRY: original Set root absent")
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		if sub == nil || sub.blocked || sub.applied != state.revision || len(sub.readWrites) == 0 {
			t.Fatal("ENTRY: current genuine writer payload absent")
		}
		var native *sourceStagedNativeGetSource
		for _, access := range sub.readWrites {
			if access.mutation == "array-mutation" {
				native = work.operationRecipes[access.arrayCall.producer].nativeGet
			}
		}
		if native == nil || !work.arrayPushPrefixCurrent(native) {
			t.Fatal("ENTRY: original native mutation was not consumed")
		}
		set := work.operationRecipes[stagedAssignmentRequest(root, "set").producer]
		recipe := work.operationRecipes[root.producer]
		if set.delta.extracted || recipe.delta.extracted || state.delta.extracted || len(recipe.delta.readWrites) == 0 || !operationDeltaPrefix(recipe.delta, state.delta) || !operationDeltaPrefix(state.delta, recipe.delta) {
			t.Fatal("pending SOURCE payload was sealed or known prefix not published")
		}
		caller := work.memberNodes[root.consumer]
		producer := work.memberNodes[native.request.consumer]
		var bodyEdge *CallEdge
		for i := range facts[caller].summary.Calls {
			e := &facts[caller].summary.Calls[i]
			if e.Resolved && e.TargetID == facts[producer].summary.ID && facts[caller].fieldEdgeOperations[e.ID] == root.use.AsBinaryExpression().Left {
				bodyEdge = e
			}
		}
		if bodyEdge == nil {
			t.Fatal("ENTRY: genuine original setter MAY dependency absent")
		}
		d := work.stagedRequired[sourceStagedDependencyKey{caller, bodyEdge.ID}]
		if d == nil || d.invalid || d.producer != producer || d.consumed == 0 || d.consumed != work.stagedRevisions[producer] || !validSetSourceRevisionCut(d.operation, d.cut, root.use.AsBinaryExpression().Left, root.use) {
			t.Fatal("BODY revision was not consumed by the original Set owner")
		}
		before, observation := state.revision, work.assignmentObserved[root.producer]
		count := len(sub.readWrites)
		if work.refreshSetSourceBodyRevision(facts, caller, producer, *bodyEdge, owner) || state.revision != before || work.assignmentObserved[root.producer] != observation || len(sub.readWrites) != count {
			t.Fatal("unchanged BODY revision reissued a Set receipt or payload")
		}
		bad := d.cut
		bad.reading = root.use.AsBinaryExpression().Right
		if validSetSourceRevisionCut(d.operation, bad, root.use.AsBinaryExpression().Left, root.use) {
			t.Fatal("foreign RHS reading accepted as original Set revision cut")
		}
		contextual := *bodyEdge
		contextual.sourceUse = root.use
		if work.refreshSetSourceBodyRevision(facts, caller, producer, contextual, owner) || work.assignmentObserved[root.producer] != observation {
			t.Fatal("contextual foreign-use edge reissued definition SOURCE")
		}
		if !work.applySetReadWrites(sourceStagedOperationUse{request: root}, recipe.delta.readWrites) || len(sub.readWrites) != count {
			t.Fatal("current genuine prefix lost idempotent writer delivery")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if fresh.refreshSetSourceBodyRevision(clones, caller, producer, *bodyEdge, owner) || len(fresh.operationIDs) != 0 || fresh.applySetReadWrites(sourceStagedOperationUse{request: root}, recipe.delta.readWrites) {
			t.Fatal("clone acquired original producer/receipt/scheduling authority")
		}
		expired = func() bool {
			return work.refreshSetSourceBodyRevision(facts, caller, producer, *bodyEdge, owner) || work.applySetReadWrites(sourceStagedOperationUse{request: root}, recipe.delta.readWrites)
		}
	})
	if expired == nil || expired() {
		t.Fatal("released owner accepted revision refresh or actual payload delivery")
	}
}
