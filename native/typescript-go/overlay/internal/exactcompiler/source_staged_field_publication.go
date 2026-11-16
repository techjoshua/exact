package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// liveStagedFieldGet authenticates the synchronous typed source Get only. The
// semantic owner separately establishes Has/Get accounting and observation phase.
// Copied queries, normal frames, another receiver/field and expired generations
// cannot inherit the issuer. No graph fact retains this borrow or observation.
func (query *sourceValueQuery) liveStagedFieldGet(get *sourceGetInputs) bool {
	if query == nil {
		return false
	}
	borrow := query.stagedFieldGet
	return borrow != nil && borrow.issuer == query && query.owner != nil && query.owner == borrow.owner && query.owner.generation == borrow.generation && get != nil && get.stagedEffects == borrow && query.dependenciesOnly && query.inputs == nil && query.operation == nil && query.relativeInputCut(borrow.operation) == borrow.cut && get.operation == borrow.operation && get.propertyKey == borrow.field && get.receiver.node == borrow.receiver && len(get.receiver.path) == 0
}

// stagedFieldWorkOwner checks the immutable compilation identities shared with
// the work owner. Dependency queries deliberately own distinct mutable values,
// histories and acquisitions, so their value-owner pointer must not be shared.
// The separate live Get guard still requires this exact query as issuer.
func (query *sourceValueQuery) stagedFieldWorkOwner(owner *executableBodyOwner) bool {
	return query != nil && query.owner != nil && owner != nil && owner.values != nil && query.executable == owner && query.owner.checker == owner.checker && query.owner.program == owner.values.program && query.owner.generation == owner.values.generation
}

// publishStagedFieldDisposition lends the original semantic owner's detached
// status to this exact source request. Matching receipt metadata alone cannot
// publish. Observation reduction is owned by the Has/Get source module. This
// sink supplies no value/absence/normal/NoWrites receipt or empty-atom authority.
func (query *sourceValueQuery) publishStagedFieldDisposition(get *sourceGetInputs, disposition sourceStagedFieldDisposition) bool {
	if !query.liveStagedFieldGet(get) {
		return false
	}
	borrow := query.stagedFieldGet
	if borrow.disposition == nil || disposition.operation != borrow.operation || disposition.receiver != borrow.receiver || disposition.field != borrow.field || disposition.cut != borrow.cut {
		return false
	}
	observation := borrow.observation
	if observation == nil || observation.phase != stagedFieldObservationFinished || disposition.has != observation.effects.has || disposition.get != observation.effects.get || disposition.kind != classifyStagedFieldObservation(observation) || len(disposition.invoked) != len(observation.effects.invoked) || !operationPrefix(disposition.invoked, observation.effects.invoked, sameOperationInvocation) {
		return false
	}
	// Capture the actual terminal while its original observation is still live.
	// Caller-supplied/descriptive terminal fields never supply this event.
	disposition.terminal = sourceStagedFieldTerminal{
		observed: true, request: borrow.request, generation: borrow.generation, epoch: borrow.argumentEpoch,
		presence: observation.presence, hasSeen: observation.hasSeen, getSeen: observation.getSeen,
		sourceHas: observation.sourceHas, sourceGet: observation.sourceGet, getBypassed: observation.getBypassed,
		hasTraversal: observation.hasTraversal, getTraversal: observation.getTraversal,
	}
	return borrow.disposition(disposition)
}

// recordStagedFieldDisposition retains source-owned status and notifies existing
// subscribers, including a disposition-only revision. Required body/receiver,
// predecessor, writer and prototype work still gates extraction/closure. Generic
// publishOperation remains unable to turn an empty payload into coverage.
func (work *callableEffectWork) recordStagedFieldDisposition(facts []callableFacts, id sourceStagedOperationID, demand sourceStagedFieldEffectsDemand, value sourceStagedFieldDisposition, owner *executableBodyOwner) bool {
	current, valid := work.issueFieldEffectsDemand(facts, id, owner)
	if !valid || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) || value.operation != demand.request.producer.operation || value.receiver != demand.receiver.expression || value.field != demand.request.producer.selector.field || value.kind > stagedFieldDispositionSources || value.has > sourceEffectsBypassed || value.get > sourceEffectsBypassed {
		return false
	}
	state := &work.operations[id.index]
	if prior := state.fieldDisposition; prior != nil && prior.operation == value.operation && prior.receiver == value.receiver && prior.field == value.field && prior.cut == value.cut && prior.has == value.has && prior.get == value.get && prior.kind == value.kind && sameStagedFieldTerminal(prior.terminal, value.terminal) && len(prior.invoked) == len(value.invoked) && operationPrefix(prior.invoked, value.invoked, sameOperationInvocation) {
		return true
	}
	value.invoked = cloneOperationDelta(sourceStagedOperationDelta{invoked: value.invoked}).invoked
	state.fieldDisposition = &value
	state.delta = cloneOperationDelta(work.operationRecipes[state.key].delta)
	state.delta.extracted = fieldReceiptExtracted(state, value)
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}

// fieldReceiptExtracted means the original semantic producer has transferred
// its complete local Effects representation. Known getters must have their
// exact original binder/required-summary association. Body and input readiness,
// source discovery and eager dependencies still gate graph closure separately.
func fieldReceiptExtracted(state *sourceStagedOperationState, value sourceStagedFieldDisposition) bool {
	if value.kind == stagedFieldDispositionUnknown || value.has != sourceEffectsAccounted || value.get != sourceEffectsAccounted && value.get != sourceEffectsBypassed {
		return false
	}
	for _, invoked := range value.invoked {
		owned := false
		for _, getter := range state.getters {
			if getter.declaration != invoked.declaration || getter.demand.request.producer.operation != invoked.operation || getter.inputs == nil || !getter.inputs.delivered || getter.inputs.bound.operation != invoked.operation {
				continue
			}
			// The graph request and original binder have distinct use cuts.
			// Compare the receipt with the real binder's receiver source, keeping
			// both original cuts intact rather than retargeting an acquired scope.
			for _, binding := range getter.inputs.bound.bindings {
				if binding.target.kind != relativeRoleReceiver || binding.target.declaration != getter.declaration {
					continue
				}
				for _, receiver := range binding.sources {
					owned = owned || sameOperationEndpoint(receiver, invoked.alternative.endpoint)
				}
			}
			if owned {
				break
			}
		}
		if !owned {
			return false
		}
	}
	return true
}

// recordStagedFieldRead is called at an actual terminal member Get, before
// optional returned-value projection. Refused writer/receiver coverage remains
// independent, while the source observer retains known getter associations.
func (query *sourceValueQuery) recordStagedFieldRead(get *sourceGetInputs, getter *ast.Node, accounting sourceEffectAccounting, result *accessorCandidates) {
	if get == nil || get.stagedEffects == nil {
		return
	}
	if result.opaque || result.receiverIncomplete || accounting != sourceEffectsAccounted {
		accounting = sourceEffectsRefused
	}
	query.observeStagedFieldRead(get, getter, accounting, get.stagedEffects.observation)
}
