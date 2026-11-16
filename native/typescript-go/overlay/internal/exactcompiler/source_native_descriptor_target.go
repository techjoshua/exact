package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorTargetField is the stored field of an own descriptor, not a
// demand to perform [[Get]] on the target. Getter/setter operands stay dormant.
type sourceDescriptorTargetField uint8

const (
	descriptorTargetValue sourceDescriptorTargetField = iota
	descriptorTargetGet
	descriptorTargetSet
)

// A field is supplied by its original DATA producer. Neither the target's later
// reader bindings nor a normal descriptor/value receipt is retained here.
type sourceDescriptorTargetFieldSource struct {
	field    sourceDescriptorTargetField
	writer   *ast.Node
	data     sourceStagedOperationRequest
	receiver sourceStagedOperationRequest
	target   sourceRelativeEndpoint
}

// sourceDescriptorTargetSource occupies an existing operation recipe. Coverage
// enumerates the original own-property source population and requires original
// stored-operand DATA children. Only strong SOURCE readers depend on them; nominal result DATA does not.
type sourceDescriptorTargetSource struct {
	request     sourceStagedOperationRequest
	algorithm   sourceStagedOperationRequest
	source      *sourceStagedNativeGetSource
	generation  *projectGeneration
	cut         sourceRelativeCut
	inputs      [2]sourceDescriptorInputData
	fields      []sourceDescriptorTargetFieldSource
	required    []sourceStagedOperationRequest
	represented bool
	enumerated  bool // Descriptive completed source walk; graph observation remains separate.
}

type sourceDescriptorTargetFieldData struct {
	field        sourceDescriptorTargetField
	writer       *ast.Node
	request      sourceStagedOperationRequest
	alternatives []sourceStagedOperationAlternative
}

// The view saves delivered DATA, not authority to acquire an old target AST.
type sourceDescriptorTargetData struct {
	request sourceStagedOperationRequest
	fields  []sourceDescriptorTargetFieldData
}

func descriptorTargetRequest(source *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	r := nativeRootDebtRequest(source, "descriptor-target-own-coverage")
	r.producer.selector.occurrence = source.request.producer.operation
	return r
}

func cloneDescriptorTargetSource(source *sourceDescriptorTargetSource) *sourceDescriptorTargetSource {
	if source == nil {
		return nil
	}
	copy := *source
	for i := range copy.inputs {
		copy.inputs[i] = cloneDescriptorInputData(source.inputs[i])
	}
	copy.fields = append([]sourceDescriptorTargetFieldSource(nil), source.fields...)
	for i := range copy.fields {
		copy.fields[i].target = cloneSourceRelativeEndpoint(source.fields[i].target)
	}
	copy.required = append([]sourceStagedOperationRequest(nil), source.required...)
	return &copy
}

func sameDescriptorTargetSource(a, b *sourceDescriptorTargetSource) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || a.generation != b.generation || a.cut != b.cut || a.represented != b.represented || a.enumerated != b.enumerated || !sameOperationRequest(a.request, b.request) || !sameOperationRequest(a.algorithm, b.algorithm) || !sameNativeGetSource(a.source, b.source) || len(a.fields) != len(b.fields) || len(a.required) != len(b.required) {
		return false
	}
	for i := range a.inputs {
		if !sameDescriptorInputData(a.inputs[i], b.inputs[i]) {
			return false
		}
	}
	for i, f := range a.fields {
		g := b.fields[i]
		if f.field != g.field || f.writer != g.writer || !sameOperationRequest(f.data, g.data) || !sameOperationRequest(f.receiver, g.receiver) || !sameOperationEndpoint(f.target, g.target) {
			return false
		}
	}
	return operationPrefix(a.required, b.required, sameOperationRequest)
}

func validDescriptorTargetRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.descriptorTarget
	if recipe.installedCall != nil || recipe.installedMember != nil || recipe.nativeGet != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructed != nil || recipe.constructedDisposition != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.entryLaw != nil || recipe.assignment != nil || recipe.constructionEffects != nil || recipe.hasInstance != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.descriptorSource != nil || recipe.frameworkEffects != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	if s == nil || !validDescriptorRetrieval(s.source) || s.generation == nil || s.generation != s.source.descriptorRead.generation || !sameOperationRequest(s.algorithm, nativeRootDebtRequest(s.source, "algorithm")) || !sameOperationRequest(s.request, descriptorTargetRequest(s.source)) || recipe.key != s.request.producer || len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative) != 0 {
		return false
	}
	base, supported := descriptorTargetBaseRequired(s.source)
	if !supported || len(s.required) < len(base) || !operationPrefix(base, s.required, sameOperationRequest) || len(recipe.delta.required) != len(s.required) || !operationPrefix(s.required, recipe.delta.required, sameOperationRequest) {
		return false
	}
	if !s.enumerated {
		return !s.represented && !recipe.delta.extracted && s.cut == (sourceRelativeCut{}) && len(s.fields) == 0 && len(s.required) == len(base) && len(s.inputs[0].alternatives)+len(s.inputs[1].alternatives) == 0
	}
	if s.cut.operation != s.source.request.producer.operation || s.cut.use == nil {
		return false
	}

	for i, input := range s.inputs {
		if !validDescriptorInputData(s.source.descriptorRead, i, input) {
			return false
		}
	}
	if len(recipe.delta.required) != len(s.required) || !operationPrefix(s.required, recipe.delta.required, sameOperationRequest) || recipe.delta.extracted && !s.represented {
		return false
	}
	for _, field := range s.fields {
		if field.field > descriptorTargetSet || field.writer == nil || field.data.producer.operation == nil || field.receiver.producer.operation == nil || field.target.moduleConstruction == nil {
			return false
		}
	}
	return true
}

// descriptorTargetCurrent is local to the already-running closure solver. It
// cannot call closedOperationDependencies or refresh a source observation.
func (work *callableEffectWork) descriptorTargetCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validDescriptorTargetRecipe(recipe) || !recipe.descriptorTarget.enumerated || !recipe.delta.extracted || recipe.descriptorTarget.generation != work.operationGeneration || work.operationGeneration == nil || !work.operationGeneration.active {
		return false
	}
	id, present := work.operationIDs[recipe.key]
	if !present || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	observation := state.descriptorTargetObservation
	if state.invalid || !state.dependenciesRegistered || !state.delta.extracted || state.revision == 0 || observation == nil || observation.work != work || observation.epoch != work.operationEpoch || observation.generation != work.operationGeneration || !sameOperationRequest(observation.request, recipe.descriptorTarget.request) || !sameDescriptorTargetSource(observation.source, recipe.descriptorTarget) {
		return false
	}
	for position, input := range recipe.descriptorTarget.inputs {
		if !work.descriptorInputSnapshotCurrent(recipe.descriptorTarget.source.descriptorRead, position, input) {
			return false
		}
	}
	return work.nativeEffectsGetCurrent(recipe.descriptorTarget.source)
}

func (work *callableEffectWork) descriptorTargetApplied(request sourceStagedOperationRequest) bool {
	recipe, ok := work.operationRecipes[request.producer]
	if !ok || !work.descriptorTargetCurrent(recipe) || !sameOperationRequest(recipe.descriptorTarget.request, request) {
		return false
	}
	id := work.operationIDs[request.producer]
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return subscriber != nil && sameOperationRequest(subscriber.request, request) && !subscriber.blocked && subscriber.consumed == state.revision && subscriber.applied == state.revision
}
