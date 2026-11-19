package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeAlgorithmEntryLaw composes an original selected algorithm's entry law.
// Its full Effects root remains required, including input/coercion alternatives.
// A complete Get, finite entry population and each implicit conversion law are
// independent requirements. Effects closure alone cannot create this capability.
func (work *callableEffectWork) nativeAlgorithmEntryLaw(facts []callableFacts, source *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	if source == nil || !runtimeModuleEvaluation(source.request.consumer) || !work.nativePopulationDescriptionSupported(source) {
		return sourceStagedOperationRequest{}, false
	}
	base := nativeRootDebtRequest(source, "algorithm")
	algorithm := work.operationRecipes[base.producer]
	if !validNativeGetRequest(algorithm, base) || !work.nativeAlgorithmDescriptionSupported(algorithm.nativeGet) {
		return sourceStagedOperationRequest{}, false
	}
	get, registered := work.nativeGetEntryLaw(facts, source)
	if !registered {
		return sourceStagedOperationRequest{}, false
	}
	receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.request.use, producer: source.request.use, cut: source.request.cut}
	request, registered := work.registerEntryLawSource(facts, base, receiver, stagedEntryLawNativeAlgorithm)
	if !registered || !work.attachEntryLawRequirements(facts, request, []sourceStagedOperationRequest{source.request, get}, false) {
		return sourceStagedOperationRequest{}, false
	}
	if nativeMemberCallRequirementCount(algorithm.nativeGet) != 0 {
		required, represented := work.nativeAlgorithmEntryDependencies(algorithm.nativeGet)
		if !represented || !work.attachEntryLawRequirements(facts, request, required, false) {
			return sourceStagedOperationRequest{}, false
		}
	}
	return request, true
}

// nativeAlgorithmEntryShapeSupported describes supported algorithm shapes.
// Selection still comes from the original current-graph Get.
func nativeAlgorithmEntryShapeSupported(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.request.use == nil || !ast.IsCallExpression(source.request.use) {
		return false
	}
	if stagedNativeCallNoUserEntry(source, source.request.use) {
		return true
	}
	return source.kind == sourceNativeObjectDefineProperties && source.descriptorMap != nil || source.kind == sourceNativeObjectFreeze && source.input != nil
}

// This describes supported source branches; it does not publish their law.
func (work *callableEffectWork) nativeAlgorithmDescriptionSupported(source *sourceStagedNativeGetSource) bool {
	return nativeAlgorithmEntryShapeSupported(source) && work.nativePopulationDescriptionSupported(source)
}

// nativeAlgorithmEntryDependencies describes only intrinsic no-user-entry laws
// owned by existing algorithms. Missing population or an unmapped implicit Get
// remains a required producer. It is never replaced by a literal count, an
// empty summary or the conditional ordinary result category.
func (work *callableEffectWork) nativeAlgorithmEntryDependencies(source *sourceStagedNativeGetSource) ([]sourceStagedOperationRequest, bool) {
	required, represented := work.describeNativeAlgorithmEntryDependencies(source)
	if !represented {
		return nil, false
	}
	if nativeMemberCallRequirementCount(source) != 0 {
		population, ok := work.describeNativeOnlyPopulation(source)
		if !ok {
			return nil, false
		}
		required = appendEntryLawRequirement(required, population)
	}
	return required, true
}
func (work *callableEffectWork) describeNativeAlgorithmEntryDependencies(source *sourceStagedNativeGetSource) ([]sourceStagedOperationRequest, bool) {
	if !work.nativeAlgorithmDescriptionSupported(source) {
		return nil, false
	}
	get, valid := stagedEntryLawRequest(nativeRootDebtRequest(source, "callee-get"), stagedEntryLawNativeGet)
	if !valid {
		return nil, false
	}
	required := []sourceStagedOperationRequest{source.request, get}
	if stagedNativeCallNoUserEntry(source, source.request.use) {
		return required, true
	}
	switch source.kind {
	case sourceNativeObjectDefineProperties:
		plan := source.descriptorMap
		if plan == nil || !ast.IsObjectLiteralExpression(plan.target.expression) {
			return nil, false // Ordinary target definition is a separate intrinsic law.
		}
		protocol := work.operationRecipes[plan.protocol.producer]
		if !validStagedMapProtocolRecipe(protocol) || protocol.mapProtocol == nil || !protocol.mapProtocol.entriesRegistered {
			return nil, false
		}
		enumeration, valid := stagedEntryLawRequest(plan.protocol, stagedEntryLawMapEnumeration)
		if !valid {
			return nil, false
		}
		required = append(required, enumeration)
		for _, entry := range protocol.mapProtocol.entries {
			base, valid := stagedMapEntryRequest(source, entry)
			if !valid {
				return nil, false
			}
			conversion, valid := stagedEntryLawRequest(base, stagedEntryLawMapConversion)
			if !valid || !validStagedEntryLawRecipe(work.operationRecipes[conversion.producer]) {
				return nil, false
			}
			required = appendEntryLawRequirement(required, conversion)
		}
		return required, true
	case sourceNativeObjectFreeze:
		if source.input != nil && ast.IsObjectLiteralExpression(source.input.input.expression) {
			// Creation supplied an ordinary object. Eager children belong to
			// their earlier walker events and the independent Effects root.
			return required, true
		}
		if !validStagedNativeInputSource(source) {
			return nil, false
		}
		child := work.operationRecipes[source.inputSource.producer].nativeGet
		if child == nil || !work.describeNativeOrdinaryInputResult(work.operationRecipes[nativeRootDebtRequest(child, "algorithm").producer].nativeGet) {
			return nil, false
		}
		law, valid := stagedEntryLawRequest(nativeRootDebtRequest(child, "algorithm"), stagedEntryLawNativeAlgorithm)
		if !valid || !validStagedEntryLawRecipe(work.operationRecipes[law.producer]) {
			return nil, false
		}
		return append(required, law), true
	}
	return nil, false
}

