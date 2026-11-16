package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These graph controls use valid original factories but deliberately leave their
// semantic observations/dependencies incomplete. ACK pays revision transfer,
// never source observation or closure. The original Session covers both owners.
func withRevisionDeliverySources(t *testing.T, inspect func(*executableBodyOwner, []callableFacts, *callableEffectWork, []sourceStagedOperationRequest, *ast.Node)) {
	t.Helper()
	withReflectiveRelevanceSource(t, `export function invoke(){Object.freeze({});return ({}) instanceof WeakMap}`, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var call, binary *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) {
				call = n
			}
			if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword {
				binary = n
			}
			return true
		})
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		caller := work.memberNodes[enclosingCallableNode(call)]
		root, owned := stagedNativeInputOccurrenceRequest(&facts[caller], call)
		if !owned {
			t.Fatal("original native request missing")
		}
		occurrence, visited := work.observeSelectedNativeGetSource(facts, caller, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: call, get: call.Expression(), request: root}, owner)
		if !visited || occurrence.source == nil {
			t.Fatal("original selected source missing")
		}
		law, registered := work.nativeGetEntryLaw(facts, occurrence.source)
		if !registered || !validStagedEntryLawRecipe(work.operationRecipes[law.producer]) {
			t.Fatal("original entry-law factory missing")
		}
		operator, owned := sourceStagedOccurrenceRequest(&facts[caller], binary, relativeDemandEffects, "revision-delivery:has-instance")
		if !owned {
			t.Fatal("original operator request missing")
		}
		lhs := stagedHasInstanceRequest(operator, "lhs-value")
		source := &sourceStagedHasInstanceSource{root: operator, request: lhs, role: "lhs-value", generation: owner.values.generation}
		recipe := sourceStagedOperationRecipe{key: lhs.producer, hasInstance: source, delta: sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binary.AsBinaryExpression().Left, producer: binary, cut: operator.cut}}}}}
		if !validStagedHasInstanceRecipe(recipe) || !work.registerOperationRecipe(facts, recipe) {
			t.Fatal("original lhs factory missing")
		}
		inspect(owner, facts, &work, []sourceStagedOperationRequest{law, lhs}, call)
	})
}

func revisionDeliveryCount(work *callableEffectWork, id sourceStagedOperationID) int {
	count := 0
	for _, task := range work.extractionQueue {
		if task.operation == id && task.delivery && !task.operationDone {
			count++
		}
	}
	return count
}

func dispatchRevisionDelivery(t *testing.T, work *callableEffectWork, facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	t.Helper()
	for i, task := range work.extractionQueue {
		if task.operation != id || !task.delivery || task.operationDone {
			continue
		}
		work.extractionQueue[i].operationDone = true
		work.extractOperation(facts, task, owner)
		return
	}
	t.Fatal("published revision did not queue its existing delivery task")
}

func TestStagedRevisionDeliveryLatePublication(t *testing.T) {
	withRevisionDeliverySources(t, func(owner *executableBodyOwner, facts []callableFacts, work *callableEffectWork, requests []sourceStagedOperationRequest, _ *ast.Node) {
		for _, request := range requests {
			id, adopted := work.requireOperation(facts, request)
			if !adopted {
				t.Fatal("valid request refused")
			}
			// The all-subscriber pass has already seen the unissued disposition.
			work.deliverOperationSubscribers(facts, id, owner)
			delta := cloneOperationDelta(work.operationRecipes[request.producer].delta)
			delta.extracted = true
			if !work.publishOperation(id, delta) {
				t.Fatal("valid late prefix refused")
			}
			if !work.publishOperation(id, delta) {
				t.Fatal("idempotent prefix refused")
			}
			if _, adopted := work.requireOperation(facts, request); !adopted {
				t.Fatal("same subscriber refused")
			}
			if revisionDeliveryCount(work, id) != 1 {
				t.Fatal("publication/subscription did not coalesce one delivery")
			}
			dispatchRevisionDelivery(t, work, facts, id, owner)
			state := &work.operations[id.index]
			sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
			if sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
				t.Fatal("late source revision was not acknowledged")
			}
			if work.closedOperationDependencies()[id.index] {
				t.Fatal("ACK fabricated missing semantic observation/dependencies")
			}
			if len(facts[work.memberNodes[request.consumer]].staged.operationUses) != 0 || len(facts[work.memberNodes[request.consumer]].summary.Calls) != 0 {
				t.Fatal("revision delivery activated an ordinary use")
			}
		}
	})
}

