package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// constructedMemberRequest names finite semantic obligations of the original
// member Call. It never encodes a runtime key, table entry or recursive path.
func constructedMemberRequest(source *sourceStagedConstructedMember, role string) sourceStagedOperationRequest {
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.construction.site, field: role}
	request.edge += ":" + role
	if role == "callee" || role == "member-result" || role == "stored-payload" {
		request.producer.kind = relativeDemandDirectExposure
	}
	return request
}

// registerConstructedMemberSourcePrefix accepts a conditional alternative only
// from the live original member sink. Every semantic role remains required.
// This seals source descriptions without ordinary use, root IDs or invocation.
// No Get pointer, query or callback enters the graph.
func (work *callableEffectWork) registerConstructedMemberSourcePrefix(facts []callableFacts, source sourceStagedConstructedMember) bool {
	if !validConstructedMemberSource(&source) {
		return false
	}
	work.indexOperationSources(facts)
	if _, found := work.memberNodes[source.request.consumer]; !found {
		return false
	}
	sealed := cloneConstructedMemberSource(source)
	writers := constructedMemberRequest(&sealed, "own-writers")
	eager := constructedMemberRequest(&sealed, "eager-inputs")
	callee := constructedMemberRequest(&sealed, "callee")
	result := constructedMemberRequest(&sealed, "member-result")
	for _, recipe := range []sourceStagedOperationRecipe{
		{key: writers.producer, constructed: &sealed, delta: sourceStagedOperationDelta{exposures: sealed.writers}},
		{key: eager.producer, constructed: &sealed},
		{key: callee.producer, constructed: &sealed, delta: sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.method, producer: source.request.producer.operation, get: source.get, cut: source.cut}}}, required: []sourceStagedOperationRequest{writers}}},
		{key: result.producer, constructed: &sealed, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{writers}}},
		{key: constructedMemberRequest(&sealed, "alternative").producer, constructed: &sealed, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{writers, eager, callee}, extracted: true}},
	} {
		if !work.registerOperationSourcePrefix(facts, recipe) {
			return false
		}
	}
	if source.kind == sourceNativeWeakMapSetEffect && source.actualsKnown && len(source.actuals) == 2 {
		payload := constructedMemberRequest(&sealed, "stored-payload")
		recipe := sourceStagedOperationRecipe{key: payload.producer, constructed: &sealed, delta: sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(sealed.actuals[1].endpoint)}}, required: []sourceStagedOperationRequest{writers, eager}}}
		if !work.registerOperationSourcePrefix(facts, recipe) {
			return false
		}
	}
	return work.registerConstructedGroup(facts, &sealed)
}

// registerConstructedMemberSource is the reached occurrence's active wrapper.
// A prior passive prefix does not replace ordinary use/dependency membership.
// Source method availability never pays writer, input or result requirements.
func (work *callableEffectWork) registerConstructedMemberSource(facts []callableFacts, source sourceStagedConstructedMember) bool {
	if !work.registerConstructedMemberSourcePrefix(facts, source) {
		return false
	}
	// Required source membership precedes any extraction/publication. A source
	// index or known standard branch is not a local disposition for either debt.
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: source.request}) {
		return false
	}
	work.registerOperationDependencies(facts, work.operationIDs[source.request.producer])
	return true
}

func validConstructedMemberSource(source *sourceStagedConstructedMember) bool {
	if source == nil || source.construction.site == nil || !ast.IsNewExpression(source.construction.site) || source.construction.constructor == nil || !standardLibrarySource(ast.GetSourceFileOfNode(source.construction.constructor)) || source.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(source.method)) || !standardMemberEffect(source.kind) {
		return false
	}
	request := source.request
	call := request.producer.operation
	return call != nil && ast.IsCallExpression(call) && call.AsCallExpression().QuestionDotToken == nil && call.Expression() == source.get && ast.IsPropertyAccessExpression(source.get) && request.producer.kind == relativeDemandEffects && request.producer.selector == (sourceStagedOperationSelector{}) && request.producer.declaration == request.consumer && request.inputs == nil && request.reading == (sourceStagedOperationKey{}) && request.use == call && request.cut == (sourceRelativeCut{operation: call, use: call, reading: call}) && sourceStagedOccurrenceOwned(call, request.consumer)
}

func validConstructedMemberRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.constructed
	if !validConstructedMemberSource(source) || recipe.nativeGet != nil || recipe.getter != nil || recipe.returning != nil || len(recipe.fieldForwards) != 0 {
		return false
	}
	writers := constructedMemberRequest(source, "own-writers")
	eager := constructedMemberRequest(source, "eager-inputs")
	callee := constructedMemberRequest(source, "callee")
	result := constructedMemberRequest(source, "member-result")
	covered := validConstructedSourceDisposition(recipe.constructedDisposition, source, recipe.key)
	if recipe.constructedDisposition != nil && !covered {
		return false
	}
	var expected sourceStagedOperationDelta
	switch recipe.key {
	case writers.producer:
		expected.exposures = source.writers
		expected.required = append(expected.required, recipe.writerRequired...)
	case eager.producer:
	case callee.producer:
		expected.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.method, producer: source.request.producer.operation, get: source.get, cut: source.cut}}}
		expected.required = []sourceStagedOperationRequest{writers}
	case constructedMemberRequest(source, "stored-payload").producer:
		if source.kind != sourceNativeWeakMapSetEffect || !source.actualsKnown || len(source.actuals) != 2 {
			return false
		}
		expected.exposures = []sourceStagedOperationAlternative{{endpoint: source.actuals[1].endpoint}}
		expected.required = []sourceStagedOperationRequest{writers, eager}
	case constructedMemberRequest(source, "method-lookup").producer:
		expected.required = constructedMethodLookupRequirements(source)
		if covered {
			expected.effects = cloneOperationDelta(sourceStagedOperationDelta{effects: recipe.constructedDisposition.lookupEffects}).effects
			expected.extracted = recipe.constructedDisposition.lookupComplete
		}
	case result.producer:
		var valid bool
		expected, valid = constructedMemberResultDelta(source, recipe.constructedDisposition)
		if !valid {
			return false
		}
	case constructedMemberRequest(source, "alternative").producer:
		expected.required = []sourceStagedOperationRequest{writers, eager, callee}
		expected.extracted = true
	case source.request.producer:
		if len(recipe.constructedGroup) == 0 {
			return false
		}
		for _, member := range recipe.constructedGroup {
			if !validConstructedMemberSource(&member) || !sameOperationRequest(member.request, source.request) {
				return false
			}
			expected.required = append(expected.required, constructedMemberRequest(&member, "alternative"))
		}
	default:
		return false
	}
	if recipe.key != constructedMemberRequest(source, "alternative").producer && recipe.key != result.producer && recipe.key != constructedMemberRequest(source, "method-lookup").producer {
		expected.extracted = covered
	}
	if covered && recipe.constructedDisposition.container != nil {
		container := recipe.constructedDisposition.container
		if recipe.constructedDisposition.role != "own-writers" || !validConstructedMemberSource(container) || container.kind != sourceNativeWeakMapSetEffect {
			return false
		}
		for _, role := range []string{"own-writers", "callee", "eager-inputs"} {
			expected.required = append(expected.required, constructedMemberRequest(container, role))
		}
	}

	if recipe.key == source.request.producer {
		expected.required = append(expected.required, recipe.constructedInputs...)
		if recipe.delta.extracted != covered || operationDeltaSize(recipe.delta) != len(expected.required) {
			return false
		}
		seen := make(map[sourceStagedOperationRequest]bool)
		for _, required := range recipe.delta.required {
			matched := false
			for _, allowed := range expected.required {
				matched = matched || sameOperationRequest(required, allowed)
			}
			if !matched || seen[required] {
				return false
			}
			seen[required] = true
		}
		return true
	}
	if len(recipe.constructedInputs) != 0 {
		return false
	}
	return expected.extracted == recipe.delta.extracted && operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
}

