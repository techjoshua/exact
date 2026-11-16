package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// observeDescriptorRecordGet is the original lexical Get visitor, not recovery
// from a stored marker. It owns this actual receiver alternative and preserves
// the original operation/read cuts. Unsupported consumers keep the full source
// route, including aliases and invoked/dormant callable provenance.
func (q *sourceValueQuery) observeDescriptorRecordGet(view sourceNativeDescriptorView, reference *sourceGetReference, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, read *sourceMemberWriterReadCut, result *accessorCandidates) bool {
	get := q.descriptorRecordGetInputs(view, reference, projection, name, mode)
	b := q.stagedMember
	if get == nil || b == nil || b.descriptorRecordGet == nil || read == nil || read.operation != get.operation || b.request.producer.operation != get.operation || b.issuer != q {
		return false
	}
	restore := q.enterStagedMemberSource(get, read, result)
	defer restore()
	use, eligible := q.descriptorRecordGetUseOwned(get, read, mode)
	if !eligible {
		return false
	}
	if !b.descriptorRecordGet(view, get, read, bindings) {
		// Failure leaves a compiler debt. The original marker path retains its
		// known prefix and cannot treat a missing source child as runtime unknown.
		b.represented = false
		return false
	}
	if use.kind == descriptorFullSource {
		return false // Effects were enrolled; full provenance/marker debt stays with the strong owner.
	}
	copy := projectNativeDescriptorView(view, []string{get.propertyKey})
	result.values = append(result.values, sourceValue{descriptorView: &copy})
	result.valueIncomplete, result.sourceOwned = true, true
	return true
}

// descriptorRecordSources uses only the genuine current work registry. Source
// membership never requires unrelated metadata/non-body publishers to execute.
func (work *callableEffectWork) descriptorRecordSources(facts []callableFacts, q *sourceValueQuery, result *accessorCandidates) ([]*ast.SourceFile, bool) {
	if q == nil || q.owner == nil || q.executable == nil || work.operationGeneration != q.owner.generation || len(facts) == 0 || len(work.operationFacts) != len(facts) || &work.operationFacts[0] != &facts[0] {
		return nil, false
	}
	var sources []*ast.SourceFile
	seen := make(map[*ast.SourceFile]bool)
	complete := true
	for i := range facts {
		fact := &facts[i]
		if fact.sourceFile == nil || fact.sourceFile.IsDeclarationFile {
			continue
		}
		if !q.charge(result, fact.node) || q.owner.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
			complete = false
			continue
		}
		if !seen[fact.sourceFile] {
			seen[fact.sourceFile] = true
			sources = append(sources, fact.sourceFile)
		}
	}
	return sources, complete && len(sources) != 0
}

// publishDescriptorRecordGet owns conditional own-data and inherited Get
// accounting. It does not select which record shape exists. Source C enumerates
// every modeled prototype mapping; known installed getters retain actual DATA,
// root Effects and canonical BODY subscribers independently of that membership.
func (work *callableEffectWork) publishDescriptorRecordGet(facts []callableFacts, q *sourceValueQuery, view sourceNativeDescriptorView, get *sourceGetInputs, read *sourceMemberWriterReadCut, bindings sourceValueBindings) bool {
	use, eligible := q.descriptorRecordGetUseOwned(get, read, accessorRead)
	if !eligible || view.source.generation != work.operationGeneration || len(view.projection) != 0 || !work.descriptorRecordReadingOwned(view, q.stagedMember.request, q.stagedMember.observation) {
		return false
	}
	b := q.stagedMember
	if b.publishing {
		return false
	}
	caller, known := work.memberNodes[b.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || q.executable == nil || !q.stagedFieldWorkOwner(q.executable) {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return false
	}
	if !work.descriptorRecordViewDelivered(&view) {
		return false
	}
	prototype := q.stagedConditionalObjectPrototype(view.method)
	if prototype.prototype == nil || !prototype.ordinaryLink || !prototype.terminalNull {
		return false
	}
	part := accessorCandidates{}
	sources, complete := work.descriptorRecordSources(facts, q, &part)
	var storage [4]sourceValueIndex
	indexes := q.occurrenceSourceViewIn(prototype.prototype, &part, sources, storage[:0])
	if !complete || frameworkEffectsCompilerPending(part) || !q.liveStagedMemberSource(b, get, read) {
		return false
	}
	// The marker remains the actual receiver. The library declaration anchors
	// only this conditional prototype lookup's source population; it is not a
	// replacement receiver, raw result object or an installed-field issuer.
	q.prepareStagedMemberSources(get, read, prototype.prototype, []string{get.propertyKey}, "", accessorRead, indexes, &part)
	if !q.liveStagedMemberSource(b, get, read) || b.coverage == nil || b.coverage.origin != prototype.prototype || !work.publishStagedMemberCoverage(facts, q) {
		return false
	}
	d := &sourceDescriptorRecordGet{view: projectNativeDescriptorView(view, nil), use: *use, field: get.propertyKey, prototype: prototype, coverage: b.coverage.request}
	candidate := sourceStagedMemberCandidate{request: b.request, operation: get.operation, origin: view.delivery.producer.operation, protocol: true, getContribution: true, cut: b.observation}
	candidate.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.operation, producer: get.operation, cut: b.observation}
	request := stagedMemberCandidateRequest(b.request, candidate)
	tail, ready := work.descriptorRecordInstallationRequirements(facts, q, d, request)
	required := []sourceStagedOperationRequest{view.delivery, d.coverage}
	for _, child := range tail {
		required = appendEntryLawRequirement(required, child)
	}
	accounted := ready && b.coverage.extracted && b.represented && !frameworkEffectsCompilerPending(part)
	source := &sourceStagedMemberSource{parent: b.request, request: request, candidate: candidate, generation: work.operationGeneration, getEffects: &sourceStagedMemberGetEffects{accounted: accounted, descriptor: d}}
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: source, delta: sourceStagedOperationDelta{extracted: accounted, required: required, effects: []EnvironmentEffectSource{descriptorRecordRuntimeMay()}}}
	if !validDescriptorRecordGetRecipe(recipe) {
		return false
	}
	accepted := false
	if _, present := work.operationRecipes[recipe.key]; present {
		accepted = work.attachOperationSource(facts, recipe)
	} else {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if !accepted || !q.liveStagedMemberSource(b, get, read) {
		return false
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	id, adopted := work.requireOperation(facts, request)
	if !adopted || !work.subscribeDescriptorRecordInstallations(facts, id, q.executable) {
		return false
	}
	work.issueInstalledMutationGetterInputs(facts, q, id, get, read)
	if !work.enrollDescriptorRecordResumption(facts, q, view, get, read, request) {
		return false
	}
	work.publishMemberSourceContributions(id)
	work.publishOriginalRecordGetMutationSource(facts, q, get, read, recipe)
	return accounted
}
