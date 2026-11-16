package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedConstructedLookupSource accounts only for the ordinary method
// property lookup beneath a constructed get/set Call. These native algorithms
// touch internal storage, not property slots. Stored-result influence remains in
// resultSources; this relationship grants no table contents or selected output.
// Actual evaluation and all original Call/Get/New source debts remain required.
type sourceStagedConstructedLookupSource struct {
	calleeOnly     bool // actual PropertyAccess phase, never invocation/actual evaluation
	parents, calls []sourceStagedConstructedMember
	bindings       []sourceStagedConstructedLookupBinding
	assignments    []sourceStagedConstructedAssignmentResult
	constructors   []sourceStagedOperationRequest
	receiverInputs []sourceStagedOperationRequest
}

type sourceStagedConstructedLookupBinding struct{ expression, declaration, consumer *ast.Node }

func cloneConstructedLookupSource(source *sourceStagedConstructedLookupSource) *sourceStagedConstructedLookupSource {
	if source == nil {
		return nil
	}
	copy := *source
	copy.parents = append([]sourceStagedConstructedMember(nil), source.parents...)
	copy.calls = append([]sourceStagedConstructedMember(nil), source.calls...)
	for i := range copy.parents {
		copy.parents[i] = cloneConstructedMemberSource(copy.parents[i])
	}
	for i := range copy.calls {
		copy.calls[i] = cloneConstructedMemberSource(copy.calls[i])
	}
	copy.bindings = append([]sourceStagedConstructedLookupBinding(nil), source.bindings...)
	copy.assignments = append([]sourceStagedConstructedAssignmentResult(nil), source.assignments...)
	copy.constructors = append([]sourceStagedOperationRequest(nil), source.constructors...)
	copy.receiverInputs = append([]sourceStagedOperationRequest(nil), source.receiverInputs...)
	return &copy
}

func sameConstructedLookupProtocol(a, b *sourceStagedMemberSource) bool {
	var x, y *sourceStagedConstructedLookupSource
	if a.protocolSource != nil {
		x = a.protocolSource.constructedLookup
	}
	if b.protocolSource != nil {
		y = b.protocolSource.constructedLookup
	}
	// Like the other protocol descriptors, an unextracted raw source may gain
	// its actual owner's typed relation. An attached relation cannot disappear.
	if x == nil {
		return true
	}
	if y == nil {
		return false
	}
	if x.calleeOnly != y.calleeOnly || len(x.parents) != len(y.parents) || len(x.calls) != len(y.calls) || len(x.bindings) != len(y.bindings) || len(x.assignments) != len(y.assignments) || len(x.constructors) != len(y.constructors) {
		return false
	}
	for i := range x.parents {
		if !sameConstructedMemberSource(&x.parents[i], &y.parents[i]) {
			return false
		}
	}
	for i := range x.calls {
		if !sameConstructedMemberSource(&x.calls[i], &y.calls[i]) {
			return false
		}
	}
	for i := range x.bindings {
		if x.bindings[i] != y.bindings[i] {
			return false
		}
	}
	for i := range x.assignments {
		if x.assignments[i] != y.assignments[i] {
			return false
		}
	}
	return operationPrefix(x.constructors, y.constructors, sameOperationRequest) && operationPrefix(y.constructors, x.constructors, sameOperationRequest) && operationPrefix(x.receiverInputs, y.receiverInputs, sameOperationRequest) && operationPrefix(y.receiverInputs, x.receiverInputs, sameOperationRequest)
}

func constructedLookupRequirements(p *sourceStagedConstructedLookupSource) []sourceStagedOperationRequest {
	required := append([]sourceStagedOperationRequest(nil), p.receiverInputs...)
	if p.calleeOnly {
		for _, parent := range p.parents {
			for _, request := range constructedMethodLookupRequirements(&parent) {
				required = appendEntryLawRequirement(required, request)
			}
		}
		for _, call := range p.calls {
			required = appendEntryLawRequirement(required, constructedMemberRequest(&call, "method-lookup"))
		}
		return required
	}
	for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
		for _, member := range group {
			for _, request := range standardMemberCallRequirements(&member) {
				required = appendEntryLawRequirement(required, request)
			}
		}
	}
	for _, root := range p.constructors {
		required = appendEntryLawRequirement(required, root)
		for _, phase := range stagedConstructionPhases {
			required = appendEntryLawRequirement(required, stagedConstructionRequest(root, phase))
		}
	}
	return required
}

func validConstructedLookupProtocolRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if !validStagedMemberProtocolEnvelope(recipe) || s == nil || s.protocolSource == nil {
		return false
	}
	p, bridge := s.protocolSource.constructedLookup, s.protocolSource
	if p == nil || s.generation == nil || !validStagedMemberParent(s.parent) || !validStagedMemberObservation(s.parent, s.candidate.cut) || !sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, s.candidate)) || recipe.key != s.request.producer || s.writeEffects || s.coverage != nil || s.call != nil || s.getEffects != nil || s.extraction == nil || s.extraction.delta.extracted || bridge.nativeArgument != nil || bridge.selfRead || bridge.setEffects || bridge.get != nil || bridge.evaluation != nil || bridge.external != nil || !sameOperationRequest(bridge.required, sourceStagedOperationRequest{}) || s.extraction.mode != accessorAcquire || s.extraction.generation != s.generation || s.extraction.cut != s.candidate.cut || !sameOperationRequest(s.extraction.request, s.parent) || !s.candidate.protocol || !ast.IsCallExpression(s.parent.producer.operation) || !ast.IsPropertyAccessExpression(s.parent.producer.operation.Expression()) || (!p.calleeOnly && !ast.IsCallExpression(s.candidate.operation) || p.calleeOnly && !ast.IsPropertyAccessExpression(s.candidate.operation)) || len(p.parents) == 0 || len(p.calls) == 0 {
		return false
	}
	if p.calleeOnly && (len(p.bindings)+len(p.assignments)+len(p.constructors) != 0) {
		return false
	}
	for groupIndex, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
		for _, member := range group {
			call := s.candidate.operation
			if groupIndex == 0 {
				call = s.parent.producer.operation
			} else if p.calleeOnly {
				call = s.candidate.operation.Parent
				if call == nil || !ast.IsCallExpression(call) || call.Expression() != s.candidate.operation || member.get != s.candidate.operation {
					return false
				}
			}
			if !validConstructedMemberSource(&member) || member.request.producer.operation != call || !member.construction.selectionComplete || !p.calleeOnly && !member.actualsKnown || member.kind != sourceNativeWeakMapGetEffect && member.kind != sourceNativeWeakMapSetEffect {
				return false
			}
			_, name := accessorReceiver(member.get)
			if member.kind == sourceNativeWeakMapGetEffect && (name != "get" || !p.calleeOnly && len(member.actuals) != 1) || member.kind == sourceNativeWeakMapSetEffect && (name != "set" || !p.calleeOnly && len(member.actuals) != 2) {
				return false
			}
		}
	}
	if !p.calleeOnly {
		for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
			for _, member := range group {
				constructorRequired := false
				for _, root := range p.constructors {
					constructorRequired = constructorRequired || root.producer.operation == member.construction.site && root.producer.declaration == member.construction.owner
				}
				if !constructorRequired {
					return false
				}
				for _, actual := range member.actuals {
					expression := unwrapSourceCallableReference(actual.expression)
					if sourceInertValueCreation(expression) {
						continue
					}
					accounted := false
					if ast.IsIdentifier(expression) {
						for _, binding := range p.bindings {
							accounted = accounted || binding.expression == expression && binding.consumer == member.request.consumer && binding.declaration != nil && enclosingCallableNode(binding.declaration) == binding.consumer && (ast.IsParameterDeclaration(binding.declaration) || ast.IsVariableDeclaration(binding.declaration))
						}
					} else if member.kind == sourceNativeWeakMapSetEffect && actual.ordinal == 1 {
						for _, relation := range p.assignments {
							accounted = accounted || validConstructedAssignmentResult(relation, &member)
						}
					}
					if !accounted {
						return false
					}
				}
			}
		}
	}
	for _, input := range p.receiverInputs {
		matched := false
		for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
			for _, member := range group {
				matched = matched || validStagedCallResultReading(input, member.request, member.cut)
			}
		}
		if !matched {
			return false
		}
	}
	matched := false
	for _, parent := range p.parents {
		matched = matched || parent.construction.site == s.candidate.origin && sameOperationRequest(parent.request, s.parent) && parent.cut == s.candidate.cut
	}
	if !matched || operationDeltaSize(recipe.delta) != len(recipe.delta.required) || len(recipe.writerRequired) != 0 {
		return false
	}
	expected := constructedLookupRequirements(p)
	return operationPrefix(expected, recipe.delta.required, sameOperationRequest) && operationPrefix(recipe.delta.required, expected, sameOperationRequest)
}

