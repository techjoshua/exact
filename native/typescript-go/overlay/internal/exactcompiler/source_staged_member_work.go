package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedMemberSource seals one original candidate relationship. Its
// activation, receiver, key and stored value have not been recovered. Indexed
// candidates stay pending. A separately observed external runtime terminal can
// carry its unknown residual, without paying any candidate or selection debt.
type sourceStagedMemberSource struct {
	nativeFieldGet              *sourceStagedNativeFieldGet         // Immutable foreign Get SOURCE purpose; never a query or receipt.
	originalGetMutationInterest *sourceOriginalGetMutationInterest  // Passive original-owner demand, no Get/current receipt.
	originalGetMutation         *sourceOriginalGetMutationSource    // Distinct conditional Get SOURCE output, no Effects/value loan.
	reflectiveContribution      *sourceStagedReflectiveContribution // Conditional original-reader SOURCE, not installation/value authority.
	installedCallSelection      *sourceInstalledCallSelectionSource
	installedMember             *sourceInstalledMemberApplication // detached per-use source context
	frameworkRead               *sourceStagedOperationRequest     // Exact applied conditional-view DATA; never a raw result.
	nativeWriter                *sourceStagedNativeWriterCapability
	globalWrite                 *sourceStagedGlobalWrite
	hasFreshTarget              *sourceStagedHasFreshTarget
	targetSource                *sourceStagedReflectiveTargetSource
	writeEffects                bool // Effects-only writer dependency, separate from stored DATA recovery
	protocolSource              *sourceStagedMemberProtocol
	request                     sourceStagedOperationRequest
	parent                      sourceStagedOperationRequest
	candidate                   sourceStagedMemberCandidate
	generation                  *projectGeneration
	values                      []sourceStagedOperationAlternative
	coverage                    *sourceStagedMemberCoverage
	call                        *sourceStagedMemberCall
	descriptorStrong            *sourceDescriptorStrongReader // Actual SOURCE reader obligation; no nominal result grant.
	getEffects                  *sourceStagedMemberGetEffects
	getPreparation              *sourceStagedGetPreparation
	extraction                  *sourceStagedMemberDisposition
	moduleExcluded              *sourceStagedModuleActivation
	moduleImports               []sourceStagedActivationImport
}

func stagedMemberGetSourceRequest(fact *callableFacts, node *ast.Node) (sourceStagedOperationRequest, bool) {
	return sourceStagedOccurrenceRequest(fact, node, relativeDemandEffects, fmt.Sprintf("%s:member-source:%d", fact.summary.ID, node.Pos()))
}

func stagedMemberCandidateRequest(parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate) sourceStagedOperationRequest {
	request := parent
	if candidate.getContribution {
		request.producer.selector = sourceStagedOperationSelector{occurrence: candidate.value.expression, field: "member-get-effects"}
		request.edge += ":member-get-effects"
		return request
	}
	if candidate.invoking {
		request.producer.selector = sourceStagedOperationSelector{occurrence: candidate.value.expression, field: "callee-alternatives"}
		request.edge += ":callee-alternatives"
		return request
	}
	// Special Get and callee roles carry their own selectors, not an ordinary member cut.
	request.producer.selector = sourceStagedOperationSelector{occurrence: candidate.operation, association: candidate.origin, field: fmt.Sprintf("member-source:%d:%d", candidate.cut.operation.Pos(), candidate.cut.operation.End())}
	if candidate.runtimeUnknown {
		request.producer.selector.field = "member-runtime-unknown"
	}
	request.producer.selector.field = stagedMemberContextField(parent, request.producer.selector.field)
	request.edge = fmt.Sprintf("%s:member-source:%s:%d:%d:%d:%d", parent.edge, ast.GetSourceFileOfNode(candidate.operation).FileName(), candidate.operation.Pos(), candidate.origin.Pos(), candidate.cut.operation.Pos(), candidate.cut.operation.End())
	return request
}

// stagedMemberWriterEffectsRequest keeps original writer Effects independent of
// the stored-value/creating-input ticket used by subsequent data consumers.
func stagedMemberWriterEffectsRequest(parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate) sourceStagedOperationRequest {
	request := stagedMemberCandidateRequest(parent, candidate)
	request.producer.selector.field += ":effects"
	request.edge += ":effects"
	return request
}

func validStagedMemberRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return validStagedGetPreparationRecipe(recipe)
	}
	source := recipe.memberSource
	if source != nil && source.nativeFieldGet != nil {
		return validNativeFieldGetRecipe(recipe)
	}
	if source != nil && source.originalGetMutationInterest != nil {
		return validOriginalGetMutationInterestRecipe(recipe)
	}
	if source != nil && source.originalGetMutation != nil {
		return validOriginalGetMutationRecipe(recipe)
	}
	if source != nil && source.reflectiveContribution != nil {
		return validReflectiveContributionRecipe(recipe)
	}
	if source != nil && source.descriptorStrong != nil {
		return validDescriptorStrongReaderRecipe(recipe)
	}
	if source != nil && source.frameworkRead != nil {
		if source.candidate.target.descriptorView != nil {
			return validDescriptorViewMemberRecipe(recipe)
		}
		return validFrameworkViewMemberRecipe(recipe)
	}
	if source != nil && source.nativeWriter != nil {
		return validNativeWriterCapabilityRecipe(recipe)
	}
	if source != nil && source.globalWrite != nil {
		return validStagedGlobalWriteRecipe(recipe)
	}
	if source != nil && source.hasFreshTarget != nil {
		return validHasFreshTargetRecipe(recipe)
	}
	if source != nil && source.targetSource != nil {
		return validStagedReflectiveTargetRecipe(recipe)
	}
	if source != nil && source.writeEffects {
		return validStagedMemberWriterEffectsRecipe(recipe)
	}
	if source != nil && source.protocolSource != nil {
		return validStagedMemberProtocolRecipe(recipe)
	}
	if source != nil && source.call != nil {
		return validStagedMemberCallRecipe(recipe)
	}
	if source != nil && source.getEffects != nil {
		return validStagedMemberGetEffectsRecipe(recipe)
	}
	if source != nil && source.coverage != nil {
		return validStagedMemberCoverageRecipe(recipe)
	}
	if recipe.nativeGet != nil || recipe.constructed != nil || recipe.writer != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	if source == nil || source.generation == nil || source.candidate.operation == nil || source.candidate.origin == nil || !stagedMemberFactoryObservation(source, source.candidate.cut) || recipe.key != source.request.producer || !sameOperationRequest(source.request, stagedMemberCandidateRequest(source.parent, source.candidate)) {
		return false
	}
	if source.extraction != nil && (source.extraction.generation != source.generation || !sameOperationRequest(source.extraction.request, source.parent) || source.extraction.cut != source.candidate.cut || source.extraction.delta.extracted) {
		return false
	}
	if len(recipe.delta.required) != len(recipe.writerRequired) {
		return false
	}
	for i, required := range recipe.writerRequired {
		if source.candidate.protocol || source.candidate.reflective || source.candidate.runtimeUnknown || !validWriterRHSRequirement(recipe.key, required) || !sameOperationRequest(required, stagedWriterSourceRequest(source.request, source.candidate.operation, required.producer.selector.field == "writer-callable:"+recipe.key.selector.field)) || !sameOperationRequest(required, recipe.delta.required[i]) {
			return false
		}
	}
	if source.candidate.runtimeUnknown {
		if !recipe.delta.extracted || operationDeltaSize(recipe.delta) != 1 || len(recipe.delta.residuals) != 1 || recipe.delta.residuals[0] != (sourceStagedOperationResidual{operation: source.parent.producer.operation}) {
			return false
		}
	} else if source.moduleExcluded != nil {
		proof := source.moduleExcluded
		if source.candidate.protocol && !stagedModuleProtocolReadOwned(source.parent, proof) {
			return false
		}
		if recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 || len(source.values) != 0 || !proof.supported || !proof.accounted || proof.source.generation != source.generation || proof.source.cut != source.candidate.cut || !sameOperationRequest(proof.source.request, source.parent) || source.candidate.region == nil && proof.notEntered != source.candidate.operation || source.candidate.region != nil && proof.notEntered != nil || !runtimeModuleEvaluation(source.parent.consumer) {
			return false
		}
	} else if recipe.delta.extracted || operationDeltaSize(recipe.delta) != len(source.values)+len(recipe.writerRequired) || !operationPrefix(recipe.delta.exposures, source.values, sameOperationAlternative) || !operationPrefix(source.values, recipe.delta.exposures, sameOperationAlternative) {
		return false
	}
	if source.installedCallSelection != nil {
		return installedCallSelectionFactoryParent(source, source.candidate.cut)
	}
	if source.installedMember != nil {
		return installedMemberFactoryParent(source, source.candidate.cut)
	}
	return source.parent.inputs == nil && source.parent.consumer == source.parent.producer.declaration && source.parent.producer.kind == relativeDemandEffects && sourceStagedOccurrenceOwned(source.parent.producer.operation, source.parent.producer.declaration)
}

