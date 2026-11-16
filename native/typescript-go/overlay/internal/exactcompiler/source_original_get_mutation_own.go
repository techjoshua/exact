package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func validOriginalOwnGetMutationSource(s *sourceOriginalGetMutationSource) bool {
	member := s.ownMember
	if member == nil || s.record != nil || s.nativeTarget != nil || s.standard != nil || s.kind != 0 || s.slot != 0 || s.intrinsicPrototype || s.receiverKind != 0 || s.mode != accessorAcquire || s.operation != s.request.producer.operation || s.origin == nil || !ast.IsObjectLiteralExpression(s.origin) || member.Parent != s.origin || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || callableNameText(member.Name()) != s.property || s.request.producer.selector.occurrence != s.origin || s.request.producer.selector.field != s.property || stagedDescriptorFieldIndex(s.property) < 0 || s.coverage.producer.operation != nil || len(s.population) != 0 {
		return false
	}
	return ast.IsPropertyAssignment(member) || ast.IsMethodDeclaration(member) || ast.IsShorthandPropertyAssignment(member) && member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer == nil
}

// publishOriginalOwnGetMutationSource receives the ORIGINAL selected literal
// property terminal. The same Get already owns its exact Has/Get phase. The
// function reads no noUser receipt and exports neither the property's value nor
// a complete source population; alternative writers/getters stay on that Get.
func (work *callableEffectWork) publishOriginalOwnGetMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, member *ast.Node, mode accessorTraversal) bool {
	if q == nil || !q.liveStagedFieldGet(get) || !q.traceModeKnown || q.traceMode != mode || mode != accessorAcquire || get.hasOnly || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationGet || q.owner.generation != work.operationGeneration {
		return false
	}
	borrow := get.stagedEffects
	s := &sourceOriginalGetMutationSource{request: borrow.request, operation: get.operation, queryCut: q.relativeInputCut(get.operation), origin: get.receiver.node, property: get.propertyKey, mode: mode, generation: borrow.generation, ownMember: member}
	if !validOriginalGetMutationSource(s) {
		return false
	}
	parent := work.operationRecipes[s.request.producer]
	if !validNativeGetRecipe(parent) || parent.nativeGet.descriptorGet != s.origin || parent.key.selector.field != s.property {
		return false
	}
	expected := parent.nativeGet.request
	expected.producer = parent.key
	if !sameOperationRequest(expected, s.request) {
		return false
	}
	if !work.registerOriginalGetMutationSource(facts, s) {
		return false
	}
	work.captureNativeInstallationOwnFieldSource(facts, q, get, s)
	return true
}

func (work *callableEffectWork) originalOwnGetMutationCurrent(s *sourceOriginalGetMutationSource) bool {
	if !validOriginalOwnGetMutationSource(s) {
		return false
	}
	parent := work.operationRecipes[s.request.producer]
	if !validNativeGetRecipe(parent) || parent.nativeGet.descriptorGet != s.origin || parent.key.selector.field != s.property {
		return false
	}
	expected := parent.nativeGet.request
	expected.producer = parent.key
	return sameOperationRequest(expected, s.request)
}
