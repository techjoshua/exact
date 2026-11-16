package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedDescriptorRetrieval describes one conditional Object algorithm
// branch. The original selected Get supplies it; neither spelling nor a copied
// description supplies current selection, input completion or a normal result.
// Actuals retain argument evaluation order separately from subsequent native
// ToObject, ToPropertyKey and [[GetOwnProperty]] processing.
type sourceStagedDescriptorRetrieval struct {
	request    sourceStagedOperationRequest
	actuals    [2]sourceRelativeEndpoint
	generation *projectGeneration
}

// sourceNativeDescriptorView is conditional result provenance. An Object
// retrieval may return undefined or a newly constructed descriptor record.
// Projecting that record's value/get/set never aliases the target object and
// never invokes the target property's stored getter or callable data.
// Proxy descriptor normalization remains part of the original Call's Effects.
type sourceNativeDescriptorView struct {
	delivery   sourceStagedOperationRequest // actual source reader; separate from original inner native producer
	inputs     [2]sourceDescriptorInputData // Actual applied source alternatives; never caller binding reconstruction.
	source     sourceStagedDescriptorRetrieval
	method     *ast.Node // Actual selected standard arm; current reader must match its original producer.
	projection []string
}

func cloneDescriptorRetrieval(source *sourceStagedDescriptorRetrieval) *sourceStagedDescriptorRetrieval {
	if source == nil {
		return nil
	}
	copy := *source
	for i := range copy.actuals {
		copy.actuals[i] = cloneSourceRelativeEndpoint(source.actuals[i])
	}
	return &copy
}

func sameDescriptorRetrieval(a, b *sourceStagedDescriptorRetrieval) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && sameOperationRequest(a.request, b.request) && sameOperationEndpoint(a.actuals[0], b.actuals[0]) && sameOperationEndpoint(a.actuals[1], b.actuals[1])
}

// validDescriptorRetrieval checks detached transport shape only. Selection and
// complete Get delivery remain graph-local at the existing native owner.
func validDescriptorRetrieval(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.kind != sourceNativeObjectGetOwnPropertyDescriptor || source.descriptorRead == nil || source.descriptorRead.generation == nil || source.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(source.method)) || !sameOperationRequest(source.descriptorRead.request, source.request) {
		return false
	}
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) || source.get != call.Expression() {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 2 {
		return false
	}
	for i, actual := range actuals {
		if ast.IsSpreadElement(actual) || !sameOperationEndpoint(source.descriptorRead.actuals[i], sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual, producer: call, cut: source.request.cut}) {
			return false
		}
	}
	return true
}

// admitDescriptorRetrieval consumes only the original selected native callback.
// The detached two-actual plan does not settle input Effects, normalize a Proxy
// descriptor or expose a result. Each existing phase keeps its own requirements.
func (work *callableEffectWork) admitDescriptorRetrieval(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, selection *sourceStagedNativeSelection) bool {
	if q == nil || q.owner == nil || q.executable == nil || source == nil || selection == nil || source.kind != sourceNativeObjectGetOwnPropertyDescriptor || q.inputs != nil || q.operation != nil || !q.dependenciesOnly {
		return false
	}
	borrow := q.stagedNativeGet
	if borrow == nil || borrow.issuer != q || borrow.sourceWork != work || borrow.owner != q.owner || borrow.generation != work.operationGeneration || borrow.generation != q.owner.generation || borrow.inputSelection != selection || borrow.call != selection.call || borrow.call != source.request.producer.operation || borrow.getRequest.producer != source.request.producer || !sameOperationRequest(borrow.getRequest, source.request) || q.effectOwner != source.request.consumer || q.protectedMember != source.get || selection.get != source.get || selection.selected.node != source.method || selection.selected.native == nil || selection.selected.native.kind != source.kind || selection.selected.native.referencesIncomplete || len(selection.selected.path) != 0 || !sameOperationRequest(selection.request, source.request) || len(selection.actuals) != 2 {
		return false
	}
	root := work.operationRecipes[source.request.producer]
	if !validNativeGetRecipe(root) || !sameNativeGetSource(root.nativeGet, source) {
		return false
	}
	plan := &sourceStagedDescriptorRetrieval{request: source.request, generation: borrow.generation}
	for i := range plan.actuals {
		plan.actuals[i] = cloneSourceRelativeEndpoint(selection.actuals[i])
	}
	check := *source
	check.descriptorRead = plan
	if !validDescriptorRetrieval(&check) {
		return false
	}
	// An actual callback may reissue the same immutable source relationship. It
	// cannot change its endpoints or attach an earlier callback's input snapshot.
	for _, role := range []string{"", "callee-get", "eager-inputs", "algorithm"} {
		request := source.request
		if role != "" {
			request = nativeRootDebtRequest(source, role)
		}
		recipe, registered := work.operationRecipes[request.producer]
		if !registered || !sameNativeGetSource(recipe.nativeGet, source) || recipe.nativeGet.descriptorRead != nil && !sameDescriptorRetrieval(recipe.nativeGet.descriptorRead, plan) {
			return false
		}
	}
	for _, role := range []string{"", "callee-get", "eager-inputs", "algorithm"} {
		request := source.request
		if role != "" {
			request = nativeRootDebtRequest(source, role)
		}
		recipe := work.operationRecipes[request.producer]
		copy := *recipe.nativeGet // Preserve each phase's ROOT-only separation.
		copy.descriptorRead = cloneDescriptorRetrieval(plan)
		recipe.nativeGet = &copy
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	}
	work.queueDescriptorSource(facts, work.operationRecipes[source.request.producer].nativeGet)
	return true
}
