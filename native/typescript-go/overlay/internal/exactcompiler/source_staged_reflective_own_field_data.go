package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// completeReflectiveOwnFieldSources connects the actual finished descriptor
// literal Get to the existing Value emitter. Own-writer assignment population
// and prototype operation population remain independent. In particular an
// unrepresented prototype invocation cannot invalidate an already acquired own
// callable prefix, or become an unknown Value merely because its Effects exist.
func (work *callableEffectWork) completeReflectiveOwnFieldSources(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs) {
	if q == nil || !q.liveStagedFieldGet(get) || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationFinished {
		return
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, q.executable)
	if !issued || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) || get.operation != demand.request.producer.operation || get.receiver.node != demand.receiver.expression || get.propertyKey != demand.request.producer.selector.field || !ast.IsObjectLiteralExpression(get.receiver.node) {
		return
	}
	caller, known := work.memberNodes[demand.request.consumer]
	if !known {
		return
	}
	// The established sequence domain keeps its exact mapper and getter-result
	// policy. This new owner supplies no alternative residual rule for that path.
	if _, sequence := stagedNativeSequence(&facts[caller], q.executable); sequence {
		return
	}
	source := work.operationRecipes[demand.request.producer].nativeGet
	if source == nil || source.installation == nil || !reflectiveNative(source.kind) || source.descriptorGet != get.receiver.node || source.installation.descriptor.expression != get.receiver.node || source.request.producer.operation != get.operation || !stagedLiteralStandardPrototype(source, get.receiver.node) {
		return
	}
	if get.propertyKey != "get" && get.propertyKey != "value" {
		return
	}
	// Existing source population must actually be empty before the own-writer
	// role can extract. Any indexed assignment/Call/Get/hazard without genuine
	// Value provenance stays compiler-pending; the generic emitter retains all
	// known baseline alternatives beside that debt. The typed child mapper below owns native/external SOURCE contributions.
	// Remaining generic Get/installation producers stay pending; closed Effects
	// never supplies their missing mutation DATA.
	work.completeOriginalFieldValueSources(facts, demand, q, get, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
		return work.reflectiveMutationFieldContribution(facts, demand, q, get, request, operation, region)
	})
}