func TestStagedRevisionDeliveryLateSubscription(t *testing.T) {
	withRevisionDeliverySources(t, func(owner *executableBodyOwner, facts []callableFacts, sourceWork *callableEffectWork, requests []sourceStagedOperationRequest, _ *ast.Node) {
		for _, request := range requests {
			// An adopted source can publish before its first reader. This is graph
			// setup only; the valid factory and actual requireOperation own enrollment.
			work := registerCallableEffectWork(facts)
			work.operationGeneration = owner.values.generation
			work.operationEpoch = &sourceStagedOperationEpoch{}
			id := sourceStagedOperationID{epoch: work.operationEpoch, index: 1}
			work.operationIDs = map[sourceStagedOperationKey]sourceStagedOperationID{request.producer: id}
			work.operations = []sourceStagedOperationState{{}, {key: request.producer, subscribers: map[sourceStagedOperationConsumer]*sourceStagedOperationSubscriber{}}}
			delta := cloneOperationDelta(sourceWork.operationRecipes[request.producer].delta)
			delta.extracted = true
			if !work.publishOperation(id, delta) || revisionDeliveryCount(&work, id) != 0 {
				t.Fatal("unsubscribed publication queued work or failed")
			}
			if got, accepted := work.requireOperation(facts, request); !accepted || got != id {
				t.Fatal("late valid reader refused")
			}
			if revisionDeliveryCount(&work, id) != 1 {
				t.Fatal("late subscriber missed the existing revision")
			}
			dispatchRevisionDelivery(t, &work, facts, id, owner)
			sub := work.operations[id.index].subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
			if sub.blocked || sub.applied != 1 {
				t.Fatal("late subscriber did not acknowledge revision one")
			}
			stale := id
			stale.epoch = &sourceStagedOperationEpoch{}
			work.operationIDs[request.producer] = stale
			work.queueOperationDelivery(&work.operations[id.index])
			if revisionDeliveryCount(&work, id) != 0 {
				t.Fatal("another epoch queued this graph's revision")
			}
		}
	})
}

func TestStagedRevisionDeliveryRefusalRemainsSticky(t *testing.T) {
	withRevisionDeliverySources(t, func(owner *executableBodyOwner, facts []callableFacts, work *callableEffectWork, requests []sourceStagedOperationRequest, call *ast.Node) {
		request := requests[1]
		// Descriptive registration cannot turn a HasInstance value into a Call.
		// The existing typed delivery boundary must retain its rejection.
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request, call: call}) {
			t.Fatal("graph refusal control could not enroll its source request")
		}
		id := work.operationIDs[request.producer]
		delta := cloneOperationDelta(work.operationRecipes[request.producer].delta)
		delta.extracted = true
		if !work.publishOperation(id, delta) {
			t.Fatal("original prefix refused")
		}
		dispatchRevisionDelivery(t, work, facts, id, owner)
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if !sub.blocked || sub.applied != 0 || sub.consumed != state.revision {
			t.Fatal("typed refusal became ACK")
		}
		// Even a later valid empty-tail use cannot clear that rejected prefix.
		consumer := work.memberNodes[request.consumer]
		facts[consumer].staged.operationUses[0].call = nil
		work.queueOperationDelivery(state)
		dispatchRevisionDelivery(t, work, facts, id, owner)
		if !sub.blocked || sub.applied != 0 {
			t.Fatal("later delivery cleared a sticky rejection")
		}
	})
}
