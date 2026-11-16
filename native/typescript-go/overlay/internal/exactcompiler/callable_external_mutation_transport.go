package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// External mutation operators are passive canonical-body facts. Ordinary
// SOURCE Calls transport them with their actual installed inputs; a terminal
// runtime arm needs the final real Get/BODY subscriber, not declaration reach.
func (work *callableEffectWork) transferExternalMutation(facts []callableFacts, subscriber sourceRelativeCallSubscriber, m *sourceRelativeFieldMutation) ([]EnvironmentEffectSource, bool) {
	if !work.externalFieldMutationSourceCurrent(m) || m.externalActive || subscriber.returned != nil || subscriber.caller < 0 || subscriber.caller >= len(facts) {
		return nil, false
	}
	call := subscriber.call
	if call.kind != relativeDemandEffects || call.invocation.declaration != m.scope || call.legacyInputs || call.inputConsumerWait != nil {
		return nil, false
	}
	var bound sourceRelativeBoundInputs
	if call.sourceInputs != nil && sameSourceRelativeInvocation(call.sourceInputs.invocation, call.invocation) && sameSourceRelativeInputEnvelope(call.invocation, call.sourceInputs.bindings) {
		bound = call.sourceInputs.bindings
	} else if call.inputs != nil && call.inputs.delivered && sameSourceRelativeInvocation(call.inputs.request, call.invocation) && sameSourceRelativeInputEnvelope(call.invocation, call.inputs.relative) {
		bound = call.inputs.relative
	} else {
		return nil, false
	}
	if bound.unsupported != relativeInputsSupported {
		return nil, false
	}
	next := cloneRelativeFieldMutation(m)
	application := sourceFieldMutationApplication{scopeBefore: m.scope, scopeAfter: facts[subscriber.caller].node, invocation: cloneStagedWriterInvocation(call.invocation), bound: cloneSourceRelativeBoundInputs(bound), inputs: call.inputs, sourceInputs: call.sourceInputs}
	if subscriber.getterReader != nil {
		copy := *subscriber.getterReader
		application.getterReader = &copy
		next.externalActive = true
	}
	next.scope = application.scopeAfter
	next.applications = []sourceFieldMutationApplication{application}
	if !validRelativeFieldMutationShape(next) {
		return nil, false
	}
	return []EnvironmentEffectSource{relativeMutationEffect(next, facts[subscriber.caller].summary.Name)}, true
}

func validExternalMutationApplication(a sourceFieldMutationApplication, scope *ast.Node, active bool) bool {
	if a.scopeBefore == nil || a.scopeAfter != scope || a.invocation.declaration != a.scopeBefore || !sameSourceRelativeInputEnvelope(a.invocation, a.bound) || a.before.kind != relativeEndpointUnknown || a.after.kind != relativeEndpointUnknown || active != (a.getterReader != nil) {
		return false
	}
	if a.inputs != nil {
		return a.sourceInputs == nil && a.inputs.delivered && sameSourceRelativeInvocation(a.inputs.request, a.invocation) && sameInstalledMemberBoundInputs(a.inputs.relative, a.bound)
	}
	return a.sourceInputs != nil && sameSourceRelativeInvocation(a.sourceInputs.invocation, a.invocation) && sameInstalledMemberBoundInputs(a.sourceInputs.bindings, a.bound)
}

func (work *callableEffectWork) externalMutationApplicationCurrent(m *sourceRelativeFieldMutation, a sourceFieldMutationApplication) bool {
	if !validExternalMutationApplication(a, m.scope, m.externalActive) {
		return false
	}
	consumer, known := work.memberNodes[a.scopeAfter]
	producer, body := work.memberNodes[a.scopeBefore]
	if !known || !body || consumer < 0 || consumer >= len(work.operationFacts) || producer < 0 || producer >= len(work.operationFacts) || producer >= len(work.stagedRevisions) {
		return false
	}
	// The predecessor canonical operator must actually exist. This is a passive
	// immutable summary membership check, not recursive currentness/closure.
	predecessor := a.scopeBefore == m.externalSource.consumer
	if !predecessor {
		for _, effect := range work.operationFacts[producer].summary.DirectEffectSources {
			prior := effect.relativeMutation
			predecessor = predecessor || prior != nil && prior.external != nil && prior.scope == a.scopeBefore && !prior.externalActive && sameMutationExternalOrigin(prior, m) && sameOperationRequest(prior.field, m.field)
		}
	}
	if !predecessor {
		return false
	}
	if a.getterReader != nil {
		id, adopted := work.operationIDs[a.getterReader.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		for _, getter := range work.operations[id.index].getters {
			if getter.declaration == a.scopeBefore && getter.inputs == a.inputs && getter.bodyTransferred && getter.bodyReady && sameOperationRequest(getter.demand.request, *a.getterReader) {
				dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
				return dependency != nil && !dependency.invalid && !dependency.projectionPending && work.operationFacts[producer].staged.ready && dependency.consumed == work.stagedRevisions[producer]
			}
		}
		return false
	}
	installed := false
	for _, call := range work.operationFacts[consumer].staged.calls {
		installed = installed || call.inputs == a.inputs && call.sourceInputs == a.sourceInputs && sameSourceRelativeInvocation(call.invocation, a.invocation)
	}
	dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, stagedDeclarationCallEdge(work.operationFacts[consumer].summary.ID, a.invocation)}]
	return installed && dependency != nil && !dependency.invalid && !dependency.projectionPending && work.operationFacts[producer].staged.ready && dependency.consumed == work.stagedRevisions[producer]
}

func (work *callableEffectWork) recordCanonicalMutation(facts []callableFacts, actor int, m *sourceRelativeFieldMutation) bool {
	if actor < 0 || actor >= len(facts) {
		return false
	}
	before := len(facts[actor].summary.DirectEffectSources)
	accepted := appendOperationMutation(&facts[actor], m)
	if accepted && len(facts[actor].summary.DirectEffectSources) != before {
		work.inputDataChanged = true
	}
	return accepted
}
