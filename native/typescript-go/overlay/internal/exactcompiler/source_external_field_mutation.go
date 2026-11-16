package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func sameMutationExternalOrigin(a, b *sourceRelativeFieldMutation) bool {
	if !sameOperationRequest(a.externalSource, b.externalSource) {
		return false
	}
	return a.external == nil && b.external == nil || a.external != nil && b.external != nil && *a.external == *b.external
}

// The description is an external SOURCE Get operator, not a terminal mutation.
// Only the actual installed BODY/input consumer can activate its runtime arm.
func validExternalFieldMutationShape(m *sourceRelativeFieldMutation) bool {
	if m == nil || m.external == nil || m.native.generation != nil || m.method != nil || len(m.applications) > 1 || m.scope == nil || m.target.kind != relativeEndpointUnknown || m.input.application != nil || m.input.construction || m.input.request.producer.operation != nil || len(m.input.alternatives) != 0 || m.key.application != nil || m.key.construction || m.key.request.producer.operation != nil || len(m.key.alternatives) != 0 {
		return false
	}
	g := m.external
	if m.standardReadEmpty && !validStandardPropertyReadDescription(g) {
		return false
	}
	parent, field := fieldSourceParent(m.field)
	if !field || m.field.producer.kind != relativeDemandDirectExposure || m.name != parent.producer.selector.field || m.receiver.kind != relativeEndpointExpression || m.receiver.expression != parent.producer.selector.occurrence || g.operation == nil || g.generation == nil || !ast.IsPropertyAccessExpression(g.operation) || g.expression != g.operation.Expression() || g.declaration == nil || g.member == nil || !standardLibrarySource(ast.GetSourceFileOfNode(g.declaration)) || !standardLibrarySource(ast.GetSourceFileOfNode(g.member)) || g.standardSymbolData {
		return false
	}
	source := m.externalSource
	if len(m.applications) == 0 {
		if m.scope != source.consumer || m.externalActive {
			return false
		}
	} else if !validExternalMutationApplication(m.applications[0], m.scope, m.externalActive) {
		return false
	}
	return source.producer.operation == g.operation && source.producer.kind == relativeDemandEffects && source.consumer == source.producer.declaration && validStagedMemberObservation(source, g.cut) && g.cut.reading == g.operation && operationContainsRequest(m.required, source) && operationContainsRequest(m.required, stagedMemberCoverageRequest(source, g.expression, g.cut))
}

func (work *callableEffectWork) externalFieldMutationSourceCurrent(m *sourceRelativeFieldMutation) bool {
	if !validExternalFieldMutationShape(m) || m.external.generation != work.operationGeneration {
		return false
	}
	recipe := work.operationRecipes[m.externalSource.producer]
	if m.standardReadEmpty && work.standardPropertyReadMutationDisposition(m.external, m.externalSource) != standardPropertyReadEmpty {
		return false
	}
	for _, application := range m.applications {
		if !work.externalMutationApplicationCurrent(m, application) {
			return false
		}
	}
	return validStagedMemberExternalGetRecipe(recipe) && recipe.memberSource.generation == work.operationGeneration && recipe.memberSource.protocolSource.get != nil && *recipe.memberSource.protocolSource.get == *m.external && sameOperationRequest(recipe.memberSource.request, m.externalSource) && work.memberCoverageObserved[recipe.key] == work.operationGeneration
}

// externalFieldMutationUseCurrent does not classify an ambient declaration or
// an EnvironmentEffect as a mutation terminal. It requires this actual Get's
// represented external SOURCE branch AND a real guarded getter BODY/input edge.
// Full source coverage, BODY and field/native closure remain on the real reader.
func (work *callableEffectWork) externalFieldMutationUseCurrent(facts []callableFacts, consumer int, use sourceStagedOperationUse, m *sourceRelativeFieldMutation) bool {
	if use.installed == nil || use.call != nil || use.request.inputs == nil || !use.request.inputs.delivered || consumer < 0 || consumer >= len(facts) || !work.externalFieldMutationSourceCurrent(m) {
		return false
	}
	id, adopted := work.operationIDs[use.request.reading]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	for _, getter := range work.operations[id.index].getters {
		if getter.inputs == use.request.inputs && getter.installed != nil && getter.installed.get.cut == use.installed.cut && sameOperationEndpoint(getter.installed.get.receiver, use.installed.receiver) && getter.bodyTransferred && getter.bodyReady {
			return work.externalMutationProjectionCurrent(facts, consumer, getter, m)
		}
	}
	return false
}

// Only the actual getter subscriber's existing edge transfer table is read.
// This also supports an original immediate Call inside the getter through the
// canonical mutation phase, without pretending that a dormant body executed.
func (work *callableEffectWork) externalMutationProjectionCurrent(facts []callableFacts, consumer int, getter sourceStagedGetterRequirement, m *sourceRelativeFieldMutation) bool {
	if consumer < 0 || consumer >= len(facts) {
		return false
	}
	for _, transfer := range facts[consumer].staged.mutationTransfers[getter.edge] {
		if !transfer.represented {
			continue
		}
		for _, source := range transfer.sources {
			current := source.relativeMutation
			if current == nil || current.external == nil || !current.externalActive || current.scope != facts[consumer].node || !sameMutationExternalOrigin(current, m) || !sameOperationRequest(current.field, m.field) || len(current.applications) != 1 {
				continue
			}
			application := current.applications[0]
			if application.getterReader != nil && sameOperationRequest(*application.getterReader, getter.demand.request) && application.inputs == getter.inputs && work.externalFieldMutationSourceCurrent(current) {
				return true
			}
		}
	}
	return false
}

func (work *callableEffectWork) externalMutationReadingReady(facts []callableFacts, consumer int, getter sourceStagedGetterRequirement, source *sourceFieldMutationData) bool {
	if source == nil || source.external == nil {
		return false
	}
	parent, _ := fieldSourceParent(source.field)
	m := &sourceRelativeFieldMutation{external: source.external, externalSource: source.externalSource, scope: source.externalSource.consumer, field: source.field, receiver: source.receiver, name: parent.producer.selector.field}
	recipe := work.operationRecipes[source.externalSource.producer]
	if recipe.memberSource == nil || recipe.memberSource.protocolSource == nil {
		return false
	}
	m.required = []sourceStagedOperationRequest{source.externalSource, recipe.memberSource.protocolSource.required}
	return work.externalMutationProjectionCurrent(facts, consumer, getter, m)
}
