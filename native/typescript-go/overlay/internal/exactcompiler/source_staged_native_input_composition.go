package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// validStagedNativeInputSource validates two original source occurrences. The
// child cut never becomes the parent's argument/acquisition cut. Live selected
// owners seal this relationship before it becomes a cached source description.
func validStagedNativeInputSource(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.kind != sourceNativeObjectFreeze || source.input == nil || !validStagedNativeInputPlan(*source.input, source) {
		return false
	}
	request := source.inputSource
	child := request.producer.operation
	return child != nil && ast.IsCallExpression(child) && child == source.input.input.expression && child != source.request.producer.operation && request.producer.declaration == source.request.producer.declaration && request.producer.kind == relativeDemandEffects && request.producer.selector == (sourceStagedOperationSelector{}) && request.consumer == source.request.consumer && request.use == child && request.edge != "" && request.inputs == nil && request.reading == (sourceStagedOperationKey{}) && request.cut == (sourceRelativeCut{operation: child, use: child, reading: child})
}

// stagedNativeOrdinaryInputResult is a narrow algorithm premise: if this selected
// create/freeze alternative returns, its result is ordinary and cannot itself be
// a Proxy. It publishes no value, identity, successful completion, descriptors,
// prototype contents or NoWrites. A caller must still require the child's entire
// Effects root, including every original callee/input alternative.
func stagedNativeOrdinaryInputResult(source *sourceStagedNativeGetSource) bool {
	if source == nil || nativeMemberCallRequirementCount(source) != 0 {
		return false
	}
	return stagedNativeOrdinaryInputShape(source)
}

// stagedNativeOrdinaryInputShape describes an existing conditional algorithm
// relation. It supplies neither selected-callee nor current result authority.
func stagedNativeOrdinaryInputShape(source *sourceStagedNativeGetSource) bool {
	if source == nil {
		return false
	}
	if source.kind != sourceNativeObjectDefineProperty && source.kind != sourceNativeObjectDefineProperties && (source.input == nil || !validStagedNativeInputPlan(*source.input, source)) {
		return false
	}
	switch source.kind {
	case sourceNativeObjectCreate:
		return source.prototype != nil && sameOperationEndpoint(source.prototype.input, source.input.input)
	case sourceNativeObjectDefineProperties:
		return source.descriptorMap != nil && ast.IsObjectLiteralExpression(source.descriptorMap.target.expression) && sourceInertValueCreation(source.descriptorMap.target.expression)
	case sourceNativeObjectDefineProperty:
		return source.installation != nil && (ast.IsObjectLiteralExpression(source.installation.target.expression) && sourceInertValueCreation(source.installation.target.expression) || validNativeTargetSource(source))
	case sourceNativeObjectFreeze:
		return ast.IsObjectLiteralExpression(source.input.input.expression) || validStagedNativeInputSource(source)
	}
	return false
}

// Description can retain an exact native-only population without borrowing its
// current observation. Only currentNativeOrdinaryInputResult consumes rights.
func (work *callableEffectWork) describeNativeOrdinaryInputResult(source *sourceStagedNativeGetSource) bool {
	return stagedNativeOrdinaryInputShape(source) && work.nativePopulationDescriptionSupported(source)
}
func (work *callableEffectWork) currentNativeOrdinaryInputResult(source *sourceStagedNativeGetSource) bool {
	return stagedNativeOrdinaryInputShape(source) && work.nativePopulationCurrent(source)
}

