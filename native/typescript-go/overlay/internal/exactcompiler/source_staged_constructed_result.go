package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func cloneConstructedMemberSource(source sourceStagedConstructedMember) sourceStagedConstructedMember {
	source.writers = cloneOperationDelta(sourceStagedOperationDelta{exposures: source.writers}).exposures
	source.actuals = append([]sourceRelativeActual(nil), source.actuals...)
	for index := range source.actuals {
		source.actuals[index].endpoint = cloneSourceRelativeEndpoint(source.actuals[index].endpoint)
	}
	return source
}

// cloneConstructedDisposition detaches result prefixes for a cloned graph.
// The descriptions retain source cuts, never the original Get/query or scope.
func cloneConstructedDisposition(proof *sourceStagedConstructedDisposition) *sourceStagedConstructedDisposition {
	if proof == nil {
		return nil
	}
	copy := *proof
	copy.lookupEffects = cloneOperationDelta(sourceStagedOperationDelta{effects: proof.lookupEffects}).effects
	if proof.container != nil {
		container := cloneConstructedMemberSource(*proof.container)
		copy.container = &container
	}
	copy.resultSources = append([]sourceStagedConstructedMember(nil), proof.resultSources...)
	for index := range copy.resultSources {
		copy.resultSources[index] = cloneConstructedMemberSource(copy.resultSources[index])
	}
	copy.resultAssignments = append([]sourceStagedConstructedAssignmentResult(nil), proof.resultAssignments...)
	copy.resultValues = cloneOperationDelta(sourceStagedOperationDelta{exposures: proof.resultValues}).exposures
	return &copy
}

func constructedResultUndefined(source *sourceStagedConstructedMember) sourceStagedOperationAlternative {
	return sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointUndefined, producer: source.request.producer.operation, get: source.get, cut: source.cut}}
}

// constructedMemberResultDelta validates a detached conditional native result
// envelope. Complete source coverage is issued separately by its semantic owner.
// No key equality, current table contents or normal return is described here.
func constructedMemberResultDelta(source *sourceStagedConstructedMember, proof *sourceStagedConstructedDisposition) (sourceStagedOperationDelta, bool) {
	delta := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{constructedMemberRequest(source, "own-writers")}}
	if proof == nil {
		return delta, true
	}
	if !validConstructedSourceDisposition(proof, source, constructedMemberRequest(source, "member-result").producer) || len(proof.resultValues) == 0 || !sameOperationAlternative(proof.resultValues[0], constructedResultUndefined(source)) {
		return sourceStagedOperationDelta{}, false
	}
	delta.required = append(delta.required, constructedMemberRequest(source, "callee"), constructedMemberRequest(source, "eager-inputs"))
	seen := make(map[sourceStagedOperationKey]bool)
	for _, writer := range proof.resultSources {
		if !validConstructedMemberSource(&writer) || writer.kind != sourceNativeWeakMapSetEffect || writer.construction != source.construction || seen[writer.request.producer] {
			return sourceStagedOperationDelta{}, false
		}
		seen[writer.request.producer] = true
		for _, role := range []string{"own-writers", "eager-inputs", "callee"} {
			delta.required = append(delta.required, constructedMemberRequest(&writer, role))
		}
		if writer.actualsKnown && len(writer.actuals) == 2 {
			delta.required = append(delta.required, constructedPayloadRequest(source, &writer))
			if proof.resultComplete {
				present := false
				for _, value := range proof.resultValues {
					present = present || value.creating == nil && sameOperationEndpoint(value.endpoint, writer.actuals[1].endpoint)
				}
				if !present {
					return sourceStagedOperationDelta{}, false
				}
			}
		} else if proof.resultComplete {
			return sourceStagedOperationDelta{}, false
		}
	}

	// An assignment/New relationship is a separate source premise. It retains
	// the full original writer and constructor phases, not an inertness claim.
	seenAssignments := make(map[sourceStagedOperationKey]bool)
	for _, relation := range proof.resultAssignments {
		matched := false
		for _, writer := range proof.resultSources {
			matched = matched || validConstructedAssignmentResult(relation, &writer)
		}
		if !matched || seenAssignments[relation.writer.producer] {
			return sourceStagedOperationDelta{}, false
		}
		seenAssignments[relation.writer.producer] = true
		delta.required = appendEntryLawRequirement(delta.required, relation.writer)
		// These are the original conditional method source-set owners, not the
		// optional callee-alternatives/no-input-invocation optimization.
		delta.required = appendEntryLawRequirement(delta.required, stagedMemberCoverageRequest(source.request, source.construction.site, source.cut))
		for _, writer := range proof.resultSources {
			if validConstructedAssignmentResult(relation, &writer) {
				delta.required = appendEntryLawRequirement(delta.required, stagedMemberCoverageRequest(writer.request, writer.construction.site, writer.cut))
			}
		}
		delta.required = appendEntryLawRequirement(delta.required, relation.root)
		for _, phase := range stagedConstructionPhases {
			delta.required = appendEntryLawRequirement(delta.required, stagedConstructionRequest(relation.root, phase))
		}
	}
	for index, value := range proof.resultValues {
		if index == 0 {
			continue
		}
		matched := false
		for _, writer := range proof.resultSources {
			matched = matched || value.creating == nil && writer.actualsKnown && len(writer.actuals) == 2 && sameOperationEndpoint(value.endpoint, writer.actuals[1].endpoint)
		}
		if !matched {
			return sourceStagedOperationDelta{}, false
		}
	}
	args := source.construction.site.AsNewExpression().Arguments
	if proof.resultComplete && (!proof.resultGetComplete || !source.construction.selectionComplete || args != nil && len(args.Nodes) != 0) {
		return sourceStagedOperationDelta{}, false
	}
	delta.exposures = cloneOperationDelta(sourceStagedOperationDelta{exposures: proof.resultValues}).exposures
	delta.extracted = proof.resultComplete
	return delta, true
}