func (work *callableEffectWork) validConstructedMemberRequest(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if !validConstructedMemberRecipe(recipe) {
		return false
	}
	source := recipe.constructed
	if request.reading != (sourceStagedOperationKey{}) {
		reader := work.operationRecipes[request.reading].constructed
		if reader == nil || reader.kind != sourceNativeWeakMapGetEffect || source.kind != sourceNativeWeakMapSetEffect || source.construction.site != reader.construction.site || request.reading != constructedMemberRequest(reader, "member-result").producer {
			return false
		}
		return sameOperationRequest(request, constructedPayloadRequest(reader, source))
	}
	return validConstructedBaseRequest(recipe, request)
}

// Base requests preserve the original factory and never borrow a payload reader.
func validConstructedBaseRequest(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if !validConstructedMemberRecipe(recipe) || request.reading != (sourceStagedOperationKey{}) {
		return false
	}
	source := recipe.constructed
	if recipe.key == source.request.producer {
		return sameOperationRequest(request, source.request)
	}
	for _, role := range []string{"own-writers", "eager-inputs", "callee", "member-result", "stored-payload", "alternative", "method-lookup"} {
		if sameOperationRequest(request, constructedMemberRequest(source, role)) {
			return true
		}
	}
	return false
}

func sameConstructedMemberSource(a, b *sourceStagedConstructedMember) bool {
	if a == nil || b == nil {
		return a == b
	}
	if a.construction != b.construction || a.method != b.method || a.kind != b.kind || a.get != b.get || a.cut != b.cut || a.actualsKnown != b.actualsKnown || !sameOperationRequest(a.request, b.request) || len(a.actuals) != len(b.actuals) || !operationPrefix(a.writers, b.writers, sameOperationAlternative) || !operationPrefix(b.writers, a.writers, sameOperationAlternative) {
		return false
	}
	for i := range a.actuals {
		if a.actuals[i].expression != b.actuals[i].expression || a.actuals[i].ordinal != b.actuals[i].ordinal || !sameOperationEndpoint(a.actuals[i].endpoint, b.actuals[i].endpoint) {
			return false
		}
	}
	return true
}

// registerConstructedGroup grows only the finite source-alternative envelope of
// one original member occurrence. The aggregate remains pending until the
// receiver owner supplies complete alternative coverage. Known branches do not
// authorize dropping another construction or runtime/source alternative.
func (work *callableEffectWork) registerConstructedGroup(facts []callableFacts, source *sourceStagedConstructedMember) bool {
	key := source.request.producer
	recipe, found := work.operationRecipes[key]
	if !found {
		return work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: key, constructed: source, constructedGroup: []sourceStagedConstructedMember{*source}, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{constructedMemberRequest(source, "alternative")}}})
	}
	if len(recipe.constructedGroup) == 0 {
		return false
	}
	for _, member := range recipe.constructedGroup {
		if member.construction.site == source.construction.site {
			return sameConstructedMemberSource(&member, source)
		}
	}
	recipe.constructedGroup = append(append([]sourceStagedConstructedMember(nil), recipe.constructedGroup...), *source)
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = append(recipe.delta.required, constructedMemberRequest(source, "alternative"))
	if !validConstructedMemberRecipe(recipe) {
		return false
	}
	return work.attachOperationSource(facts, recipe)
}

