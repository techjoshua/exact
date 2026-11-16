package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// A member source consumes an original assignment reference through its Set
// producer. A setter-only lookup may also transfer a possible plain writer's
// Effects without reading its old DATA value. Receiver/key/RHS/Set effects stay
// required on that original producer and observation.
func validStagedSetWriterRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if recipe.assignment != nil || recipe.hasInstance != nil || recipe.nativeGet != nil || recipe.callResult != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.constructed != nil || recipe.constructedDisposition != nil || recipe.getter != nil || recipe.returning != nil || len(recipe.fieldForwards)+len(recipe.constructedInputs)+len(recipe.constructedGroup) != 0 {
		return false
	}
	if s == nil || s.protocolSource == nil || !s.protocolSource.setEffects || s.protocolSource.get != nil || s.protocolSource.external != nil || s.protocolSource.evaluation != nil || s.generation == nil || s.extraction == nil || s.extraction.generation != s.generation || !sameOperationRequest(s.extraction.request, s.parent) || s.extraction.cut != s.candidate.cut || s.extraction.delta.extracted || !s.candidate.protocol && !s.writeEffects || s.candidate.reflective || s.candidate.runtimeUnknown || s.candidate.getContribution || s.candidate.invoking || s.coverage != nil || s.call != nil || s.getEffects != nil || stagedSetWriterOperation(s.candidate) == nil || !sameOperationRequest(s.candidate.request, s.parent) || !stagedMemberFactoryObservation(s, s.candidate.cut) || !stagedMemberFactoryParent(s) || !sameOperationRequest(s.request, stagedMemberEffectsOrReferenceRequest(s)) || recipe.key != s.request.producer || !recipe.delta.extracted {
		return false
	}
	if len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], s.protocolSource.required) || operationDeltaSize(recipe.delta) != 1 || len(s.values)+len(recipe.writerRequired) != 0 {
		return false
	}
	r := s.protocolSource.required
	if r.producer.operation != stagedSetWriterOperation(s.candidate) || r.producer.selector != (sourceStagedOperationSelector{}) || r.producer.kind != relativeDemandEffects || r.consumer != r.producer.declaration || r.inputs != nil || r.use != r.producer.operation || r.cut != (sourceRelativeCut{operation: r.use, use: r.use, reading: r.use}) {
		return false
	}
	return r.producer.declaration == s.candidate.region || s.candidate.region == nil && runtimeModuleEvaluation(r.producer.declaration) && sourceStagedOccurrenceOwned(s.candidate.operation, r.producer.declaration)
}

func (q *sourceValueQuery) transferStagedSetWriterSource(get *sourceGetInputs, cut *sourceMemberWriterReadCut, assignment sourceValueAssignment, origin *ast.Node) bool {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || b.mode != accessorSet|accessorNoGet || b.transferSetWriter == nil || q.liveStagedAssignment() == nil || b.coverage == nil || !b.coverage.extracted || assignment.left == nil || assignment.left.Parent == nil {
		return false
	}
	if !q.publishStagedMemberDisposition(get, cut, false) {
		return false
	}
	return b.transferSetWriter(assignment.left.Parent, origin) && q.liveStagedMemberSource(b, get, cut)
}

// consumeStagedSetWriterSource adopts the already issued original Set producer
// before skipping this exact old-value recovery. It supplies no actual write,
// receiver identity, activation, native category or permission to skip a getter.
func (work *callableEffectWork) consumeStagedSetWriterSource(facts []callableFacts, q *sourceValueQuery, write, origin *ast.Node) bool {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.mode != accessorSet|accessorNoGet || q.liveStagedAssignment() == nil || q.owner.generation != work.operationGeneration {
		return false
	}
	required, issued := work.memberProtocolSources[write]
	if !issued || work.operationRecipes[required.producer].assignment == nil || work.operationRecipes[required.producer].assignment.phase != "" {
		return false
	}
	for _, request := range b.required {
		prior := work.operationRecipes[request.producer]
		s := prior.memberSource
		if s == nil || s.candidate.operation != write || s.candidate.origin != origin || s.candidate.protocol || s.candidate.reflective || s.candidate.runtimeUnknown || s.extraction == nil || s.extraction.mode != b.mode || len(s.values)+len(prior.writerRequired) != 0 {
			continue
		}
		if s.protocolSource != nil {
			return s.protocolSource.setEffects && sameOperationRequest(s.protocolSource.required, required)
		}
		copy := *s
		copy.protocolSource = &sourceStagedMemberProtocol{setEffects: true, required: required}
		prior.memberSource = &copy
		prior.delta = sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{required}}
		if !validStagedSetWriterRecipe(prior) || !work.attachOperationSource(facts, prior) {
			return false
		}
		return true
	}
	return false
}

// Assignment references evaluate their receiver/key, but do not Get the old
// property value. Their original Set producer owns those ordered contributions.
func stagedSetWriterOperation(candidate sourceStagedMemberCandidate) *ast.Node {
	if !candidate.protocol && plainStagedAssignment(candidate.operation) {
		return candidate.operation
	}
	node := candidate.operation
	if candidate.protocol && node != nil && (ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node)) && plainStagedAssignment(node.Parent) && node.Parent.AsBinaryExpression().Left == node {
		return node.Parent
	}
	return nil
}

func stagedMemberEffectsOrReferenceRequest(source *sourceStagedMemberSource) sourceStagedOperationRequest {
	if source.writeEffects {
		return stagedMemberWriterEffectsRequest(source.parent, source.candidate)
	}
	return stagedMemberCandidateRequest(source.parent, source.candidate)
}

func validStagedMemberWriterEffectsRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	source := recipe.memberSource
	if source == nil || !source.writeEffects || source.candidate.protocol || source.candidate.reflective || source.candidate.runtimeUnknown || !plainStagedAssignment(source.candidate.operation) || !sameOperationRequest(source.request, stagedMemberWriterEffectsRequest(source.parent, source.candidate)) {
		return false
	}
	if source.protocolSource != nil {
		return validStagedSetWriterRecipe(recipe)
	}
	// Before its semantic Set producer is issued, preserve an explicit pending
	// Effects role. The raw DATA ticket retains its independent existing validator.
	raw := *source
	raw.writeEffects = false
	raw.request = stagedMemberCandidateRequest(source.parent, source.candidate)
	recipe.key = raw.request.producer
	recipe.memberSource = &raw
	return !recipe.delta.extracted && operationDeltaSize(recipe.delta) == 0 && len(source.values) == 0 && validStagedMemberRecipe(recipe)
}