// prepareNativeAlgorithmEntryLaw refines only required relationships through
// the existing queue. It never queries an initializer or reenters a binder.
func (work *callableEffectWork) prepareNativeAlgorithmEntryLaw(facts []callableFacts, id sourceStagedOperationID) {
	work.refineNativeAlgorithmEntryLaw(facts, work.operations[id.index].key)
}

func (work *callableEffectWork) refineNativeAlgorithmEntryLaw(facts []callableFacts, key sourceStagedOperationKey) {
	recipe := work.operationRecipes[key]
	if recipe.entryLaw == nil || recipe.entryLaw.kind != stagedEntryLawNativeAlgorithm {
		return
	}
	source := work.operationRecipes[recipe.entryLaw.base.producer].nativeGet
	if source == nil {
		return
	}
	if source.kind == sourceNativeObjectFreeze && validStagedNativeInputSource(source) {
		child := work.operationRecipes[source.inputSource.producer].nativeGet
		if request, registered := work.nativeAlgorithmEntryLaw(facts, child); registered {
			work.refineNativeAlgorithmEntryLaw(facts, request.producer)
		}
	}
	if required, represented := work.nativeAlgorithmEntryDependencies(source); represented {
		work.attachEntryLawRequirements(facts, recipe.entryLaw.request, required, false)
	}
}

func (work *callableEffectWork) nativeAlgorithmEntryLocallyAccounted(recipe sourceStagedOperationRecipe) bool {
	plan := recipe.entryLaw
	if plan == nil || plan.kind != stagedEntryLawNativeAlgorithm {
		return false
	}
	source := work.operationRecipes[plan.base.producer].nativeGet
	if source == nil || !sameOperationRequest(plan.base, nativeRootDebtRequest(source, "algorithm")) || plan.receiver.expression != source.request.use {
		return false
	}
	get := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer].nativeGet
	if get == nil {
		return false
	}
	getLaw, valid := stagedEntryLawRequest(nativeRootDebtRequest(source, "callee-get"), stagedEntryLawNativeGet)
	if !valid || !work.passiveEntryLawReady(work.operationRecipes[getLaw.producer]) {
		return false // Conditional MAY branches cannot exclude authored Call results.
	}
	if !work.nativePopulationCurrent(source) {
		return false
	}
	required, represented := work.nativeAlgorithmEntryDependencies(source)
	return represented && operationPrefix(required, recipe.delta.required, sameOperationRequest) && operationPrefix(recipe.delta.required, required, sameOperationRequest)
}

// recordNativeSelectionRequirements retains only prerequisites used by the
// original selected Get. The broader source inventory remains independent.
// Positive conditional selection cannot discard an unfinished entry-law child.
func (work *callableEffectWork) recordNativeSelectionRequirements(facts []callableFacts, source *sourceStagedNativeGetSource, required []sourceStagedOperationRequest) bool {
	if len(required) == 0 {
		return true
	}
	for _, r := range required {
		if !validOperationEnvelope(work.operationRecipes[r.producer]) {
			return false
		}
	}
	request := nativeRootDebtRequest(source, "callee-get")
	recipe, known := work.operationRecipes[request.producer]
	if !known || !sameNativeGetSource(recipe.nativeGet, source) {
		return false
	}
	next := *recipe.nativeGet
	next.selectionRequired = append([]sourceStagedOperationRequest(nil), next.selectionRequired...)
	recipe.delta = cloneOperationDelta(recipe.delta)
	for _, r := range required {
		next.selectionRequired = appendEntryLawRequirement(next.selectionRequired, r)
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, r)
	}
	// These assumptions belong to this original Get. Its parent already
	// requires the Get, and must not republish an unextracted root blueprint
	// merely because its callee description gained a prerequisite.
	recipe.nativeGet = &next
	return work.attachOperationSource(facts, recipe)
}

