package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original own-data Get lends its known callable to the typed writer Value
// role. That prefix must reach its parent without becoming a Call or completing
// the independently pending writer/prototype source population.
func TestStagedFieldValueSourceDeliveryOriginalGet(t *testing.T) {
	const source = `export function invoke(){Object.defineProperty(Object.prototype,'value',{get:()=>window.name});return Object.defineProperty({},'run',{})}`
	for _, reverse := range []bool{false, true} {
		t.Run(fmt.Sprintf("reverse=%t", reverse), func(t *testing.T) {
			withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, reader *ast.Node) {
				facts, work, writer := storedValueForwardingSourceWork(t, query, reader, reverse)
				work.prepareOperationUses(facts, query.executable)
				key := storedValueForwardingFieldKey(writer, "get", relativeDemandDirectExposure)
				recipe, registered := work.operationRecipes[key]
				if !registered || recipe.nativeGet == nil || len(recipe.delta.exposures) != 1 {
					t.Fatal("original writer Get did not publish its known callable")
				}
				parentRequest := recipe.nativeGet.request
				parentRequest.producer = key
				roles, valid := fieldSourceRequests(parentRequest)
				if !valid || len(recipe.delta.required) != 3 || !sameOperationRequest(recipe.delta.required[1], roles.ownWriters) || !sameOperationRequest(recipe.delta.required[2], roles.prototype) {
					t.Fatal("parent lost typed Value source requirements")
				}
				sourceID, required := work.operationIDs[roles.ownWriters.producer]
				if !required {
					t.Fatal("writer Value source was not registered")
				}
				state := work.operations[sourceID.index]
				if state.revision == 0 || state.delta.extracted || len(state.delta.exposures) != 1 {
					t.Fatal("known own-data prefix missing or incomplete source became ready")
				}
				alternative := state.delta.exposures[0]
				if !sameOperationAlternative(alternative, recipe.delta.exposures[0]) || alternative.endpoint.producer != writer || alternative.endpoint.get != restrictedInvocationArguments(writer.AsCallExpression())[2] || alternative.endpoint.cut.operation != writer || alternative.endpoint.cut.reading != writer {
					t.Fatal("source delivery changed original callable relationship")
				}
				subscriber := state.subscribers[sourceStagedOperationConsumer{roles.ownWriters.consumer, roles.ownWriters.edge}]
				if subscriber == nil || !sameOperationRequest(subscriber.request, roles.ownWriters) || subscriber.blocked || subscriber.applied != state.revision {
					t.Fatal("typed non-call Value source delivery was rejected or left unapplied")
				}
				parentID, requested := work.operationIDs[key]
				if !requested || len(work.operations[parentID.index].delta.exposures) != 1 || !sameOperationAlternative(work.operations[parentID.index].delta.exposures[0], alternative) {
					t.Fatal("source delivery duplicated or lost parent alternative")
				}
				writerEffects := storedValueForwardingFieldKey(writer, "get", relativeDemandEffects)
				if len(work.operations[work.operationIDs[writerEffects].index].getters) != 0 {
					t.Fatal("own-data Value delivery invoked its stored callable")
				}
				if len(state.delta.invoked)+len(state.delta.effects)+len(state.delta.relative) != 0 {
					t.Fatal("Value source delivery acquired invocation or Effects authority")
				}
				prototypeID, prototypeRegistered := work.operationIDs[roles.prototype.producer]
				closed := work.closedOperationDependencies()
				if !prototypeRegistered || work.operations[prototypeID.index].delta.extracted || closed[sourceID.index] || closed[parentID.index] || closed[prototypeID.index] {
					t.Fatal("known writer prefix completed independent Value coverage")
				}
				root := recipe.nativeGet.request.producer
				rootID, rootRegistered := work.operationIDs[root]
				if !rootRegistered || closed[rootID.index] {
					t.Fatal("Value source prefix paid native root debts")
				}
				// Repeating stable work must not replay the original Get or
				// enqueue another delivery of an already consumed source prefix.
				queued := len(work.extractionQueue)
				revision := work.operations[sourceID.index].revision
				if work.extractionHead != queued {
					t.Fatal("source journey left extraction work undrained")
				}
				work.prepareOperationUses(facts, query.executable)
				if len(work.extractionQueue) != queued || work.extractionHead != len(work.extractionQueue) || work.operations[sourceID.index].revision != revision {
					t.Fatal("unchanged preparation queued work or republished source Value")
				}
			})
		})
	}
}