// constructedLookupGroupCurrent consumes existing complete private-use and
// original C observations, never the optional no-input-invocation method law.
// Authored own replacements retain their writer requirements and fail this arm.
func (work *callableEffectWork) constructedLookupGroupCurrent(group []sourceStagedConstructedMember) bool {
	if len(group) == 0 {
		return false
	}
	root := work.operationRecipes[group[0].request.producer]
	if !work.constructedReceiverReadingsCurrent(root) {
		return false
	}
	for _, member := range group {
		inputs, valid := work.constructedGetReceiverInputs(&member)
		if !valid || !work.constructedReceiverDataInputsCurrent(root, inputs) {
			return false
		}
	}
	if !work.issuedConstructedProtocolSource(root) || len(root.constructedGroup) != len(group) {
		return false
	}
	for i, member := range group {
		if !sameConstructedMemberSource(&member, &root.constructedGroup[i]) || !work.constructedAssignmentProtocolCurrent(&member) {
			return false
		}
		coverage := work.operationRecipes[stagedMemberCoverageRequest(member.request, member.construction.site, member.cut).producer]
		for _, request := range coverage.delta.required {
			child := work.operationRecipes[request.producer].memberSource
			if child != nil && (child.candidate.runtimeUnknown || len(child.values) != 0 || child.call != nil && len(child.call.values) != 0) {
				return false
			}
		}
		own := work.operationRecipes[constructedMemberRequest(&member, "own-writers").producer]
		if !validConstructedMemberRecipe(own) || !own.delta.extracted || own.constructedDisposition == nil || own.constructedDisposition.generation != work.operationGeneration || len(own.writerRequired) != 0 {
			return false
		}
	}
	return true
}

// attachConstructedLookupProtocol requires the current original work owner.
// No-owner notifications cannot create this typed relationship from a cached
// descriptor. All observations below were issued by existing source producers.
func (work *callableEffectWork) attachConstructedLookupProtocol(facts []callableFacts, key sourceStagedOperationKey, producer sourceStagedOperationRecipe, owner *executableBodyOwner) bool {
	recipe := work.operationRecipes[key]
	s := recipe.memberSource
	if owner == nil || owner.values == nil || owner.project == nil || owner.checker == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || !work.operationGeneration.active || owner.checker != work.operationGeneration.checker || owner.values.checker != owner.checker || owner.values.program != work.operationGeneration.program || s == nil || s.extraction == nil || s.extraction.mode != accessorAcquire || s.protocolSource != nil && s.protocolSource.constructedLookup == nil || !s.candidate.protocol || !ast.IsCallExpression(s.parent.producer.operation) {
		return false
	}
	caller, known := work.memberNodes[s.parent.consumer]
	publisher := owner.pendingMemberPublishers[s.parent.consumer]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	coverageRequest := stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)
	coverage := work.operationRecipes[coverageRequest.producer]
	if !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || work.memberCoverageObserved[coverageRequest.producer] != work.operationGeneration || coverage.memberSource.generation != work.operationGeneration || !sameOperationRequest(coverage.memberSource.parent, s.parent) || coverage.memberSource.coverage.cut != s.candidate.cut {
		return false
	}
	member := false
	for _, request := range coverage.delta.required {
		member = member || sameOperationRequest(request, s.request)
	}
	if !member {
		return false
	}
	parent := work.operationRecipes[s.parent.producer]
	p := &sourceStagedConstructedLookupSource{parents: append([]sourceStagedConstructedMember(nil), parent.constructedGroup...), calls: append([]sourceStagedConstructedMember(nil), producer.constructedGroup...)}
	if ast.IsPropertyAccessExpression(s.candidate.operation) {
		p.calleeOnly = true
		for _, call := range p.calls {
			if call.get != s.candidate.operation {
				return false
			}
			get := work.operationRecipes[constructedMemberRequest(&call, "method-lookup").producer]
			if !validConstructedMemberRecipe(get) || get.constructedDisposition == nil {
				return false
			}
		}
	}

	for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
		for _, member := range group {
			inputs, valid := work.constructedGetReceiverInputs(&member)
			if !valid {
				return false
			}
			for _, input := range inputs {
				p.receiverInputs = appendEntryLawRequirement(p.receiverInputs, input)
			}
		}
	}
	current := work.constructedLookupGroupCurrent(p.parents) && work.constructedLookupGroupCurrent(p.calls)
	if !p.calleeOnly {
		for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
			for _, member := range group {
				constructionKey := sourceStagedOperationKey{declaration: member.construction.owner, operation: member.construction.site, kind: relativeDemandEffects}
				construction := work.operationRecipes[constructionKey]
				if !validStagedConstructionEffectsRecipe(construction) || construction.constructionEffects.phase != "" {
					return false
				}
				p.constructors = appendEntryLawRequirement(p.constructors, construction.constructionEffects.root)
				for _, actual := range member.actuals {
					expression := unwrapSourceCallableReference(actual.expression)
					if sourceInertValueCreation(expression) {
						continue
					}
					if ast.IsIdentifier(expression) {
						symbol := owner.checker.GetSymbolAtLocation(expression)
						if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) && !ast.IsParameterDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != member.request.consumer {
							return false
						}
						p.bindings = append(p.bindings, sourceStagedConstructedLookupBinding{expression, symbol.ValueDeclaration, member.request.consumer})
						continue
					}
					if member.kind != sourceNativeWeakMapSetEffect || actual.ordinal != 1 {
						return false
					}
					relation, valid := work.describeConstructedAssignmentResult(facts, &member, owner)
					if !valid {
						return false
					}
					p.assignments = append(p.assignments, relation)
					p.constructors = appendEntryLawRequirement(p.constructors, relation.root)
				}
			}
		}
	}
	copy := *s
	copy.protocolSource = &sourceStagedMemberProtocol{constructedLookup: cloneConstructedLookupSource(p)}
	recipe.memberSource = &copy
	recipe.delta = sourceStagedOperationDelta{extracted: current, required: constructedLookupRequirements(p)}
	if !validConstructedLookupProtocolRecipe(recipe) || !work.attachOperationSource(facts, recipe) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[key] = work.operationGeneration
	return true
}