// nativeConstructionEntryLaw uses the existing original zero-input constructor
// owner. Its callee/prototype Gets issue an independent no-user-entry law, while
// the full New Effects root and all source alternatives stay required.
func (work *callableEffectWork) nativeConstructionEntryLaw(facts []callableFacts, root sourceStagedOperationRequest) (sourceStagedOperationRequest, bool) {
	recipe := work.operationRecipes[root.producer]
	if !validStagedConstructionEffectsRecipe(recipe) || recipe.constructionEffects.phase != "" || !sameOperationRequest(root, recipe.constructionEffects.root) {
		return sourceStagedOperationRequest{}, false
	}
	receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: root.use, producer: root.use, cut: root.cut}
	request, registered := work.registerEntryLawSource(facts, root, receiver, stagedEntryLawConstruction)
	return request, registered && work.attachEntryLawRequirements(facts, request, []sourceStagedOperationRequest{root}, false)
}

// stagedNativeFreshResult describes the original intrinsic's allocation relation.
// A literal target and Object.create birth cannot be the preexisting intrinsic
// container being read. This is no runtime object identity or global NoWrites
// certificate. Every input, callee and implicit protocol remains independently
// required before the conditional relation can settle.
func (work *callableEffectWork) stagedNativeFreshResult(source *sourceStagedNativeGetSource) bool {
	return work.nativeFreshResult(source, false)
}
func (work *callableEffectWork) describeStagedNativeFreshResult(source *sourceStagedNativeGetSource) bool {
	return work.nativeFreshResult(source, true)
}
func (work *callableEffectWork) nativeFreshResult(source *sourceStagedNativeGetSource, description bool) bool {
	if source == nil || !runtimeModuleEvaluation(source.request.consumer) {
		return false
	}
	var supported bool
	if description {
		supported = work.describeNativeOrdinaryInputResult(source)
	} else {
		supported = work.currentNativeOrdinaryInputResult(source)
	}
	if !supported {
		return false
	}
	switch source.kind {
	case sourceNativeObjectDefineProperties:
		return source.descriptorMap != nil && ast.IsObjectLiteralExpression(source.descriptorMap.target.expression)
	case sourceNativeObjectCreate:
		return source.prototype != nil && source.input != nil && validStagedNativeInputPlan(*source.input, source)
	case sourceNativeObjectFreeze:
		if source.input == nil {
			return false
		}
		if ast.IsObjectLiteralExpression(source.input.input.expression) {
			return true
		}
		if !validStagedNativeInputSource(source) {
			return false
		}
		child := work.operationRecipes[source.inputSource.producer].nativeGet
		return child != nil && work.nativeFreshResult(work.operationRecipes[nativeRootDebtRequest(child, "algorithm").producer].nativeGet, description)
	}
	return false
}

// consumeStagedFreshTargetOperation is lent only to an original standard
// container Get. It consumes the selected algorithm's fresh-target relation
// before reflective target recovery asks for a normal Call output. The exact
// algorithm entry-law child gates the resulting Get, including all possible
// implicit user entry. Unknown targets or authored callee alternatives refuse.
func (work *callableEffectWork) consumeStagedFreshTargetOperation(facts []callableFacts, q *sourceValueQuery, operation, origin *ast.Node, get *sourceGetInputs) bool {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, get, b.read) || b.coverage == nil || b.coverage.origin != origin || b.coverage.cut != q.relativeInputCut(get.operation) || get.receiver.native == nil || get.receiver.native.referencesIncomplete || !standardLibrarySource(ast.GetSourceFileOfNode(get.receiver.node)) || !standardNativeLookup(get) || !runtimeModuleEvaluation(q.effectOwner) {
		return false
	}
	declaration := sourceStagedModuleOwner(operation)
	key := sourceStagedOperationKey{declaration: declaration, operation: operation, kind: relativeDemandEffects}
	root := work.operationRecipes[key].nativeGet
	if root == nil || operation == b.request.producer.operation || !work.stagedNativeFreshResult(work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet) {
		return false
	}
	getLaw, valid := stagedEntryLawRequest(nativeRootDebtRequest(root, "callee-get"), stagedEntryLawNativeGet)
	if !valid || !work.passiveEntryLawReady(work.operationRecipes[getLaw.producer]) {
		return false
	}
	law, registered := work.nativeAlgorithmEntryLaw(facts, root)
	if !registered || !q.liveStagedMemberSource(b, get, b.read) {
		return false
	}
	if root.kind == sourceNativeObjectDefineProperties {
		// Only this successful original fresh-target owner can issue this distinct
		// event. Rows have not been enumerated, and no all-row observation is lent.
		event := &sourceStagedNativeWriterEvent{work: work, query: q, borrow: b, epoch: work.operationEpoch, generation: work.operationGeneration, source: root, law: law, provenance: nativeWriterFreshTarget, active: true}
		event.self = event
		defer event.revoke()
		if !work.recordNativeWriterEvent(facts, event) {
			return false // Independently valid existing recovery still owns this case.
		}
	}
	b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, law)
	return true
}