// observeConstructedResultGetSource records reference-population coverage only
// inside the original selected Get callback. The native branch is conditional,
// never exclusive selection, runtime output or completed writer coverage.
func (work *callableEffectWork) observeConstructedResultGetSource(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember, complete bool) bool {
	if source.kind != sourceNativeWeakMapGetEffect {
		return true
	}
	b := q.stagedConstructedMember
	if b == nil || !b.live || b.owner != q || b.issued == nil || b.generation != q.owner.generation || !sameOperationRequest(b.request, source.request) || b.site != source.construction.site || b.cut != source.cut || q.relativeInputCut(source.request.producer.operation) != b.cut {
		return false
	}
	key := constructedMemberRequest(&source, "member-result").producer
	recipe := work.operationRecipes[key]
	proof := cloneConstructedDisposition(recipe.constructedDisposition)
	if proof == nil {
		proof = &sourceStagedConstructedDisposition{request: source.request, site: source.construction.site, generation: q.owner.generation, role: "member-result", resultValues: []sourceStagedOperationAlternative{constructedResultUndefined(&source)}}
	}
	proof.resultGetComplete = proof.resultGetComplete || complete
	delta, valid := constructedMemberResultDelta(&source, proof)
	if !valid {
		return false
	}
	recipe.constructedDisposition, recipe.delta = proof, delta
	return work.attachOperationSource(facts, recipe)
}

// prepareConstructedMemberResults services only actual result-role demands,
// including dependencies of passive readers. Set discovery registers source
// prefixes through the original publisher and never enrolls a future Set use.
func (work *callableEffectWork) prepareConstructedMemberResults(facts []callableFacts, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || work.operationGeneration != owner.values.generation {
		return
	}
	demanded := make(map[sourceStagedOperationKey]bool)
	for key, recipe := range work.operationRecipes {
		if _, adopted := work.operationIDs[key]; adopted && recipe.constructed != nil && key == constructedMemberRequest(recipe.constructed, "member-result").producer {
			demanded[key] = true
		}
		for _, required := range recipe.delta.required {
			child := work.operationRecipes[required.producer]
			if child.constructed != nil && required.producer == constructedMemberRequest(child.constructed, "member-result").producer {
				demanded[required.producer] = true
			}
		}
	}
	for key := range demanded {
		work.prepareConstructedMemberResult(facts, key, owner)
	}
}