// registerStagedMemberCandidate is called only from the current original owner
// publication. The pending source precedes argument/receiver/RHS recovery. No
// callback acceptance permits the original owner to skip those consumers yet.
func (work *callableEffectWork) registerStagedMemberCandidate(facts []callableFacts, query *sourceValueQuery, parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate) bool {
	if query == nil || query.owner == nil || query.stagedMember == nil || query.owner.generation != work.operationGeneration {
		return false
	}
	borrow := query.stagedMember
	current := borrow.current
	if !borrow.publishing || current == nil || !query.liveStagedMemberSource(borrow, borrow.get, borrow.read) || !sameStagedMemberCandidate(*current, candidate) || !sameOperationRequest(parent, candidate.request) {
		return false
	}
	if work.transferStagedFieldBodySource(facts, query, candidate) {
		return true
	}
	source := &sourceStagedMemberSource{parent: parent, candidate: candidate, generation: query.owner.generation}
	if borrow.installedCallSelection != nil {
		source.installedCallSelection = cloneInstalledCallSelectionSource(&borrow.installedCallSelection.source)
	}
	if borrow.installedMember != nil {
		source.installedMember = cloneInstalledMemberApplication(&borrow.installedMember.application)
	}
	source.request = stagedMemberCandidateRequest(parent, candidate)
	source.candidate.target = cloneSourceRelativeEndpoint(candidate.target)
	source.candidate.key = cloneSourceRelativeEndpoint(candidate.key)
	source.candidate.value = cloneSourceRelativeEndpoint(candidate.value)
	globalWrite, described := work.describeStagedGlobalWrite(facts, query, parent, candidate)
	if !described {
		return false
	}
	source.globalWrite = globalWrite
	if candidate.target.descriptorView != nil {
		if globalWrite != nil {
			return false
		}
		reading, valid := work.descriptorViewMemberReading(facts, query, candidate)
		if !valid {
			return false
		}
		source.frameworkRead = &reading // Existing conditional-view DATA subscriber.
	}
	if candidate.target.frameworkView != nil {
		if globalWrite != nil {
			return false
		}
		reading, valid := work.frameworkViewMemberReading(facts, query, candidate)
		if !valid {
			return false
		}
		source.frameworkRead = &reading
	}
	recipe := sourceStagedOperationRecipe{key: source.request.producer, memberSource: source}
	if globalWrite != nil {
		effect := environmentSource("unknown", "external global property write", facts[work.memberNodes[parent.consumer]].summary.Name)
		effect.Opaque = true
		recipe.delta.effects = []EnvironmentEffectSource{effect}
	} else if candidate.runtimeUnknown {
		recipe.delta = sourceStagedOperationDelta{extracted: true, residuals: []sourceStagedOperationResidual{{operation: parent.producer.operation}}}
		if source.frameworkRead != nil {
			recipe.delta.required = []sourceStagedOperationRequest{*source.frameworkRead}
		}
	}
	if !validStagedMemberRecipe(recipe) {
		return false
	}
	accepted := false
	if prior, found := work.operationRecipes[recipe.key]; found {
		accepted = validStagedMemberRecipe(prior) && prior.memberSource.generation == source.generation && sameOperationRequest(prior.memberSource.request, source.request) && sameStagedMemberCandidate(prior.memberSource.candidate, candidate)
		if source.globalWrite != nil || prior.memberSource.globalWrite != nil {
			accepted = accepted && sameStagedGlobalWrite(prior.memberSource.globalWrite, source.globalWrite) && operationDeltaPrefix(prior.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, prior.delta)
		}
	} else {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if accepted && source.globalWrite != nil {
		accepted = work.recordStagedGlobalWrite(facts, query, recipe.key)
	}
	if accepted {
		work.registerHasFreshTarget(facts, query, recipe.key)
	}
	required := source.request
	if accepted && !candidate.protocol && !candidate.reflective && !candidate.runtimeUnknown && plainStagedAssignment(candidate.operation) {
		effects := *source
		effects.writeEffects = true
		effects.request = stagedMemberWriterEffectsRequest(parent, candidate)
		effectRecipe := sourceStagedOperationRecipe{key: effects.request.producer, memberSource: &effects}
		if prior, found := work.operationRecipes[effectRecipe.key]; found {
			accepted = validStagedMemberRecipe(prior) && sameStagedMemberSource(prior.memberSource, &effects)
		} else {
			accepted = work.registerOperationRecipe(facts, effectRecipe)
		}
		required = effects.request
	}
	if accepted {
		found := false
		for _, prior := range borrow.required {
			found = found || sameOperationRequest(prior, required)
		}
		if !found {
			borrow.required = append(borrow.required, required)
			// Reached terminals can follow indexed discovery. The current
			// source-set owner must retain that semantic child as well.
			if c := borrow.coverage; c != nil && c.origin == candidate.origin && c.cut == candidate.cut && c.generation == borrow.generation {
				c.required = append(c.required, required)
			}
		}
	}
	return accepted
}

// beginStagedMemberWork connects the same original semantic owner to native
// callee and ordinary Get/Set source consumers. Registration is passive until a
// consumer adopts its source relationship. Unsupported activation stays pending.
func (work *callableEffectWork) beginStagedMemberWork(query *sourceValueQuery, facts []callableFacts, parent sourceStagedOperationRequest) (func(), bool) {
	return work.beginStagedMemberWorkAtEntry(query, facts, parent, nil)
}

func (work *callableEffectWork) beginStagedMemberWorkAtEntry(query *sourceValueQuery, facts []callableFacts, parent sourceStagedOperationRequest, entry *sourceStagedNativeEntryAcquisition) (func(), bool) {
	if work.purpose == callableMayEffects {
		return func() {}, false
	}
	if query == nil || query.owner == nil || query.owner.generation == nil {
		return func() {}, false
	}
	if work.operationGeneration != nil && work.operationGeneration != query.owner.generation {
		return func() {}, false
	}
	work.operationGeneration = query.owner.generation
	begin := query.beginStagedMemberSource
	if entry != nil {
		begin = func(request sourceStagedOperationRequest, publish func(sourceStagedMemberCandidate) bool, finish func(sourceStagedMemberDisposition) bool) (func(), bool) {
			if !entry.live(query) || entry.get == nil || !sameOperationRequest(request, entry.native.getRequest) {
				return func() {}, false
			}
			return query.installStagedMemberSource(request, publish, finish, entry)
		}
	}
	revoke, installed := begin(parent, func(candidate sourceStagedMemberCandidate) bool {
		return work.registerStagedMemberCandidate(facts, query, parent, candidate)
	}, func(receipt sourceStagedMemberDisposition) bool {
		// Publish the original source prefix before a stronger consumer may yield.
		// Passive metadata alone cannot take ownership of an enum operation.
		if !work.registerStagedMemberDisposition(facts, query, receipt) {
			return false
		}
		if query.stagedMember.publication == stagedMemberSourceRequest {
			return true // The authenticated source owner adopted its exact C debt.
		}
		if query.stagedMap != nil {
			if query.stagedMap.reading {
				accepted := work.admitStagedMapEntryMemberSources(facts, query)
				if accepted && query.stagedMember.publication == stagedMemberFinalObservation {
					work.recordImplicitMapCoverage(facts, query, query.stagedMap.get)
				}
				return accepted
			}
			if !work.admitStagedMapMemberSources(facts, query) {
				return false
			}
			if query.stagedMember.publication == stagedMemberFinalObservation {
				work.recordImplicitMapCoverage(facts, query, query.stagedMap.get)
			}
			source := query.stagedMap.source
			id, required := work.operationIDs[stagedMapProtocolPhaseRequest(source, "own-writers").producer]
			accepted := required && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations)
			if accepted && query.stagedMember.publication == stagedMemberFinalObservation && query.stagedMap.memberRequest != nil {
				query.stagedMap.memberRequest.observeFinal()
			}
			return accepted
		}
		if query.stagedFieldGet != nil {
			accepted := work.admitStagedFieldMemberSources(facts, query)
			if accepted && query.stagedMember.publication == stagedMemberFinalObservation && query.stagedFieldGet.memberRequest != nil {
				query.stagedFieldGet.memberRequest.observeFinal()
			}
			return accepted
		}
		return true
	})
	if installed {
		// Spelling limits callback installation only. Actual descriptor DATA,
		// original Get/cut and live-source validation still own every transfer.
		operation := parent.producer.operation
		if ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation) {
			_, field := accessorReceiver(operation)
			if field == "value" || field == "get" || field == "set" {
				strongBorrow := query.stagedMember
				query.stagedMember.descriptorStrongRead = func(view sourceNativeDescriptorView, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) bool {
					if query.stagedMember != strongBorrow || strongBorrow.issuer != query {
						return false
					}
					return work.publishDescriptorStrongRead(facts, query, view, get, cut, mode, bindings, result)
				}
				query.stagedMember.descriptorRecordGet = func(view sourceNativeDescriptorView, get *sourceGetInputs, cut *sourceMemberWriterReadCut, bindings sourceValueBindings) bool {
					if query.stagedMember != strongBorrow || strongBorrow.issuer != query {
						return false
					}
					return work.publishDescriptorRecordGet(facts, query, view, get, cut, bindings)
				}
			}
		}
		query.stagedMember.reflectiveDisjoint = func(call *ast.Node) bool { return work.recordNativeWriterDisjoint(facts, query, call) }
		query.stagedMember.prepareNativeInputs = func() { work.prepareNativeObserverInputs(facts, query) }
		query.stagedMember.freshTargetOperation = func(operation, origin *ast.Node, get *sourceGetInputs) bool {
			return work.consumeStagedFreshTargetOperation(facts, query, operation, origin, get)
		}
		query.stagedMember.excludePrivateWriter = func(write, origin *ast.Node) bool {
			return work.consumeStagedPrivateWriterExclusion(facts, query, write, origin)
		}
		query.stagedMember.transferSetWriter = func(write, origin *ast.Node) bool {
			return work.consumeStagedSetWriterSource(facts, query, write, origin)
		}
		query.stagedMember.registerWriterSource = func(r *sourceWriterInputRequest) { work.registerWriterSource(facts, query, r) }
		query.stagedMember.writerCall = func(call *ast.Node) sourceStagedWriterCallDisposition {
			return work.consumeStagedStandardWriterCall(facts, query, call)
		}
		query.stagedMember.reflectiveTarget = func(operation *ast.Node, target sourceValue) sourceStagedReflectiveTargetTransfer {
			return work.prepareStagedReflectiveTarget(facts, query, operation, target)
		}
		query.stagedMember.yieldConstruction = func(operation *ast.Node) bool {
			return work.yieldStagedConstructionConsumer(facts, query, operation)
		}
		query.stagedMember.nativeInputCall = func(call *ast.Node) sourceStagedWriterCallDisposition {
			return work.consumeStagedNativeInputInvocation(facts, query, call)
		}
		query.stagedMember.receiverDataOwner = func(reference *sourceGetReference) bool {
			return work.memberReceiverPreparationOwner(facts, query, reference)
		}
		query.stagedMember.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
			return work.transferStagedCallResult(facts, query, call, interest)
		}
		query.stagedMember.moduleEntry = func(operation *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
			return work.consumeStagedModuleActivation(facts, query, get, cut) && work.admitStagedModuleWriterExclusion(facts, query, operation)
		}
	}
	if installed {
		revokePreparation := work.beginPlainGetPreparationIssuer(facts, query, parent)
		revokeWriters := work.beginStagedMemberWriterDelivery(query, facts)
		return func() { revokeWriters(); revokePreparation(); revoke() }, true
	}
	return revoke, installed
}