// requireConstructedReceiverData links an actually delivered data prerequisite
// before the next receiver can settle. The original writer/Get cuts remain on
// that request. It grants no normal value, instance identity or whole Get ACK.
func (work *callableEffectWork) requireConstructedReceiverData(facts []callableFacts, receiver, input sourceStagedOperationRequest) bool {
	recipe, found := work.operationRecipes[receiver.producer]
	id, registered := work.operationIDs[input.producer]
	if !found || !registered || len(recipe.constructedGroup) == 0 || input.consumer != receiver.consumer || input.reading == (sourceStagedOperationKey{}) {
		return false
	}
	subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{input.consumer, input.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != work.operations[id.index].revision || len(subscriber.constructed) == 0 {
		return false
	}
	for _, prior := range recipe.constructedInputs {
		if sameOperationRequest(prior, input) {
			return true
		}
	}
	recipe.constructedInputs = append(append([]sourceStagedOperationRequest(nil), recipe.constructedInputs...), input)
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = append(recipe.delta.required, input)
	if !validConstructedMemberRecipe(recipe) {
		return false
	}
	return work.attachOperationSource(facts, recipe)
}

// Passive source admission does not complete the own-writer or eager role.
// The actual original Get and its current source-set receipt must already have
// issued this alternative. All required writer/protocol children remain live.
func (work *callableEffectWork) passiveConstructedSourceSupported(recipe sourceStagedOperationRecipe) bool {
	source := recipe.constructed
	if source == nil || !validConstructedMemberRecipe(recipe) || work.operationGeneration == nil || !work.constructedIssued[[2]*ast.Node{source.request.producer.operation, source.construction.site}] {
		return false
	}
	role := recipe.key.selector.field
	if recipe.key != source.request.producer && role != "own-writers" && role != "eager-inputs" && role != "callee" && role != "alternative" && role != "method-lookup" {
		return false
	}
	coverage := stagedMemberCoverageRequest(source.request, source.construction.site, source.cut)
	observed := work.operationRecipes[coverage.producer].memberSource
	if observed == nil || observed.coverage == nil || !observed.coverage.extracted || observed.generation != work.operationGeneration || work.memberCoverageObserved[coverage.producer] != work.operationGeneration || !sameOperationRequest(observed.parent, source.request) || observed.coverage.cut != source.cut {
		return false
	}
	root := work.operationRecipes[source.request.producer]
	matched := false
	for i := range root.constructedGroup {
		matched = matched || sameConstructedMemberSource(&root.constructedGroup[i], source)
	}
	if !matched {
		return false
	}
	for _, member := range root.constructedGroup {
		if !work.freshConstructedProtocolMember(member) {
			return false
		}
	}
	if proof := recipe.constructedDisposition; proof != nil {
		return proof.generation == work.operationGeneration && validConstructedSourceDisposition(proof, source, recipe.key)
	}
	if recipe.key == constructedMemberRequest(source, "eager-inputs").producer {
		caller, known := work.memberNodes[source.request.consumer]
		if !known || caller >= len(work.operationFacts) || !source.actualsKnown {
			return false
		}
		// Pending eager support is limited to the existing inert input owner. Other
		// actuals need their original producer rather than an inventory-only promise.
		for _, actual := range source.actuals {
			if !sourceInertValueCreation(actual.expression) {
				return false
			}
		}
	}
	return true
}

// This is the existing original Get/source publication, not a source-index
// candidate or an Effects/category conclusion. Exact cuts remain independent.
func (work *callableEffectWork) freshConstructedProtocolMember(source sourceStagedConstructedMember) bool {
	if !work.constructedIssued[[2]*ast.Node{source.request.producer.operation, source.construction.site}] {
		return false
	}
	request := stagedMemberCoverageRequest(source.request, source.construction.site, source.cut)
	observed := work.operationRecipes[request.producer].memberSource
	return observed != nil && observed.coverage != nil && observed.coverage.extracted && observed.generation == work.operationGeneration && work.memberCoverageObserved[request.producer] == work.operationGeneration && observed.coverage.cut == source.cut && sameOperationRequest(observed.parent, source.request)
}

func (work *callableEffectWork) issuedConstructedProtocolSource(recipe sourceStagedOperationRecipe) bool {
	if recipe.constructed == nil || recipe.key != recipe.constructed.request.producer || !validConstructedMemberRecipe(recipe) || len(recipe.constructedGroup) == 0 {
		return false
	}
	for _, source := range recipe.constructedGroup {
		if !sameOperationRequest(source.request, recipe.constructed.request) || !work.freshConstructedProtocolMember(source) {
			return false
		}
	}
	return true
}