func (work *callableEffectWork) prepareConstructedMemberResult(facts []callableFacts, key sourceStagedOperationKey, owner *executableBodyOwner) {
	recipe := work.operationRecipes[key]
	source := recipe.constructed
	if source == nil || source.kind != sourceNativeWeakMapGetEffect || recipe.constructedDisposition == nil || !work.constructedIssued[[2]*ast.Node{source.request.producer.operation, source.construction.site}] || owner.standardConstructions[source.construction.site] != source.construction {
		return
	}
	proof := cloneConstructedDisposition(recipe.constructedDisposition)
	if proof.generation != owner.values.generation {
		return
	}
	work.completeDemandedConstructedSource(facts, key, source, owner)
	args := source.construction.site.AsNewExpression().Arguments
	// Complete private uses account for supported own-slot writes. The broad
	// writer discovery prefix also contains unrelated dynamic targets, which do
	// not impose a pristine standard-prototype requirement under built-in trust.
	complete := proof.resultGetComplete && source.construction.selectionComplete && (args == nil || len(args.Nodes) == 0) && len(work.operationRecipes[constructedMemberRequest(source, "own-writers").producer].writerRequired) == 0 && work.constructedUsesCovered(facts, source, owner)
	index := owner.values.index(ast.GetSourceFileOfNode(source.construction.site))
	for _, call := range index.calls {
		if !ast.IsPropertyAccessExpression(call.Expression()) {
			continue
		}
		receiver, name := accessorReceiver(call.Expression())
		if name != "set" {
			continue
		}
		matches := false
		for _, site := range stagedReceiverRelations(receiver, owner.values, index).sites {
			matches = matches || site == source.construction.site
		}
		if !matches {
			continue
		}
		occurrence := index.normalOccurrences[call]
		if occurrence == nil {
			complete = false
			continue
		}
		region := occurrence.region
		if region == nil {
			region = sourceStagedModuleOwner(call)
		}
		caller, known := work.memberNodes[region]
		if !known {
			complete = false
			continue
		}
		request, represented := work.prepareConstructedResultSource(facts, caller, call, owner)
		if !represented {
			complete = false
			continue
		}
		matched := false
		for _, writer := range work.operationRecipes[request.producer].constructedGroup {
			if writer.kind != sourceNativeWeakMapSetEffect || writer.construction != source.construction {
				continue
			}
			matched = true
			work.completeDemandedConstructedSource(facts, key, &writer, owner)
			found := false
			for _, prior := range proof.resultSources {
				found = found || sameConstructedMemberSource(&prior, &writer)
			}
			if !found {
				proof.resultSources = append(proof.resultSources, cloneConstructedMemberSource(writer))
			}
			complete = complete && writer.actualsKnown && len(writer.actuals) == 2 && len(work.operationRecipes[constructedMemberRequest(&writer, "own-writers").producer].writerRequired) == 0
			if !writer.actualsKnown || len(writer.actuals) != 2 {
				complete = false
				continue
			}
			if !constructedResultEndpointCovered(writer.actuals[1].endpoint, owner) {
				relation, represented := work.describeConstructedAssignmentResult(facts, &writer, owner)
				if !represented {
					complete = false
					continue
				}
				present := false
				for _, prior := range proof.resultAssignments {
					present = present || sameOperationRequest(prior.writer, relation.writer) && prior.binding == relation.binding && prior.construction == relation.construction && sameOperationRequest(prior.root, relation.root)
				}
				if !present {
					proof.resultAssignments = append(proof.resultAssignments, relation)
				}
			}
			value := sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(writer.actuals[1].endpoint)}
			present := false
			for _, prior := range proof.resultValues {
				present = present || sameOperationAlternative(prior, value)
			}
			if !present {
				proof.resultValues = append(proof.resultValues, value)
			}
		}
		complete = complete && matched
	}
	proof.resultComplete = complete
	delta, valid := constructedMemberResultDelta(source, proof)
	if !valid || !operationDeltaPrefix(recipe.delta, delta) || recipe.delta.extracted && !delta.extracted {
		return
	}
	if operationDeltaPrefix(delta, recipe.delta) && recipe.delta.extracted == delta.extracted {
		return
	}
	recipe.constructedDisposition, recipe.delta = proof, delta
	work.attachOperationSource(facts, recipe)
}

// This is source DATA association, not creation purity as a value proof. An own
// formal stays a role. Literal creation additionally needs complete lexical
// bindings, including deferred bodies/defaults, without a missing creating Call.
func constructedResultEndpointCovered(endpoint sourceRelativeEndpoint, owner *executableBodyOwner) bool {
	if endpoint.kind == relativeEndpointRole {
		return endpoint.role.kind == relativeRoleFormal
	}
	if endpoint.kind != relativeEndpointExpression || endpoint.expression == nil || !sourceInertValueCreation(endpoint.expression) || ast.IsIdentifier(endpoint.expression) {
		return false
	}
	expression := endpoint.expression
	covered := true
	walkNode(expression, func(node *ast.Node) bool {
		if ast.IsPartOfTypeNode(node) {
			return false
		}
		if node.Kind == ast.KindThisKeyword || node.Kind == ast.KindSuperKeyword {
			covered = false
		}
		if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) && !isStaticPropertyName(node) {
			symbol := owner.checker.GetSymbolAtLocation(node)
			if symbol == nil || symbol.ValueDeclaration == nil || !expression.Contains(symbol.ValueDeclaration) && enclosingCallableNode(symbol.ValueDeclaration) != nil {
				covered = false
			}
		}
		return covered
	})
	return covered
}