// cloneStagedMemberSource owns endpoint paths. Live publication authority is
// absent from the source recipe and must be obtained again in the next graph.
func cloneStagedMemberSource(source *sourceStagedMemberSource) *sourceStagedMemberSource {
	if source == nil {
		return nil
	}
	copy := *source
	if source.nativeFieldGet != nil {
		header := *source.nativeFieldGet
		copy.nativeFieldGet = &header
	}
	copy.originalGetMutation = cloneOriginalGetMutationSource(source.originalGetMutation)
	copy.originalGetMutationInterest = cloneOriginalGetMutationInterest(source.originalGetMutationInterest)
	copy.reflectiveContribution = cloneReflectiveContribution(source.reflectiveContribution)
	copy.descriptorStrong = cloneDescriptorStrongReader(source.descriptorStrong)
	copy.installedCallSelection = cloneInstalledCallSelectionSource(source.installedCallSelection)
	copy.installedMember = cloneInstalledMemberApplication(source.installedMember)
	if source.frameworkRead != nil {
		reading := *source.frameworkRead
		copy.frameworkRead = &reading
	}
	copy.nativeWriter = cloneNativeWriterCapability(source.nativeWriter)
	copy.globalWrite = cloneStagedGlobalWrite(source.globalWrite)
	copy.hasFreshTarget = cloneHasFreshTarget(source.hasFreshTarget)
	if source.targetSource != nil {
		t := *source.targetSource
		t.preparation = cloneReflectiveTargetPreparation(t.preparation)
		t.keySource = cloneReflectiveKey(t.keySource)
		t.resultSupport = cloneReflectiveResult(t.resultSupport)
		t.target = cloneSourceRelativeEndpoint(t.target)
		t.prototype = cloneSourceRelativeEndpoint(t.prototype)
		copy.targetSource = &t
	}
	if source.protocolSource != nil {
		p := *source.protocolSource
		p.constructedLookup = cloneConstructedLookupSource(p.constructedLookup)
		p.nativeArgument = cloneStagedNativeArgumentProtocol(p.nativeArgument)
		if p.evaluation != nil {
			e := *p.evaluation
			p.evaluation = &e
		}
		if p.get != nil {
			g := *p.get
			p.get = &g
		}
		if p.external == nil && p.evaluation == nil {
			p.required = cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{p.required}}).required[0]
		}
		copy.protocolSource = &p
	}
	if source.call != nil {
		call := *source.call
		call.values = cloneOperationDelta(sourceStagedOperationDelta{exposures: call.values}).exposures
		call.mapped = append([]bool(nil), call.mapped...)
		call.standard = append([]sourceStagedConstructedMember(nil), source.call.standard...)
		for i, branch := range source.call.standard {
			call.standard[i] = cloneConstructedMemberSource(branch)
		}
		call.storage = append([]sourceStagedMethodStorage(nil), source.call.storage...)
		for i, relation := range call.storage {
			call.storage[i] = sourceStagedMethodStorage{reader: cloneConstructedMemberSource(relation.reader), writer: cloneConstructedMemberSource(relation.writer)}
		}
		call.sourceRequest = cloneStagedMemberCallRequest(call.sourceRequest)
		copy.call = &call
	}
	if source.getPreparation != nil {
		preparation := *source.getPreparation
		preparation.native = append([]sourceStagedGetPreparationNative(nil), source.getPreparation.native...)
		preparation.data = append([]sourceStagedGetPreparationData(nil), source.getPreparation.data...)
		for i := range preparation.data {
			preparation.data[i] = cloneGetPreparationData(preparation.data[i])
		}
		preparation.targets = append([]sourceStagedGetPreparationTarget(nil), source.getPreparation.targets...)
		for i := range preparation.targets {
			preparation.targets[i].projection = append([]string(nil), preparation.targets[i].projection...)
		}
		preparation.readings = append([]sourceStagedGetPreparationReading(nil), source.getPreparation.readings...)
		copy.getPreparation = &preparation
	}
	if source.getEffects != nil {
		get := *source.getEffects
		get.descriptor = cloneDescriptorRecordGet(source.getEffects.descriptor)
		copy.getEffects = &get
	}
	if source.coverage != nil {
		coverage := *source.coverage
		coverage.installedCallSelection = cloneInstalledCallSelectionSource(source.coverage.installedCallSelection)
		coverage.installedMember = cloneInstalledMemberApplication(source.coverage.installedMember)
		coverage.required = append([]sourceStagedOperationRequest(nil), source.coverage.required...)
		coverage.fieldBodies = cloneStagedMemberFieldBodies(source.coverage.fieldBodies)
		copy.coverage = &coverage
	}
	copy.moduleExcluded = nil
	copy.moduleImports = append([]sourceStagedActivationImport(nil), source.moduleImports...)
	if source.extraction != nil {
		copyReceipt := *source.extraction
		copyReceipt.delta = cloneOperationDelta(copyReceipt.delta)
		copy.extraction = &copyReceipt
	}
	copy.values = cloneOperationDelta(sourceStagedOperationDelta{exposures: source.values}).exposures
	copy.candidate.target = cloneSourceRelativeEndpoint(source.candidate.target)
	copy.candidate.key = cloneSourceRelativeEndpoint(source.candidate.key)
	copy.candidate.value = cloneSourceRelativeEndpoint(source.candidate.value)
	return &copy
}

