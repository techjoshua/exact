package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original Get publishes its writer to the exact issued member parent.
// Passive registration retains real B receipts but cannot invoke a stored body.
// Later adoption uses those receipts after the query has expired.
func TestStagedMemberWriterOriginalDelivery(t *testing.T) {
	const source = `function browser(){return window.name}function put(box:{run:()=>string},next:()=>string){box.run=next}const box={run:()=> 'safe'};put(box,browser);export function invoke(){return box.run()}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(q)
		caller := installationFactIndex(t, facts, q.effectOwner)
		request, ok := sourceStagedOccurrenceRequest(&facts[caller], call, relativeDemandEffects, "member-writer-delivery")
		if !ok {
			t.Fatal("original source request")
		}
		work := newCallableEffectWork(facts)
		revoke, installed := work.beginStagedMemberWork(q, facts, request)
		if !installed {
			t.Fatal("original member source")
		}
		q.receiverCandidates(call, nil)
		revoke()
		var parent, stored, invoked sourceStagedOperationRecipe
		for _, recipe := range work.operationRecipes {
			if recipe.writer == nil {
				continue
			}
			candidate := work.operationRecipes[recipe.writer.parent.producer]
			if candidate.memberSource == nil || !sameOperationRequest(candidate.memberSource.parent, request) {
				continue
			}
			if recipe.writer.callable {
				invoked = recipe
			} else {
				stored = recipe
				parent = candidate
			}
		}
		if parent.memberSource == nil || stored.writer == nil || invoked.writer == nil {
			t.Fatal("original member parent did not receive stored and invoked RHS sources")
		}
		if len(parent.writerRequired) != 2 || len(parent.delta.required) != 2 || parent.delta.extracted {
			t.Fatal("writer delivery lost independent member coverage")
		}
		if _, active := work.operationIDs[stored.key]; active {
			t.Fatal("passive data source adopted itself")
		}
		if _, active := work.operationIDs[invoked.key]; active {
			t.Fatal("passive callable source adopted itself")
		}
		if !stored.delta.extracted || len(stored.delta.exposures) != 1 || stored.delta.exposures[0].endpoint.expression.Name().Text() != "browser" {
			t.Fatal("original creating input did not reach dormant data subscriber")
		}
		for _, edge := range facts[caller].summary.Calls {
			if len(edge.ID) >= len(invoked.writer.request.edge) && edge.ID[:len(invoked.writer.request.edge)] == invoked.writer.request.edge {
				t.Fatal("passive source invoked a stored body")
			}
		}
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: parent.memberSource.request}) {
			t.Fatal("actual parent adoption refused")
		}
		work.prepareOperationUses(facts, q.executable)
		dataID, callID := work.operationIDs[stored.key], work.operationIDs[invoked.key]
		data := &work.operations[dataID.index]
		subscriber := data.subscribers[sourceStagedOperationConsumer{stored.writer.request.consumer, stored.writer.request.edge}]
		if data.revision == 0 || subscriber == nil || subscriber.blocked || subscriber.applied != data.revision || len(subscriber.constructed) != 1 {
			t.Fatal("typed data subscriber did not consume original RHS")
		}
		state := &work.operations[callID.index]
		if !state.writerProjectionSeen || len(state.writerMethods) != 1 || state.writerMethods[0].inputs == nil || !state.writerMethods[0].inputs.delivered || !state.writerMethods[0].inputsMapped || !state.writerMethods[0].transferred {
			t.Fatal("late adoption lost original Get/creating B association")
		}
		if !work.closedOperationDependencies()[callID.index] || work.closedOperationDependencies()[work.operationIDs[parent.key].index] {
			t.Fatal("RHS completion paid aggregate prior-state coverage")
		}
		packet := state.writerMethods[0].inputs
		oldCalls := len(facts[caller].summary.Calls)
		work.prepareOperationUses(facts, q.executable)
		if work.operations[callID.index].writerMethods[0].inputs != packet || len(facts[caller].summary.Calls) != oldCalls {
			t.Fatal("unchanged delivery replayed method inputs or invocation")
		}
		cloned := append([]callableFacts(nil), facts...)
		for i := range cloned {
			cloned[i].staged = cloneCallableExtraction(cloned[i].staged)
		}
		next := newCallableEffectWork(cloned)
		next.operationGeneration = q.owner.generation
		if !next.registerOperationUse(cloned, sourceStagedOperationUse{request: parent.memberSource.request}) {
			t.Fatal("clone lost descriptive source dependencies")
		}
		next.prepareOperationUses(cloned, q.executable)
		if next.closedOperationDependencies()[next.operationIDs[invoked.key].index] {
			t.Fatal("clone reused original graph B delivery")
		}
	})
}