func (work *callableEffectWork) constructedLookupSourceCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validConstructedLookupProtocolRecipe(recipe) || !recipe.delta.extracted || recipe.memberSource.generation != work.operationGeneration || work.operationGeneration == nil || !work.operationGeneration.active || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	registered := work.operationRecipes[recipe.key]
	if registered.memberSource != recipe.memberSource {
		return false
	}
	p := recipe.memberSource.protocolSource.constructedLookup
	if !work.constructedLookupGroupCurrent(p.parents) || !work.constructedLookupGroupCurrent(p.calls) {
		return false
	}
	if p.calleeOnly {
		root := work.operationRecipes[p.calls[0].request.producer]
		if root.constructedDisposition == nil || root.constructedDisposition.role != "receiver" || root.constructedDisposition.generation != work.operationGeneration {
			return false
		}
		for _, call := range p.calls {
			if !work.constructedMethodGetCurrent(work.operationRecipes[constructedMemberRequest(&call, "method-lookup").producer]) {
				return false
			}
		}
		return true
	}
	for _, binding := range p.bindings {
		symbol := work.operationGeneration.checker.GetSymbolAtLocation(binding.expression)
		if symbol == nil || symbol.ValueDeclaration != binding.declaration || enclosingCallableNode(binding.declaration) != binding.consumer {
			return false
		}
	}
	for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
		for _, member := range group {
			key := sourceStagedOperationKey{declaration: member.construction.owner, operation: member.construction.site, kind: relativeDemandEffects}
			observed := work.constructionEffectsObserved[key]
			if observed == nil || observed.constructor != member.construction.constructor {
				return false
			}
		}
	}
	for _, relation := range p.assignments {
		matched := false
		for _, group := range [][]sourceStagedConstructedMember{p.parents, p.calls} {
			for _, member := range group {
				if !validConstructedAssignmentResult(relation, &member) {
					continue
				}
				symbol := work.operationGeneration.checker.GetSymbolAtLocation(member.actuals[1].endpoint.expression.AsBinaryExpression().Left)
				matched = symbol != nil && symbol.ValueDeclaration == relation.binding
			}
		}
		observed := work.constructionEffectsObserved[relation.root.producer]
		if !matched || observed == nil || observed.constructor != relation.construction.constructor {
			return false
		}
	}
	for _, root := range p.constructors {
		construction := work.operationRecipes[root.producer]
		if !validStagedConstructionEffectsRecipe(construction) || !sameOperationRequest(construction.constructionEffects.root, root) || !work.passiveConstructionEffectsReady(construction) {
			return false
		}
	}
	return true
}