func sameStagedMemberCandidate(a, b sourceStagedMemberCandidate) bool {
	return sameOperationRequest(a.request, b.request) && a.operation == b.operation && a.region == b.region && a.origin == b.origin && a.reflective == b.reflective && a.protocol == b.protocol && a.invoking == b.invoking && a.getContribution == b.getContribution && a.prior == b.prior && a.runtimeUnknown == b.runtimeUnknown && a.cut == b.cut && sameOperationEndpoint(a.target, b.target) && sameOperationEndpoint(a.key, b.key) && sameOperationEndpoint(a.value, b.value)
}

// sourceStagedMemberRequirement belongs to this graph. It retains the original
// current-work association, independently of the detached candidate descriptor.
// A summary is required source extraction, not invocation at the reader.
type sourceStagedMemberRequirement struct {
	call     sourceStagedDeclarationCall
	producer int
	edge     string
}

// prepareStagedMemberActivation consumes the existing original Call associations
// after registration, without rediscovering a closure or replaying its binder.
// Known stored values stay dormant. Missing indirect/prior-call coverage remains
// pending rather than becoming an external unknown or inactive-writer claim.
func (work *callableEffectWork) prepareStagedMemberActivation(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	state := &work.operations[id.index]
	beforeRequirements := len(state.memberActivations)
	source := work.operationRecipes[state.key].memberSource
	if source == nil || source.descriptorStrong != nil || source.writeEffects || source.generation != owner.values.generation || source.candidate.runtimeUnknown || source.coverage != nil || source.call != nil || source.getEffects != nil || source.moduleExcluded != nil || source.extraction == nil || source.protocolSource != nil {
		return false
	}
	// An original live writer publication owns these RHS dependencies. Do not
	// reconstruct the same creating/input projection through the older candidate
	// adapter, including after clone when fresh invocation inputs are still due.
	if len(work.operationRecipes[state.key].writerRequired) != 0 {
		return false
	}
	roles, described := describeStagedMemberSourceRoles(source.candidate, owner)
	if !described {
		return false
	}
	associations := []sourceStagedDeclarationCall{}
	for i := range facts {
		for _, call := range facts[i].staged.calls {
			if call.invocation.declaration == source.candidate.region {
				associations = append(associations, call)
			}
		}
	}
	activation := describeStagedMemberActivation(source.candidate.operation, source.candidate.cut, owner, associations...)
	values := append([]sourceStagedOperationAlternative(nil), source.values...)
	appendValues := func(read sourceStagedWriterRead) {
		projected := describeStagedWriterProjection(read)
		for _, alternative := range projected.delta.exposures {
			present := false
			for _, prior := range values {
				present = present || sameOperationAlternative(prior, alternative)
			}
			if !present {
				values = append(values, alternative)
			}
		}
	}
	// Only the original assignment channel has a stored RHS. Reflective Calls
	// retain the independently issued algorithm/descriptor source requirements.
	if source.candidate.reflective || source.candidate.protocol {
		return false
	}
	for _, candidate := range activation.candidates {
		if !candidate.delivered && !candidate.sourceDescribed {
			continue
		}
		var current *sourceStagedDeclarationCall
		for i := range associations {
			association := &associations[i]
			if association.invocation.operation == candidate.creating.expression && validStagedMemberActivationCall(*association, activation.region, candidate.creating.expression) {
				current = association
				break
			}
		}
		if current == nil {
			continue
		}
		// Structural copies returned by the pure mapper have no graph authority.
		// Consume only the exact association still installed on current work facts.
		authentic := false
		for i := range facts {
			for j := range facts[i].staged.calls {
				call := &facts[i].staged.calls[j]
				if call.invocation.operation == current.invocation.operation && call.inputs == current.inputs && call.sourceInputs == current.sourceInputs && sameSourceRelativeInvocation(call.invocation, current.invocation) {
					authentic = true
				}
			}
		}
		if !authentic {
			continue
		}
		target, known := work.memberNodes[activation.region]
		if !known {
			continue
		}
		edge := fmt.Sprintf("%s:activation:%d", source.request.edge, candidate.creating.expression.Pos())
		registered := false
		for _, requirement := range state.memberActivations {
			registered = registered || requirement.edge == edge
		}
		if !registered {
			work.requireStagedSummary(facts, work.memberNodes[source.request.consumer], target, edge, source.parent.producer.operation, source.parent.cut)
			state.memberActivations = append(state.memberActivations, sourceStagedMemberRequirement{call: *current, producer: target, edge: edge})
		}
		read := sourceStagedWriterRead{write: source.candidate.operation, region: activation.region, call: candidate.creating.expression, origin: source.candidate.origin, get: source.parent.producer.operation, observation: source.candidate.cut, invocation: candidate.invocation, bound: candidate.bound, value: cloneSourceRelativeEndpoint(source.candidate.value)}
		read.value.creation = read.call
		if roles.value.kind == memberFormal {
			mapped, valid := describeStagedMemberBoundRoles(source.candidate, roles, read.bound, owner)
			if !valid {
				continue
			}
			read.rhs = mapped.value
		} else {
			read.rhs = describeStagedWriterStoredRHS(read.value.expression, read.region, read.bound, owner.values)
		}
		appendValues(read)
	}
	if len(values) == len(source.values) {
		return beforeRequirements != len(state.memberActivations)
	}
	attached := *source
	attached.values = cloneOperationDelta(sourceStagedOperationDelta{exposures: values}).exposures
	recipe := work.operationRecipes[state.key]
	recipe.memberSource = &attached
	recipe.delta.exposures = attached.values
	return work.attachOperationSource(facts, recipe)
}

