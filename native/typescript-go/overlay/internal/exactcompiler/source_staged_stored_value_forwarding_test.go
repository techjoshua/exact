package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Reading an inherited data callable transports its original Value relationship.
// It must not turn storage into invocation, even when source delivery is late.
func TestStagedStoredValueForwardingSourceJourney(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"data", `export function invoke(){Object.defineProperty(Object.prototype,'get',{value:()=>window.name});return Object.defineProperty({},'run',{})}`},
		{"unknown and authored writes", `declare function mutate(value:object):void;export function invoke(){Object.defineProperty(Object.prototype,'get',{value:()=>window.name});Object.assign(Object.prototype,{unrelated:()=>document.title});mutate(Object.prototype);return Object.defineProperty({},'run',{})}`},
	} {
		for _, reverse := range []bool{false, true} {
			for _, late := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/reverse=%t/late=%t", row.name, reverse, late), func(t *testing.T) {
					withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, reader *ast.Node) {
						facts, work, writer := storedValueForwardingSourceWork(t, query, reader, reverse)
						readerKey := storedValueForwardingFieldKey(reader, "get", relativeDemandEffects)
						readerID, ok := work.operationIDs[readerKey]
						if !ok {
							t.Fatal("reader field membership missing before extraction")
						}
						if late {
							work.prepareFieldGetterRequirements(facts, readerID, query.executable)
							work.consumeFieldGetterSource(facts, readerID, query.executable)
							writerKey := storedValueForwardingFieldKey(writer, "value", relativeDemandDirectExposure)
							writerRecipe, registered := work.operationRecipes[writerKey]
							if !registered || len(writerRecipe.delta.exposures) != 0 {
								t.Fatal("late control did not precede writer Value extraction")
							}
							reading := work.operations[readerID.index].effectsDemand
							if reading == nil {
								t.Fatal("reader Get did not issue its original demand")
							}
							request := nativeFieldExposureRequest(writerRecipe.nativeGet, "value", reading.request)
							found := false
							for _, use := range facts[work.memberNodes[readerKey.declaration]].staged.operationUses {
								found = found || use.installed != nil && sameOperationRequest(use.request, request)
							}
							if !found {
								t.Fatal("original reader Get did not subscribe before Value arrival")
							}
						}
						work.prepareOperationUses(facts, query.executable)
						readerState := work.operations[readerID.index]
						if len(readerState.getters) != 0 {
							t.Fatal("reading stored data invoked a getter body")
						}
						projectionKey := readerKey
						projectionKey.kind = relativeDemandDirectExposure
						projection, registered := work.operationRecipes[projectionKey]
						if !registered || len(projection.fieldForwards) != 1 || len(projection.delta.exposures) != 1 {
							t.Fatal("source-produced stored Value did not reach reader projection")
						}
						forward := projection.fieldForwards[0]
						writerKey := storedValueForwardingFieldKey(writer, "value", relativeDemandDirectExposure)
						writerProjection := work.operationRecipes[writerKey]
						if len(writerProjection.delta.exposures) != 1 || !sameOperationAlternative(forward.alternative, writerProjection.delta.exposures[0]) || !sameOperationAlternative(projection.delta.exposures[0], forward.alternative) {
							t.Fatal("forward changed the original endpoint or creating association")
						}
						endpoint := forward.alternative.endpoint
						if endpoint.producer != writer || endpoint.get != restrictedInvocationArguments(writer.AsCallExpression())[2] || endpoint.cut.operation != writer || endpoint.cut.reading != writer || forward.alternative.creating != nil {
							t.Fatal("capture-free writer endpoint was retargeted to reader cut")
						}
						reading := readerState.effectsDemand
						if reading == nil || forward.source.request.producer.operation != writer || !sameOperationRequest(forward.request, nativeFieldExposureRequest(forward.source, "value", reading.request)) || forward.request.reading != readerKey || forward.request.cut != forward.source.request.cut {
							t.Fatal("forward lost exact writer request or original reader Get association")
						}
						projectionRequest := projection.nativeGet.request
						projectionRequest.producer = projectionKey
						roles, valid := fieldSourceRequests(projectionRequest)
						parent := projection.nativeGet.request
						parent.producer = readerKey
						expected := []sourceStagedOperationRequest{parent, roles.ownWriters, roles.prototype, forward.source.request, forward.request}
						if !valid || len(projection.delta.required) != len(expected) {
							t.Fatal("reader projection lost base or writer prerequisites")
						}
						for i, request := range expected {
							if !sameOperationRequest(projection.delta.required[i], request) {
								t.Fatalf("projection prerequisite %d changed producer/cut/reading", i)
							}
						}
						for _, request := range writerProjection.delta.required[1:] {
							if request.producer.kind != relativeDemandDirectExposure {
								t.Fatal("writer Value coverage was replaced by Effects")
							}
						}
						for _, effect := range facts[work.memberNodes[readerKey.declaration]].summary.EffectSources {
							if effect.Environment == "browser" && effect.Description == "window" {
								t.Fatal("data forwarding activated stored window callback")
							}
						}
						callback := facts[installationFactIndex(t, facts, endpoint.expression)]
						known := false
						for _, effect := range callback.summary.EffectSources {
							known = known || effect.Environment == "browser" && effect.Description == "window"
						}
						if !known {
							t.Fatal("dormancy control lost the callback's own browser effect")
						}
						if work.closedOperationDependencies()[readerID.index] {
							t.Fatal("known forwarding prefix acknowledged pending reader debts")
						}
						wrong := forward
						wrong.request.cut = reading.request.cut
						if validStagedFieldForward(projection, wrong) {
							t.Fatal("reader cut substituted for original writer cut")
						}
						wrong = forward
						wrong.request.producer.operation = reader
						if validStagedFieldForward(projection, wrong) {
							t.Fatal("reader operation substituted for original writer producer")
						}
						wrong = forward
						wrong.request.reading.selector.field = "value"
						if validStagedFieldForward(projection, wrong) {
							t.Fatal("another field Get inherited forwarded Value")
						}
					})
				})
			}
		}
	}
}

