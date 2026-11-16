package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeRequest names the registered source demand, independently of
// this borrow's observation cut. Source graph use may name the original Call
// while a definition-relative query's effectUse is nil. Neither is normalized
// into the other. DescriptorGet is the algorithm owner's semantic source anchor.
type sourceStagedNativeRequest struct {
	descriptorTarget *sourceDescriptorTargetExecution // Synchronous target SOURCE interest, never argument/normal authority.
	effectsIssuer    *sourceStagedNativeEffectsIssuer // Ordinary/source-task request issuer, never a receipt.

	observation              *sourceStagedNativeObservation    // Original adopted refresh owner; synchronous only.
	argumentIssuer           *sourceStagedNativeArgumentIssuer // Original ordinary module child descent only.
	request                  sourceStagedOperationRequest
	occurrence               *sourceStagedNativeOccurrence // Stack-local admission handoff, never part of a recipe.
	algorithmKind            sourceNativeKind              // Optional capability filter, never selection evidence.
	call, get, descriptorGet *ast.Node
}

// sourceStagedNativeInputs is supplied by the original invocation adapter owner.
// Known authenticates vector extent, not the values or effects of its elements.
// An unresolved apply/spread vector cannot be turned into omitted undefined.
// Argument evaluation, key coercion and receiver selection retain their owners.
type sourceStagedNativeInputs struct {
	operation, use *ast.Node
	cut            sourceRelativeCut
	known          bool
	actuals        []sourceRelativeEndpoint
}

// sourceStagedNativeBorrow is stack-scoped issuer state. It must never enter a
// recipe, fact, subscriber or fixed-point queue. Only detached selection payloads
// reach consumers. Copying a query copies no delivery authority, and revocation
// invalidates saved delivery closures as well as the installed query field.
type sourceStagedNativeBorrow struct {
	deliver func(*sourceValueQuery, *ast.Node, sourceValue, sourceStagedNativeInputs) bool
}

// beginStagedNativeSelection borrows an already registered original source Call.
// It does not acquire/recognize a native, execute its inputs, register an algorithm
// or settle any required work. The selected-alternative owner must publish before
// recursive input/body preparation. A post-prepare hook alone is insufficient.
// Consumers may use the source value synchronously, never retain it or this lease.
func (query *sourceValueQuery) beginStagedNativeSelection(request sourceStagedNativeRequest, consume func(sourceStagedNativeSelection)) (func(), bool) {
	if query == nil || query.owner == nil || query.owner.checker == nil || !query.dependenciesOnly || query.operation != nil || consume == nil || request.call == nil || !ast.IsCallExpression(request.call) || request.get != request.call.Expression() || request.request.producer.operation != request.call || request.request.producer.kind != relativeDemandEffects || request.request.producer.selector != (sourceStagedOperationSelector{}) || request.request.inputs != nil || request.request.consumer != query.effectOwner || request.request.producer.declaration != query.effectOwner || query.effectOwner == nil || !query.effectOwner.Contains(request.call) || request.request.use == nil {
		return func() {}, false
	}
	owner, checker, program, generation := query.owner, query.owner.checker, query.owner.program, query.owner.generation
	cut, inputs, binding, member := query.relativeInputCut(request.call), query.inputs, query.normalBindingCall, query.protectedMember
	prior := query.stagedNativeSelection
	borrowed := &sourceStagedNativeBorrow{}
	live := true
	borrowed.deliver = func(issuer *sourceValueQuery, call *ast.Node, value sourceValue, vector sourceStagedNativeInputs) bool {
		if !live || issuer != query || query.stagedNativeSelection != borrowed || query.owner != owner || owner.checker != checker || owner.program != program || owner.generation != generation || !query.dependenciesOnly || query.operation != nil || query.effectOwner != request.request.consumer || query.inputs != inputs || query.normalBindingCall != binding || query.protectedMember != member || query.relativeInputCut(request.call) != cut || call != request.call || value.native == nil || len(value.path) != 0 || !vector.known || vector.operation != request.call || vector.use != cut.use || vector.cut != cut {
			return false
		}
		// This is one alternative, not selection closure or exclusive implementation.
		// Independent source and unknown siblings remain with their issuing owner.
		consume(sourceStagedNativeSelection{selected: value, call: request.call, get: request.get, descriptorGet: request.descriptorGet, request: request.request, actuals: cloneSourceRelativeEndpoints(vector.actuals)})
		return true
	}
	query.stagedNativeSelection = borrowed
	revoked := false
	return func() {
		if revoked {
			return
		}
		revoked = true
		live = false
		query.stagedNativeSelection = prior
	}, true
}

// publishStagedNativeSelection is called only by the original selected-callee
// owner. A candidate seed or matching type/name is not such a publication. The
// return value reports synchronous delivery only, never effect-transfer ACK,
// full callee coverage, result availability, completion, or NoWrites authority.
func (query *sourceValueQuery) publishStagedNativeSelection(call *ast.Node, value sourceValue, inputs sourceStagedNativeInputs) bool {
	if query == nil || query.stagedNativeSelection == nil {
		return false
	}
	return query.stagedNativeSelection.deliver(query, call, value, inputs)
}