func sameStagedMemberSource(a, b *sourceStagedMemberSource) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && (a.nativeFieldGet == b.nativeFieldGet || a.nativeFieldGet != nil && b.nativeFieldGet != nil && *a.nativeFieldGet == *b.nativeFieldGet) && sameExternalGetPreparation(a, b) && sameGetPreparation(a.getPreparation, b.getPreparation) && (a.getEffects == nil || b.getEffects != nil && sameOperationRequest(a.getEffects.preparation, b.getEffects.preparation)) && sameConstructedLookupProtocol(a, b) && stagedMemberCoverageBodyRefinement(a.coverage, b.coverage) && originalGetMutationInterestRefinementAllowed(a.originalGetMutationInterest, b.originalGetMutationInterest) && originalGetMutationRefinementAllowed(a.originalGetMutation, b.originalGetMutation) && (a.reflectiveContribution == nil || sameReflectiveContribution(a.reflectiveContribution, b.reflectiveContribution)) && sameDescriptorStrongReader(a.descriptorStrong, b.descriptorStrong) && (a.getEffects == nil || b.getEffects != nil && sameDescriptorRecordGet(a.getEffects.descriptor, b.getEffects.descriptor)) && sameInstalledCallSelectionSource(a.installedCallSelection, b.installedCallSelection) && sameInstalledMemberApplication(a.installedMember, b.installedMember) && sameFrameworkViewReading(a.frameworkRead, b.frameworkRead) && (a.nativeWriter == nil || sameNativeWriterCapability(a.nativeWriter, b.nativeWriter)) && sameStagedGlobalWrite(a.globalWrite, b.globalWrite) && a.writeEffects == b.writeEffects && (a.hasFreshTarget == nil || sameHasFreshTarget(a.hasFreshTarget, b.hasFreshTarget)) && (a.protocolSource == nil || a.protocolSource.nativeArgument == nil || b.protocolSource != nil && sameStagedNativeArgumentProtocol(a.protocolSource.nativeArgument, b.protocolSource.nativeArgument)) && (a.coverage == nil || b.coverage == nil || a.coverage.nativeObserver == b.coverage.nativeObserver) && (a.targetSource == nil || b.targetSource == nil || sameStagedReflectiveTarget(a.targetSource, b.targetSource)) && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.parent, b.parent) && (sameStagedMemberCandidate(a.candidate, b.candidate) || sameRequestedMemberCallSource(a, b))
}