// Accessor installation differs from data storage at the same original Get.
func TestStagedStoredValueForwardingAccessorRemainsEager(t *testing.T) {
	const source = `export function invoke(){Object.defineProperty(Object.prototype,'get',{get:()=>window.name});return Object.defineProperty({},'run',{})}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, reader *ast.Node) {
		facts, work, _ := storedValueForwardingSourceWork(t, query, reader, true)
		work.prepareOperationUses(facts, query.executable)
		key := storedValueForwardingFieldKey(reader, "get", relativeDemandEffects)
		state := work.operations[work.operationIDs[key].index]
		if len(state.getters) != 1 || state.getters[0].installed == nil || !state.getters[0].bodyTransferred {
			t.Fatal("actual Get did not transfer known installed accessor effects")
		}
		projectionKey := key
		projectionKey.kind = relativeDemandDirectExposure
		if len(work.operationRecipes[projectionKey].fieldForwards) != 0 {
			t.Fatal("accessor invocation became data forwarding")
		}
		if work.closedOperationDependencies()[work.operationIDs[key].index] {
			t.Fatal("known accessor effects paid independent installation/Value debts")
		}
	})
}

// A different property or unrepresented capture remains pending without a
// fabricated callable prefix. These are source relationships, not empty values.
func TestStagedStoredValueForwardingUnrelatedSources(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"other key", `export function invoke(){Object.defineProperty(Object.prototype,'unrelated',{value:()=>window.name});return Object.defineProperty({},'run',{})}`},
		{"captured value", `export function invoke(callback:()=>string){Object.defineProperty(Object.prototype,'get',{value:()=>callback()});return Object.defineProperty({},'run',{})}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, reader *ast.Node) {
				facts, work, _ := storedValueForwardingSourceWork(t, query, reader, false)
				work.prepareOperationUses(facts, query.executable)
				key := storedValueForwardingFieldKey(reader, "get", relativeDemandDirectExposure)
				recipe := work.operationRecipes[key]
				if len(recipe.fieldForwards) != 0 || len(recipe.delta.exposures) != 0 {
					t.Fatal("unrelated or unsupported source supplied forwarded Value")
				}
				key.kind = relativeDemandEffects
				id, registered := work.operationIDs[key]
				if !registered || work.closedOperationDependencies()[id.index] {
					t.Fatal("unsupported source became empty completed field")
				}
			})
		})
	}
}

func storedValueForwardingFieldKey(call *ast.Node, field string, kind sourceRelativeDemandKind) sourceStagedOperationKey {
	return sourceStagedOperationKey{declaration: enclosingCallableNode(call), operation: call, kind: kind, selector: sourceStagedOperationSelector{occurrence: restrictedInvocationArguments(call.AsCallExpression())[2], field: field}}
}

// Registration enters the actual selected member owner. Source ordering changes
// delivery order only, never the original installation or Get relationships.
func storedValueForwardingSourceWork(t *testing.T, query *sourceValueQuery, reader *ast.Node, reverse bool) ([]callableFacts, *callableEffectWork, *ast.Node) {
	t.Helper()
	facts := installationSourceFacts(query)
	var writer *ast.Node
	walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && node != reader && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
			writer = node
		}
		return !ast.IsFunctionLike(node)
	})
	if writer == nil {
		t.Fatal("missing original writer installation")
	}
	work := &callableEffectWork{extracting: -1}
	calls := []*ast.Node{writer, reader}
	if reverse {
		calls[0], calls[1] = calls[1], calls[0]
	}
	for _, call := range calls {
		registerInstallationSource(t, work, facts, query, call)
	}
	return facts, work, writer
}