// describeNativeInputSource retains an exact original selected child request
// before parent admission. Both roles stay pending with the full child debt;
// this source association is not an ordinary-result or completion receipt.
func (work *callableEffectWork) describeNativeInputSource(facts []callableFacts, parent *sourceStagedNativeGetSource, child *sourceStagedNativeGetSource) bool {
	if parent == nil || child == nil || parent.kind != sourceNativeObjectFreeze || parent.input == nil || parent.input.input.expression != child.request.producer.operation {
		return false
	}
	root, present := work.operationRecipes[child.request.producer]
	if !present || !validOperationEnvelope(root) || !sameNativeGetSource(root.nativeGet, child) || !sameOperationRequest(root.nativeGet.request, child.request) {
		return false
	}
	algorithm, present := work.operationRecipes[nativeRootDebtRequest(child, "algorithm").producer]
	if !present || !validOperationEnvelope(algorithm) || !sameNativeGetSource(algorithm.nativeGet, child) || !work.describeNativeOrdinaryInputResult(algorithm.nativeGet) {
		return false
	}
	prior := work.operationRecipes[nativeRootDebtRequest(parent, "algorithm").producer].nativeGet
	published := prior != nil && !sameOperationRequest(prior.inputSource, child.request)
	planned, valid := work.nativeInputSourceRecipes(parent, child.request, false)
	if !valid {
		return false
	}
	for _, recipe := range planned {
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	}
	// Only new SOURCE publication wakes the graph-local input owner. An
	// idempotent extraction cannot keep the relative phase artificially dirty.
	if published {
		work.notifyNativeEagerInputWaiters(work.operationIDs[nativeRootDebtRequest(parent, "eager-inputs").producer])
	}
	return true
}

// nativeInputSourceRecipes validates all phase refinements before mutation.
// Description preserves prior completion on an idempotent visit; only the
// post-adoption owner may introduce new semantic completion.
func (work *callableEffectWork) nativeInputSourceRecipes(parent *sourceStagedNativeGetSource, child sourceStagedOperationRequest, complete bool) ([]sourceStagedOperationRecipe, bool) {
	if complete {
		childSource := work.operationRecipes[child.producer].nativeGet
		if childSource != nil && nativeMemberCallRequirementCount(childSource) != 0 && !work.currentNativeOrdinaryInputResult(work.operationRecipes[nativeRootDebtRequest(childSource, "algorithm").producer].nativeGet) {
			return nil, false
		}
	}
	var planned []sourceStagedOperationRecipe
	for _, role := range []string{"algorithm", "eager-inputs"} {
		request := nativeRootDebtRequest(parent, role)
		prior, present := work.operationRecipes[request.producer]
		if !present || !sameNativeGetSource(prior.nativeGet, parent) {
			return nil, false
		}
		source := *prior.nativeGet
		if source.inputSource.producer.operation != nil && !sameOperationRequest(source.inputSource, child) {
			return nil, false
		}
		source.inputSource = child
		if !validStagedNativeInputSource(&source) {
			return nil, false
		}
		recipe := prior
		recipe.nativeGet = &source
		recipe.delta = cloneOperationDelta(prior.delta)
		recipe.delta.required = []sourceStagedOperationRequest{child}
		recipe.delta.extracted = recipe.delta.extracted || complete
		if !validOperationEnvelope(recipe) || !operationDeltaPrefix(prior.delta, recipe.delta) || prior.delta.extracted && !operationDeltaPrefix(recipe.delta, prior.delta) {
			return nil, false
		}
		planned = append(planned, recipe)
	}
	return planned, true
}

// connectNativeInputSource consumes current original Get/algorithm receipts
// after actual child adoption. The result premise remains conditional on
// success; complete child Effects and all inner sources remain required.
func (work *callableEffectWork) connectNativeInputSource(facts []callableFacts, parent *sourceStagedNativeGetSource, child *ast.Node) bool {
	if parent != nil && reflectiveNative(parent.kind) {
		return work.connectNativeTargetSource(facts, parent, child)
	}
	if parent == nil || parent.kind != sourceNativeObjectFreeze || parent.input == nil || parent.input.input.expression != child {
		return false
	}
	childKey := sourceStagedOperationKey{declaration: parent.request.producer.declaration, operation: child, kind: relativeDemandEffects}
	root := work.currentNativeResultRoot(childKey)
	if root == nil || !work.nativeOrdinaryTargetResult(root.request) {
		return false
	}
	for _, key := range []sourceStagedOperationKey{parent.request.producer, childKey} {
		id, registered := work.operationIDs[key]
		if !registered || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
	}
	planned, valid := work.nativeInputSourceRecipes(parent, root.request, true)
	if !valid {
		return false
	}
	for _, recipe := range planned {
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	}
	return true
}