// refreshStagedMemberActivations observes late original graph associations.
// The owning work phase supplies its existing executable owner synchronously.
func (work *callableEffectWork) refreshStagedMemberActivations(facts []callableFacts, owner *executableBodyOwner) bool {
	changed := work.refreshStagedEvaluations(facts, owner)
	if owner == nil || work.operationGeneration != owner.values.generation {
		return false
	}
	for i := 1; i < len(work.operations); i++ {
		recipe := work.operationRecipes[work.operations[i].key]
		if recipe.installedCall != nil {
			changed = work.queueInstalledCallRefresh(sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(i)}) || changed
			continue
		}
		if recipe.declarationCall != nil {
			// Source registration can precede real propagation revisions. Reuse
			// the original body consumer after those revisions become available.
			consumer := work.memberNodes[recipe.key.declaration]
			before := facts[consumer].staged.revisionDeliveries
			work.prepareStagedDeclarationCallEffects(facts, work.operationIDs[recipe.key])
			changed = changed || before != facts[consumer].staged.revisionDeliveries
			continue
		}
		source := recipe.memberSource
		if source == nil || source.candidate.runtimeUnknown {
			continue
		}
		id := sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(i)}
		changed = work.prepareStagedMemberProtocol(facts, id, owner) || changed
		changed = work.prepareStagedMemberActivation(facts, id, owner) || changed
		for _, requirement := range work.operations[i].memberActivations {
			if requirement.producer < len(work.stagedRevisions) && facts[requirement.producer].staged.ready {
				work.observeStagedSummary(facts, work.memberNodes[source.request.consumer], requirement.producer, requirement.edge)
			}
		}
	}
	return changed
}

// applyStagedMemberDataDelivery preserves a dormant prefix on the exact source
// subscriber. It cannot issue invocation or turn a stored callable into Effects.
func (work *callableEffectWork) applyStagedMemberDataDelivery(use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	recipe := work.operationRecipes[use.request.producer]
	if recipe.memberSource == nil || recipe.memberSource.candidate.runtimeUnknown || use.call != nil || use.installed != nil || !sameOperationRequest(use.request, recipe.memberSource.request) || len(delta.invoked)+len(delta.relative)+len(delta.effects)+len(delta.residuals) != 0 {
		return false
	}
	id, known := work.operationIDs[use.request.producer]
	if !known {
		return false
	}
	subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{use.request.consumer, use.request.edge}]
	if subscriber == nil {
		return false
	}
	for _, value := range delta.exposures {
		found := false
		for _, prior := range subscriber.constructed {
			found = found || sameOperationAlternative(prior, value)
		}
		if !found {
			subscriber.constructed = append(subscriber.constructed, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{value}}).exposures[0])
		}
	}
	return true
}

// registerStagedMemberDisposition consumes the exact original owner's end event.
// It seals indexed extraction provenance on the registered candidates, while
// leaving aggregate activation/source completion explicitly unextracted.
func (work *callableEffectWork) registerStagedMemberDisposition(facts []callableFacts, q *sourceValueQuery, receipt sourceStagedMemberDisposition) bool {
	if q == nil || q.stagedMember == nil {
		return false
	}
	b := q.stagedMember
	current := b.disposition
	if current == nil || !q.liveStagedMemberSource(b, b.get, b.read) || current.generation != work.operationGeneration || receipt.generation != current.generation || receipt.cut != current.cut || receipt.indexed != current.indexed || receipt.mode != current.mode || receipt.delta.extracted || !sameOperationRequest(receipt.request, current.request) || !operationDeltaPrefix(receipt.delta, current.delta) || !operationDeltaPrefix(current.delta, receipt.delta) {
		return false
	}
	if b.publication == stagedMemberSourceRequest {
		return work.registerStagedMemberRequest(facts, q, receipt)
	}
	return work.registerStagedMemberObservation(facts, q, receipt)
}

// registerStagedMemberObservation consumes the original source observation;
// pending map requests cannot enter this path as already-sealed observations.
func (work *callableEffectWork) registerStagedMemberObservation(facts []callableFacts, q *sourceValueQuery, receipt sourceStagedMemberDisposition) bool {
	b := q.stagedMember
	current := b.disposition
	for _, required := range current.delta.required {
		if required.producer.kind == relativeDemandDirectExposure {
			if !work.stagedMemberResultReading(required, current.request, current.cut) {
				return false
			}
			continue
		}
		if work.stagedMemberCallReading(required, current.request, current.cut) {
			continue
		}
		if q.stagedFieldBodySource(required) {
			continue
		}
		prior, known := work.operationRecipes[required.producer]
		if !known || prior.memberSource == nil || !sameOperationRequest(prior.memberSource.parent, current.request) || !sameOperationRequest(prior.memberSource.request, required) || prior.memberSource.candidate.cut != current.cut {
			return false
		}
	}
	for _, required := range current.delta.required {
		if required.producer.kind == relativeDemandDirectExposure || q.stagedFieldBodySource(required) || work.stagedMemberCallReading(required, current.request, current.cut) {
			continue
		}
		prior := work.operationRecipes[required.producer]
		source := *prior.memberSource
		detached := *current
		detached.delta = cloneOperationDelta(current.delta)
		source.extraction = &detached
		prior.memberSource = &source
		if !work.attachOperationSource(facts, prior) {
			return false
		}
		if b.externalGet != nil && source.candidate.protocol && ast.IsPropertyAccessExpression(source.candidate.operation) {
			if caller, known := work.memberNodes[source.candidate.region]; known {
				work.prepareStagedConstructedGetEffectsSource(facts, caller, source.candidate.operation, q.executable)
			}
		}
		if b.externalGet != nil && source.candidate.protocol && ast.IsCallExpression(source.candidate.operation) && ast.IsPropertyAccessExpression(source.candidate.operation.Expression()) {
			caller, known := work.memberNodes[source.candidate.region]
			root := work.operationRecipes[sourceStagedOperationKey{declaration: source.candidate.region, operation: source.candidate.operation, kind: relativeDemandEffects}]
			if known && len(root.constructedGroup) == 0 {
				work.prepareConstructedResultSource(facts, caller, source.candidate.operation, q.executable)
			}
		}
		// The original reflective installation reader owns its distinct SOURCE
		// relation. Protocol/activation fallback keeps its existing domain.
		if source.candidate.reflective {
			work.registerReflectiveContribution(facts, q, prior.key)
		}
		if !work.attachStagedExternalGetContext(facts, prior.key, b.externalGet) {
			work.attachStagedMemberProtocol(facts, prior.key)
		}
		if source.writeEffects {
			rawKey := stagedMemberCandidateRequest(source.parent, source.candidate).producer
			raw := work.operationRecipes[rawKey]
			if raw.memberSource == nil || raw.memberSource.writeEffects || !sameStagedMemberCandidate(raw.memberSource.candidate, source.candidate) {
				return false
			}
			data := *raw.memberSource
			data.extraction = &detached
			if source.moduleExcluded != nil {
				data.moduleExcluded = source.moduleExcluded
				data.moduleImports = append([]sourceStagedActivationImport(nil), source.moduleImports...)
			}
			raw.memberSource = &data
			if !work.attachOperationSource(facts, raw) {
				return false
			}
		}
	}
	work.excludeStagedPrivateAllocationWriters(facts, q)
	work.refineStagedExternalGetSelfCalls(q)
	if !work.publishStagedMemberCoverage(facts, q) {
		return false
	}
	if b.externalGet != nil {
		return work.publishStagedMemberExternalGet(facts, q)
	}
	return true
}

func validStagedMemberObservation(parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	root := parent.producer.operation
	if root == nil || cut.operation == nil || cut.reading != cut.operation {
		return false
	}
	if cut.operation == root {
		return true
	}
	return (ast.IsCallExpression(root) || ast.IsNewExpression(root)) && nodeInside(cut.operation, root.Expression())
}
