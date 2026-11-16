package exactcompiler

import (
	"fmt"
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type sourceStagedOperationConsumer struct {
	consumer *ast.Node
	edge     string
}
type sourceStagedOperationSubscriber struct {
	readWrites          []sourceQualifiedReadWrite         // Actually consumed conditional source effects, graph-local only.
	writerSourceParents []sourceStagedOperationID          // Exact source tasks waiting on this applied prerequisite.
	nativeInputObserved uint64                             // Graph-local original observer refresh, not Call completion.
	returned            []sourceStagedOperationAlternative // graph-local dormant return-source data
	request             sourceStagedOperationRequest
	consumed            uint64
	cursor              sourceStagedOperationCursor
	applied             uint64
	blocked             bool
	constructed         []sourceStagedOperationAlternative // graph-local demanded data prefix, never a callable activation
}

// sourceStagedOperationState belongs to one callableEffectWork graph. Sealed
// recipes survive cloning, but these IDs, subscribers and cursors do not.
type sourceStagedOperationState struct {
	installedCallObserved       *sourceInstalledCallObservation              // original source event, graph-local only
	installedMemberObserved     *sourceInstalledMemberObservation            // live graph only; clone leaves nil
	descriptorEnumeration       *sourceDescriptorEffectsEnumeration          // Original once-only source publication; no query/input frame.
	installationMutations       *sourceNativeInstallationMutationEnumeration // Actual selected installation output components, not a value/current token.
	descriptorMutations         *sourceDescriptorMutationEnumeration         // Original conditional mutation SOURCE description; no current token.
	frameworkGetObservation     *sourceFrameworkGetObservation               // Graph-local genuine Get observation; never cloned.
	descriptorTargetObservation *sourceDescriptorTargetObservation
	descriptorTargetAttempt     []sourceDescriptorTargetRevision // Fresh original selected event; never cloned.

	// Canonical SOURCE scheduler state is graph-local and carries no proof.
	nativeScopeAttemptDemands []sourceStagedNativeProjectionDemand
	nativeScopeEnrolling      bool
	freezeReturnObserved      *sourceStagedFreezeReturnObservation  // Actual current graph finishing/input event, never a cloned description.
	implicitField             *sourceStagedImplicitFieldObservation // Original primitive/final-C events only; no current capability.
	implicitMap               *sourceStagedImplicitProtocolPhase    // Original OwnKeys/accepted-DATA and final-C events; no empty-set authority.
	targetResultObserved      uint64                                // Graph-local consumed genuine creator Get revision; never cloned.
	moduleArgumentRunning     bool                                  // Ephemeral source-task entry; never cloned.
	writerSourceRunning       bool
	nativeEffectsObserved     []uint64                                         // Successful original Effects-owned Get prerequisite vector; graph-local only.
	getPreparationDataReads   []*sourceStagedGetPreparationDataReadObservation // Normal original read intervals; never completion stamps.
	getPreparationObserved    *sourceStagedGetPreparationObservation           // Actual graph-local preparation SOURCE readset.
	nativeScopeObserved       *sourceStagedNativeScopeObservation              // Actual SOURCE-only Get event; never cloned with descriptions.
	writerSourceRevisions     []uint64                                         // Last locally consumed prerequisite revisions, never a semantic receipt.
	mutationBodyRetry         *sourceFieldMutationBodyRetry                    // Scheduling-only actual BODY snapshots, absent from cloned source recipes.
	assignment                *sourceStagedAssignmentState
	hasInstance               *sourceStagedHasInstanceState // Live operator receipt expires with this graph.
	nativeMemberEffects       *sourceStagedNativeMemberEffects
	memberCoverageObserved    bool
	resultBody                *sourceStagedCallResultBody
	// Symbolic source projection is graph-local and reused only for the exact
	// retained creating packet. Clones rebuild it without acquired scopes.
	resultProjection      *sourceStagedReturnBindingPlan
	resultInputs          *sourceRelativeInputEdge
	resultSourceInputs    *sourceStagedInputSubstitution
	resultSourceRequested bool
	// Bound framework input MAY is graph-local. It preserves sourceInputs;
	// neither a normal input frame nor an invocation/output receipt is cached.
	frameworkInputsRequested  bool
	frameworkInputsComplete   bool
	frameworkInputActivations []sourceStagedMemberRequirement
	memberActivations         []sourceStagedMemberRequirement
	moduleInputs              []sourceStagedModuleRequirement
	writerMethods             []sourceStagedWriterInvocation
	writerProjectionSeen      bool
	mapSourceObserved         bool
	mapSourceRequested        bool

	key                          sourceStagedOperationKey
	delta                        sourceStagedOperationDelta
	revision                     uint64
	deliveryQueued               bool
	nativeTarget                 *sourceStagedNativeTargetEffects
	targetSourceRequested        bool
	targetNativeObservedRevision uint64
	nativeCallee                 *sourceStagedNativeCalleeEffects
	calleeSourceRequested        bool
	eagerRegistered              bool
	eagerCalls                   []sourceStagedEagerRequirement
	dependencies                 []sourceStagedOperationDependency
	dependenciesRegistered       bool
	invalid                      bool
	effectsDemand                *sourceStagedFieldEffectsDemand
	fieldValueReady              [2]bool                       // Current original Get owns independent direct-source dispositions.
	fieldOwnData                 sourceRelativeEndpoint        // graph-local original own-data Get association
	fieldDisposition             *sourceStagedFieldDisposition // detached source-owner status, not empty-delta coverage
	getterRequirementsRegistered bool
	getterSourceRequested        bool
	getters                      []sourceStagedGetterRequirement
	subscriberOrder              []sourceStagedOperationConsumer
	subscribers                  map[sourceStagedOperationConsumer]*sourceStagedOperationSubscriber
}

// indexCallableFactNodes establishes the canonical fact lookup without
// registering operation recipes, observations, or propagation revisions.
func (work *callableEffectWork) indexCallableFactNodes(facts []callableFacts) {
	if work.memberNodes == nil {
		work.memberNodes = make(map[*ast.Node]int, len(facts))
		for index := range facts {
			work.memberNodes[facts[index].node] = index
		}
	}
}

func (work *callableEffectWork) indexOperationSources(facts []callableFacts) {
	if work.operationFacts == nil {
		work.operationFacts = facts
	}
	work.indexCallableFactNodes(facts)
	if work.operationRecipes == nil {
		work.operationRecipes = make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
		for _, fact := range facts {
			for _, recipe := range fact.staged.operationRecipes {
				if validOperationEnvelope(recipe) {
					work.operationRecipes[recipe.key] = recipe
					work.indexNativeInstallation(recipe)
					work.indexStagedMemberProtocolSource(recipe)
				}
			}
		}
		for _, fact := range facts {
			for _, use := range fact.staged.operationUses {
				work.indexStagedMemberProtocolUse(use)
			}
		}
	}
}

// registerOperationRecipe seals source metadata without scheduling or activating
// its value. Lazy exposure therefore need not execute a returned/stored body.
func (work *callableEffectWork) registerOperationRecipe(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	work.indexOperationSources(facts)
	producer, ok := work.memberNodes[recipe.key.declaration]
	if !ok || !validOperationEnvelope(recipe) || recipe.key.operation == nil || facts[producer].sourceFile != ast.GetSourceFileOfNode(recipe.key.operation) {
		return false
	}
	if existing, exists := work.operationRecipes[recipe.key]; exists {
		return operationPrefix(existing.fieldMutationLinks, recipe.fieldMutationLinks, sameOriginalGetMutationFieldLink) && operationPrefix(recipe.fieldMutationLinks, existing.fieldMutationLinks, sameOriginalGetMutationFieldLink) && sameFieldMutationData(existing.mutationData, recipe.mutationData) && sameInstalledMutationRHS(existing.installedMutationRHS, recipe.installedMutationRHS) && sameDescriptorTargetSource(existing.descriptorTarget, recipe.descriptorTarget) && sameInstalledCallPhase(existing.installedCall, recipe.installedCall) && sameInstalledMemberApplication(existing.installedMember, recipe.installedMember) && sameDescriptorSource(existing.descriptorSource, recipe.descriptorSource) && sameFrameworkStorageView(existing.frameworkEffects, recipe.frameworkEffects) && sameStagedModuleArgumentSource(existing.moduleArgument, recipe.moduleArgument) && sameStagedDeclarationCall(existing.declarationCall, recipe.declarationCall) && existing.declarationCallGeneration == recipe.declarationCallGeneration && sameStagedConstructionEffects(existing.constructionEffects, recipe.constructionEffects) && sameStagedAssignment(existing.assignment, recipe.assignment) && sameStagedHasInstanceSource(existing.hasInstance, recipe.hasInstance) && sameStagedCallResultSource(existing.callResult, recipe.callResult) && sameStagedMemberSource(existing.memberSource, recipe.memberSource) && operationPrefix(existing.constructedGroup, recipe.constructedGroup, func(a, b sourceStagedConstructedMember) bool { return sameConstructedMemberSource(&a, &b) }) && operationPrefix(recipe.constructedGroup, existing.constructedGroup, func(a, b sourceStagedConstructedMember) bool { return sameConstructedMemberSource(&a, &b) }) && sameConstructedMemberSource(existing.constructed, recipe.constructed) && existing.getter == recipe.getter && existing.returning == recipe.returning && sameNativeGetSource(existing.nativeGet, recipe.nativeGet) && operationPrefix(existing.fieldForwards, recipe.fieldForwards, sameStagedFieldForward) && operationPrefix(recipe.fieldForwards, existing.fieldForwards, sameStagedFieldForward) && operationDeltaPrefix(existing.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, existing.delta)
	} else {
		recipe.delta = cloneOperationDelta(recipe.delta)
		work.operationRecipes[recipe.key] = recipe
		work.indexStagedMemberProtocolSource(recipe)
		facts[producer].staged.operationRecipes = append(facts[producer].staged.operationRecipes, recipe)
	}
	return true
}

func (work *callableEffectWork) registerOperationUse(facts []callableFacts, use sourceStagedOperationUse) bool {
	work.indexOperationSources(facts)
	if source := work.operationRecipes[use.request.producer].nativeGet; source != nil && source.inputInvocation != nil && (use.call != nil || use.installed != nil) {
		return false
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.installedMember != nil && (use.call != nil || use.installed != nil || !validInstalledMemberReading(recipe, use.request)) {
		return false
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.declarationCall != nil && (use.call != nil || use.installed != nil) {
		return false
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.callResult != nil && (use.call != nil || use.installed != nil) {
		return false
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.memberSource != nil && (use.call != nil || use.installed != nil) {
		return false
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.nativeGet != nil && recipe.key.kind == relativeDemandDirectExposure && (use.installed == nil || use.call != nil || use.request.reading == (sourceStagedOperationKey{})) {
		return false // Other value/Call consumers need their own source handoff.
	}
	if _, ok := work.requireOperation(facts, use.request); !ok {
		return false
	}
	work.indexStagedMemberProtocolUse(use)
	consumer := work.memberNodes[use.request.consumer]
	for _, prior := range facts[consumer].staged.operationUses {
		if prior.request.edge == use.request.edge {
			sameInstalled := prior.installed == nil && use.installed == nil || prior.installed != nil && use.installed != nil && prior.installed.cut == use.installed.cut && sameOperationEndpoint(prior.installed.receiver, use.installed.receiver)
			return sameOperationRequest(prior.request, use.request) && prior.call == use.call && sameInstalled
		}
	}
	facts[consumer].staged.operationUses = append(facts[consumer].staged.operationUses, use)
	return true
}

// initializeOperationIdentity establishes this graph's one identity and empty
// storage before a live source interval can retain a pre-adoption observation.
// It issues no operation ID, subscriber, task, semantic receipt or delivery.
// Adoption retains its existing validation and uses this same epoch; a clone's
// new work initializes an independent identity when its own source owner begins.
func (work *callableEffectWork) initializeOperationIdentity() {
	if work.operationEpoch == nil {
		work.operationEpoch = &sourceStagedOperationEpoch{}
		work.operationIDs = make(map[sourceStagedOperationKey]sourceStagedOperationID)
		work.operations = []sourceStagedOperationState{{}}
	}
}

// requireOperation inserts required membership before yielding. Source recipes
// and sealed creating associations authenticate only these supported requests.
// No output, identity, normal completion, descriptor or NoWrites authority flows.
func (work *callableEffectWork) requireOperation(facts []callableFacts, request sourceStagedOperationRequest) (sourceStagedOperationID, bool) {
	key := request.producer
	if key.operation == nil || key.declaration == nil || request.consumer == nil || request.use == nil || request.edge == "" || !sourceStagedOccurrenceOwned(key.operation, key.declaration) {
		return sourceStagedOperationID{}, false
	}
	work.indexOperationSources(facts)
	recipe, registered := work.operationRecipes[key]
	producer, owned := work.memberNodes[key.declaration]
	consumer, using := work.memberNodes[request.consumer]
	original := sourceRelativeCut{operation: key.operation, use: key.operation, reading: key.operation}
	if !registered || !owned || !using || request.cut != original && !work.acceptedStandardMemberCallReading(request) && !work.describedNativeInputInvocationReading(request) && !work.acceptedGetPreparationSourceReading(request) && !work.validInstalledMemberSourceReading(recipe, request) && !validInstalledMutationRHSReading(recipe, request) && !work.validOriginalGetMutationReading(recipe, request) && !work.validOriginalGetMutationInterestReading(recipe, request) && !work.validFieldMutationDataReading(recipe, request) || facts[producer].sourceFile != ast.GetSourceFileOfNode(key.operation) {
		return sourceStagedOperationID{}, false
	}
	if recipe.mutationData != nil {
		if !work.validFieldMutationDataReading(recipe, request) || recipe.mutationData.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.installedMutationRHS != nil {
		if !validInstalledMutationRHSReading(recipe, request) || recipe.installedMutationRHS.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.installedCall != nil {
		if !validInstalledCallPhase(recipe) || !sameOperationRequest(recipe.installedCall.request, request) || recipe.installedCall.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.installedMember != nil {
		if !work.validInstalledMemberSourceReading(recipe, request) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.frameworkEffects != nil {
		if !validStagedFrameworkEffectsRecipe(recipe) || recipe.frameworkEffects.generation != work.operationGeneration || !sameOperationRequest(request, stagedFrameworkEffectsRequest(key.operation, key.declaration)) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.moduleArgument != nil {
		if !validStagedModuleArgumentRecipe(recipe) || recipe.moduleArgument.generation != work.operationGeneration || !work.validModuleArgumentReading(recipe, request) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.declarationCall != nil {
		if !validStagedDeclarationCallEffectsRecipe(recipe) || recipe.declarationCallGeneration != work.operationGeneration || !sameOperationRequest(request, stagedDeclarationCallEffectsRequest(key.operation, key.declaration)) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.entryLaw != nil {
		if !validStagedEntryLawRecipe(recipe) || !sameOperationRequest(request, recipe.entryLaw.request) && !work.validHasFreshTargetReading(recipe, request) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.constructionEffects != nil {
		if !validStagedConstructionEffectsRecipe(recipe) || !work.constructionRequiredSourcesCurrent(recipe, true) || !sameOperationRequest(request, recipe.constructionEffects.request) || recipe.constructionEffects.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.assignment != nil {
		if !validStagedAssignmentRecipe(recipe) || !sameOperationRequest(request, recipe.assignment.request) || recipe.assignment.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.hasInstance != nil {
		if !validStagedHasInstanceRecipe(recipe) || !sameOperationRequest(request, recipe.hasInstance.request) || recipe.hasInstance.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.descriptorTarget != nil {
		if !validDescriptorTargetRecipe(recipe) || !sameOperationRequest(request, recipe.descriptorTarget.request) || recipe.descriptorTarget.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.descriptorSource != nil {
		if !validDescriptorSourceRecipe(recipe) || !sameOperationRequest(request, recipe.descriptorSource.request) || recipe.descriptorSource.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.callResult != nil {
		if !acceptedStagedCallResultRequest(recipe.callResult, request) || !validStagedCallResultRecipe(recipe) || recipe.callResult.generation != work.operationGeneration {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.memberSource != nil {
		if !validStagedMemberRecipe(recipe) || work.operationGeneration != nil && recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(request, recipe.memberSource.request) && !work.acceptedStandardMemberCallReading(request) && !work.acceptedStagedReflectiveTargetReading(request) && !work.acceptedGetPreparationSourceReading(request) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.mapEntry != nil {
		if !validStagedMapEntryRecipe(recipe) || !sameOperationRequest(request, recipe.mapEntry.request) && !sameOperationRequest(request, stagedMapEntryGetterRequest(recipe.mapEntry)) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.writer != nil {
		if !validStagedWriterRecipe(recipe) || !sameOperationRequest(recipe.writer.request, request) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.constructed != nil {
		if !work.validConstructedMemberRequest(recipe, request) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.nativeGet != nil {
		if recipe.nativeGet.inputInvocation != nil && !work.nativeInputInvocationCurrent(recipe) && !work.requestedWriterSourceSupported(recipe) {
			return sourceStagedOperationID{}, false
		}
		inputReading := work.describedNativeInputInvocationReading(request) || work.acceptedGetPreparationSourceReading(request)
		if !validNativeGetRequest(recipe, request) && !inputReading || request.reading != (sourceStagedOperationKey{}) && !work.validFieldExposureReading(recipe, request) && !work.validStagedKeySourceReading(recipe, request) && !inputReading {
			return sourceStagedOperationID{}, false
		}
	} else if key.selector != (sourceStagedOperationSelector{}) {
		return sourceStagedOperationID{}, false
	} else if recipe.returning != nil {
		if key.kind != relativeDemandDirectExposure || recipe.returning != key.operation || !validReturnedCreatingAssociation(request, facts[consumer]) {
			return sourceStagedOperationID{}, false
		}
	} else if recipe.getter == nil {
		if key.kind != relativeDemandDirectExposure || request.consumer != key.declaration || request.inputs != nil || !ast.IsCallExpression(request.use) || request.use.Expression() != key.operation {
			return sourceStagedOperationID{}, false
		}
	} else if key.kind == relativeDemandEffects {
		if request.consumer != key.declaration || request.inputs != nil || request.use != key.operation {
			return sourceStagedOperationID{}, false
		}
	} else if key.kind == relativeDemandDirectExposure {
		if !validGetterCreatingAssociation(request, facts[consumer]) {
			return sourceStagedOperationID{}, false
		}
	} else {
		return sourceStagedOperationID{}, false
	}
	// A live typed native reader also demands its already issued C factory.
	// Adopt that exact consumer before creating a subscriber that delivery can
	// enqueue immediately. Registration alone supplies no C ID or observation.
	// Keep ordinary direct readers on their existing non-observer path.
	if request.reading != (sourceStagedOperationKey{}) && (recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil || recipe.memberSource != nil && recipe.memberSource.call != nil) {
		parent := work.operationRecipes[request.reading]
		nativeCoverage := parent.memberSource != nil && parent.memberSource.coverage != nil && parent.memberSource.coverage.nativeObserver != (sourceStagedNativeObserver{})
		nativeGet := parent.nativeGet != nil && request.reading.selector.field == "callee-get"
		if nativeCoverage || nativeGet {
			association, provided := work.nativeObserverInputAssociation(request)
			coverage := work.operationRecipes[association.coverage.producer].memberSource
			if !provided || coverage == nil || coverage.generation != work.operationGeneration || !sameOperationRequest(coverage.request, association.coverage) {
				return sourceStagedOperationID{}, false
			}
			// No state pointer is held across this nested enrollment: appending
			// its pending C can grow operations. C enrollment does not execute
			// dependencies or queued work, and cannot recurse into this reader.
			if _, adopted := work.requireOperation(facts, association.coverage); !adopted {
				return sourceStagedOperationID{}, false
			}
		}
	}
	work.initializeOperationIdentity()
	id, exists := work.operationIDs[key]
	if !exists {
		if uint64(len(work.operations)) >= uint64(^uint32(0)) {
			return sourceStagedOperationID{}, false
		}
		id = sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(len(work.operations))}
		work.operationIDs[key] = id
		work.operations = append(work.operations, sourceStagedOperationState{key: key, subscribers: make(map[sourceStagedOperationConsumer]*sourceStagedOperationSubscriber)})
		work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: producer, operation: id})
	}
	state := &work.operations[id.index]
	if recipe.memberSource != nil && (recipe.memberSource.originalGetMutation != nil || recipe.memberSource.reflectiveContribution != nil || recipe.memberSource.descriptorStrong != nil || recipe.memberSource.targetSource != nil || recipe.memberSource.coverage != nil || recipe.memberSource.call != nil || recipe.memberSource.getEffects != nil || recipe.memberSource.protocolSource != nil && (recipe.memberSource.protocolSource.external != nil || recipe.memberSource.protocolSource.get != nil || recipe.memberSource.protocolSource.evaluation != nil)) {
		state.memberCoverageObserved = work.memberCoverageObserved[key] == work.operationGeneration
	}
	usingEdge := sourceStagedOperationConsumer{request.consumer, request.edge}
	if prior := state.subscribers[usingEdge]; prior != nil {
		if !sameOperationRequest(prior.request, request) {
			return sourceStagedOperationID{}, false
		}
	} else {
		state.subscribers[usingEdge] = &sourceStagedOperationSubscriber{request: request}
		state.subscriberOrder = append(state.subscriberOrder, usingEdge)
		if state.revision != 0 {
			work.queueOperationDelivery(state)
		}
	}
	if recipe.writer != nil && recipe.writer.callable {
		work.adoptWriterSourceInputs(facts, id)
	}
	facts[consumer].staged.operationsPending = true
	work.enrollNativeProjectionGet(facts, key)
	return id, true
}

// publishOperation seals a monotone prefix of the registered finite envelope.
// All required membership is registered before queue extraction. Readiness is a
// separate revision, not empty coverage. Duplicate publications are no-ops.
func (work *callableEffectWork) publishOperation(id sourceStagedOperationID, delta sourceStagedOperationDelta) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || uint64(id.index) >= uint64(len(work.operations)) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !operationDeltaPrefix(state.delta, delta) || !operationDeltaPrefix(delta, recipe.delta) || state.delta.extracted && !delta.extracted {
		return false
	}
	if delta.extracted && !operationDeltaPrefix(recipe.delta, delta) {
		return false
	}
	if operationDeltaSize(delta) == 0 {
		return false
	}
	if operationDeltaCursor(state.delta) == operationDeltaCursor(delta) && state.delta.extracted == delta.extracted {
		return true
	}
	state.delta = cloneOperationDelta(delta)
	state.revision++
	work.notifyMemberInputWaiters(id)
	work.notifyOperationSubscribers(state)
	return true
}

// sameOperationEndpoint compares the original source identity and ordered projection.
// A matching identity does not admit that projection to an unsupported consumer.
// Neither unknown nor absent alternatives can stand in for a described endpoint.
func sameOperationEndpoint(a, b sourceRelativeEndpoint) bool {
	return sameNativePrimitiveResult(a.nativePrimitive, b.nativePrimitive) && sameConstructionCallableValue(a.constructionCallable, b.constructionCallable) && sameModuleConstructionValue(a.moduleConstruction, b.moduleConstruction) && sameNativeDescriptorView(a.descriptorView, b.descriptorView) && sameFrameworkStorageView(a.frameworkView, b.frameworkView) && slices.Equal(a.projection, b.projection) && a.kind == b.kind && a.role == b.role && a.expression == b.expression && a.producer == b.producer && a.get == b.get && a.creation == b.creation && a.returning == b.returning && a.restPosition == b.restPosition && a.cut == b.cut
}

// consumeOperation delivers unseen atoms to their exact original request. It
// never evaluates a body or grants normal output, identity or NoWrites rights.
func (work *callableEffectWork) consumeOperation(id sourceStagedOperationID, request sourceStagedOperationRequest) (sourceStagedOperationDelivery, bool) {
	if id.epoch != work.operationEpoch || id.index == 0 || uint64(id.index) >= uint64(len(work.operations)) {
		return sourceStagedOperationDelivery{}, false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if state.key != request.producer || subscriber == nil || !sameOperationRequest(subscriber.request, request) || state.revision == 0 {
		return sourceStagedOperationDelivery{}, false
	}
	if subscriber.consumed == state.revision {
		return sourceStagedOperationDelivery{producer: id, revision: state.revision, delta: sourceStagedOperationDelta{extracted: state.delta.extracted}}, true
	}
	delta := operationDeltaTail(state.delta, subscriber.cursor)
	subscriber.cursor = operationDeltaCursor(state.delta)
	subscriber.consumed = state.revision
	if request.inputs != nil && len(delta.exposures) != 0 {
		// Instantiate the source association only. The producer's template is
		// immutable, and no creating frame or normal output is installed here.
		delta.exposures = append([]sourceStagedOperationAlternative(nil), delta.exposures...)
		for index := range delta.exposures {
			delta.exposures[index].creating = request.inputs
			delta.exposures[index].endpoint.creation = request.inputs.request.operation
			if work.operationRecipes[state.key].returning != nil {
				delta.exposures[index].endpoint.cut = request.inputs.request.cut
			}
		}
	}
	return sourceStagedOperationDelivery{producer: id, revision: state.revision, delta: delta}, true
}

func (work *callableEffectWork) extractOperation(facts []callableFacts, task callableExtractionTask, owners ...*executableBodyOwner) {
	if task.operation.epoch != work.operationEpoch || task.operation.index == 0 || uint64(task.operation.index) >= uint64(len(work.operations)) {
		return
	}
	if task.nativeInputRevision != 0 {
		if len(owners) == 1 {
			work.refreshNativeInputObserver(facts, task, owners[0])
		}
		return
	}
	if task.nativeTargetRevision != 0 {
		if len(owners) == 1 {
			work.refreshReflectiveNativeSource(facts, task, owners[0])
		}
		return
	}
	if task.delivery {
		work.operations[task.operation.index].deliveryQueued = false
		var owner *executableBodyOwner
		if len(owners) == 1 {
			owner = owners[0]
		}
		work.deliverOperationSubscribers(facts, task.operation, owner)
		return
	}
	work.registerOperationDependencies(facts, task.operation)
	work.registerNativeModuleInputs(facts, task.operation)
	recipe, ok := work.operationRecipes[work.operations[task.operation.index].key]
	if !ok {
		return
	}
	if recipe.mutationData != nil {
		work.prepareFieldMutationData(facts, task.operation)
		return
	}
	if recipe.installedMutationRHS != nil {
		if work.installedMutationRHSCurrent(recipe) && recipe.delta.extracted {
			work.publishOperation(task.operation, recipe.delta)
		}
		return
	}
	if recipe.memberSource != nil && recipe.memberSource.reflectiveContribution != nil {
		work.publishReflectiveContribution(task.operation)
		return
	}
	if recipe.memberSource != nil && recipe.memberSource.descriptorStrong != nil {
		work.queueDescriptorStrongReader(task.operation)
		return
	}
	if recipe.descriptorTarget != nil {
		work.prepareDescriptorTargetSource(facts, task, owners)
		return
	}
	if recipe.descriptorSource != nil {
		if len(owners) == 1 {
			work.prepareDescriptorSource(facts, task.operation, owners[0])
		}
		return
	}
	if work.nativeEffectsTaskSource(task.operation) != nil {
		if len(owners) == 1 {
			revoke, installed := work.beginNativeEffectsExecution(facts, task, owners[0])
			if installed {
				defer revoke()
				work.prepareNativeEffectsSource(facts, task, owners[0])
			}
		}
		return
	}
	if recipe.installedCall != nil {
		if len(owners) == 1 {
			work.prepareInstalledCallPhase(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.installedMember != nil {
		return // only a fresh original phase event publishes this source
	}
	if work.requestedWriterSourceSupported(recipe) && !work.writerSourceLocallyReady(recipe) {
		if len(owners) == 1 {
			work.prepareRequestedWriterSource(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.frameworkEffects != nil {
		if len(owners) == 1 {
			work.prepareStagedFrameworkEffects(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.moduleArgument != nil {
		if len(owners) == 1 {
			work.prepareStagedModuleArgumentSource(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil {
		work.publishNativeInputInvocation(task.operation)
		return
	}
	if recipe.entryLaw != nil {
		work.publishEntryLawSource(task.operation)
		return
	}

	if recipe.constructionEffects != nil {
		if len(owners) == 1 {
			work.prepareStagedConstructionEffects(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.assignment != nil {
		if len(owners) == 1 {
			work.prepareStagedAssignment(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.hasInstance != nil {
		if len(owners) == 1 {
			work.prepareStagedHasInstance(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.mapProtocol != nil && recipe.key != recipe.nativeGet.descriptorMap.protocol.producer {
		if operationDeltaSize(recipe.delta) == 0 && recipe.delta.extracted {
			work.publishSourceDisposition(task.operation)
		} else {
			work.publishOperation(task.operation, recipe.delta)
		}
		return
	}
	if recipe.declarationCall != nil {
		if len(owners) == 1 {
			work.renewStagedDeclarationCallSource(facts, task.operation, owners[0])
		}
		work.prepareStagedDeclarationCallEffects(facts, task.operation)
		return
	}
	if recipe.callResult != nil {
		if len(owners) == 1 {
			work.prepareStagedCallResult(facts, task.operation, owners[0])
		}
		return
	}
	if recipe.memberSource != nil {
		if recipe.memberSource.getPreparation != nil {
			if len(owners) == 1 {
				work.prepareStagedGetPreparation(facts, task, owners[0])
			}
			return
		}
		if recipe.memberSource.originalGetMutationInterest != nil {
			work.prepareOriginalGetMutationInterest(facts, task.operation)
			return
		}
		if recipe.memberSource.originalGetMutation != nil {
			// A demand can adopt a previously discovered SOURCE description.
			// Retain its original dependency wakes before testing local readiness.
			work.attachSourceObservationDependencies(facts, task.operation)
			work.refineOriginalGetMutationProviders(facts, task.operation)
			recipe = work.operationRecipes[work.operations[task.operation.index].key]
			if work.originalGetMutationCurrent(recipe) {
				work.publishMemberSourceContributions(task.operation)
			}
			return
		}
		if recipe.memberSource.nativeWriter != nil {
			work.publishNativeWriterCapability(task.operation)
			return
		}
		if recipe.memberSource.globalWrite != nil {
			work.publishStagedGlobalWrite(task.operation)
			return
		}
		if recipe.memberSource.hasFreshTarget != nil {
			work.prepareHasFreshTarget(facts, task.operation)
			return
		}
		if recipe.memberSource.targetSource != nil {
			if len(owners) == 1 {
				if task.callable < 0 || task.callable >= len(facts) {
					return
				}
				execution := sourceStagedReflectiveGetExecution{work: work, task: &task, owner: owners[0], fact: &facts[task.callable]}
				execution.self = &execution
				defer func() { execution.self = nil }()
				work.prepareStagedReflectiveTargetProducer(facts, task.operation, owners[0], &execution)
			}
			return
		}
		if len(owners) == 1 {
			work.prepareStagedDeclarationProtocolSource(facts, task.operation, owners[0])
		}
		if len(owners) == 1 {
			work.prepareConstructedCoverageDemand(facts, task.operation, owners[0])
		}
		work.prepareStagedMemberProtocol(facts, task.operation, owners...)
		recipe = work.operationRecipes[work.operations[task.operation.index].key]
		if recipe.memberSource.call != nil {
			if len(owners) == 1 {
				work.prepareStagedMemberCall(facts, task.operation, owners[0])
			}
			return
		}
		if recipe.memberSource.protocolSource != nil && len(owners) == 1 && owners[0] != nil {
			if recipe.memberSource.protocolSource.external != nil {
				work.registerStagedMemberExternal(facts, work.memberNodes[recipe.memberSource.parent.consumer], recipe.memberSource.candidate.operation, owners[0])
			}
			if recipe.memberSource.protocolSource.get != nil {
				work.prepareStagedMemberExternalGetSource(facts, task.operation, owners[0])
			}
		}
		if recipe.memberSource.getEffects != nil || recipe.memberSource.coverage != nil || recipe.memberSource.protocolSource != nil && (recipe.memberSource.protocolSource.external != nil || recipe.memberSource.protocolSource.get != nil || recipe.memberSource.protocolSource.evaluation != nil) {
			work.publishMemberSourceContributions(task.operation)
			return
		}
		if recipe.memberSource.moduleExcluded != nil {
			work.publishStagedModuleWriterExclusion(facts, task.operation)
			return
		}
		if len(owners) == 1 && owners[0] != nil {
			work.prepareStagedMemberActivation(facts, task.operation, owners[0])
			recipe = work.operationRecipes[work.operations[task.operation.index].key]
		}
		work.publishOperation(task.operation, recipe.delta)
		return
	}
	if recipe.mapEntry != nil {
		work.publishOperation(task.operation, recipe.delta)
		return
	}
	if recipe.writer != nil {
		if len(owners) == 1 {
			work.prepareStagedWriterResults(facts, task.operation, owners[0])
		}
		work.publishOperation(task.operation, work.operationRecipes[recipe.key].delta)
		return
	}
	if recipe.constructed != nil {
		work.publishOperation(task.operation, recipe.delta)
		return // Pending source obligations are not extraction-complete by queue presence.
	}

	if len(owners) == 1 && owners[0] != nil {
		work.operationGeneration = owners[0].values.generation
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil && (recipe.key == nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer || recipe.key == nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer) {
			work.prepareDescriptorEffects(facts, task.operation, owners[0])
			return
		}
		if recipe.nativeGet != nil && recipe.key.selector.field == "eager-target" {
			if recipe.nativeGet.targetSource.producer.operation != nil {
				work.publishOperation(task.operation, recipe.delta)
				return
			}
			work.consumeNativeTargetEffectsSource(facts, task.operation, owners[0])
			return
		}
		if recipe.nativeGet != nil && recipe.key.selector.field == "callee-get" {
			if work.nativeScopeGetTaskSource(task.operation) != nil {
				work.prepareNativeScopeGetSource(facts, task, owners[0])
				return
			}
			if work.publishNativeMemberEffects(task.operation) {
				return
			}
			work.consumeNativeCalleeSource(facts, task.operation, owners[0])
			return
		}
		if recipe.nativeGet != nil && recipe.key.selector.field == "eager-inputs" && recipe.nativeGet.eager != nil && (len(recipe.nativeGet.eager.calls) != 0 || len(recipe.nativeGet.eager.operations) != 0 || recipe.nativeGet.eager.targetPending) {
			work.prepareNativeEagerTask(facts, task, owners[0])
			return
		}
		work.publishEagerReturnValueDemand(facts, task.operation, owners[0])
		work.prepareFieldGetterRequirements(facts, task.operation, owners[0])
		work.consumeFieldGetterSource(facts, task.operation, owners[0], &task)
	}
	if recipe.nativeGet != nil && recipe.nativeGet.descriptorMap != nil {
		if recipe.key == recipe.nativeGet.descriptorMap.algorithm.producer {
			work.publishOperation(task.operation, recipe.delta)
			return
		}
		if recipe.key == nativeDescriptorDefinitionsRequest(recipe.nativeGet).producer {
			work.publishOperation(task.operation, recipe.delta)
			return
		}
		if recipe.key == recipe.nativeGet.descriptorMap.protocol.producer {
			if len(owners) == 1 && owners[0] != nil && recipe.key == recipe.nativeGet.descriptorMap.protocol.producer {
				work.prepareStagedDescriptorMapSource(facts, task.operation, owners[0])
			}
			return // Original target/key/enumerability owners remain independent.
		}
	}
	if recipe.nativeGet != nil {
		request := recipe.nativeGet.request
		request.producer = recipe.key
		if _, sourceRole := fieldSourceParent(request); sourceRole {
			if work.publishSequenceValueCoverage(task.operation) {
				return
			}
			work.publishFieldSourcePrefix(task.operation, recipe.delta)
			return
		}
	}
	if validNativeInputBindingPhase(recipe) {
		work.prepareNativeInputBindingPhase(facts, task.operation)
		return
	}
	if recipe.nativeGet != nil && recipe.nativeGet.inputSource.producer.operation != nil && (recipe.key.selector.field == "algorithm" || recipe.key.selector.field == "eager-inputs") {
		work.publishOperation(task.operation, recipe.delta)
		return
	}
	if recipe.nativeGet != nil && recipe.nativeGet.descriptorMap != nil && recipe.key.selector.field == "eager-inputs" && len(recipe.delta.required) != 0 {
		work.publishOperation(task.operation, recipe.delta)
		return // Each original key producer retains its own required root.
	}
	if recipe.nativeGet != nil && recipe.nativeGet.kind == sourceNativeSymbolFor && recipe.key.selector.field == "eager-inputs" && len(recipe.nativeGet.coercions) != 0 {
		work.publishOperation(task.operation, recipe.delta)
		return
	}
	if recipe.nativeGet != nil && recipe.delta.extracted && (recipe.key.selector.field == "callee-get" || recipe.key.selector.field == "eager-inputs" || recipe.key.selector.field == "algorithm" && recipe.nativeGet.input != nil) {
		work.publishNativeRootEffects(task.operation)
		return
	}
	if recipe.nativeGet != nil && recipe.key.kind == relativeDemandDirectExposure {
		work.publishOperation(task.operation, recipe.delta)
		return // Known positive exposure is not complete alternative coverage.
	}
	// Native Get debts await their original source owner, never queue presence.
	if recipe.nativeGet != nil && recipe.key.selector != (sourceStagedOperationSelector{}) && !(recipe.key.selector.occurrence == recipe.nativeGet.get && recipe.key.selector.field == "algorithm" && (recipe.nativeGet.descriptorGet != nil || recipe.nativeGet.input != nil && recipe.delta.extracted)) {
		return
	}
	delta := recipe.delta
	delta.extracted = true
	work.publishOperation(task.operation, delta)
}

func (work *callableEffectWork) operationInvocation(facts []callableFacts, consumer, producer int, operation *ast.Node, cut sourceRelativeCut) {
	edge := fmt.Sprintf("%s:operation-invoked:%d:%s", facts[consumer].summary.ID, operation.Pos(), facts[producer].summary.ID)
	work.operationInvocationOnEdge(facts, consumer, producer, operation, cut, edge)
}

// operationInvocationOnEdge consumes the same required source edge that yielded
// during extraction. Availability and invocation must not create disconnected
// memberships whose revisions can never be observed by the existing solver.
func (work *callableEffectWork) operationInvocationOnEdge(facts []callableFacts, consumer, producer int, operation *ast.Node, cut sourceRelativeCut, edge string) {
	fact := &facts[consumer]
	work.requireStagedSummary(facts, consumer, producer, edge, operation, cut)
	// The authentic edge retains its original source operation for descriptive
	// consumers after this work owner is released. This creates no target,
	// outcome or currentness receipt. A conflicting repeat keeps the first
	// association; requireStagedSummary independently retains its invalid debt.
	if fact.fieldEdgeOperations == nil {
		fact.fieldEdgeOperations = make(map[string]*ast.Node)
	}
	if _, present := fact.fieldEdgeOperations[edge]; !present {
		fact.fieldEdgeOperations[edge] = operation
	}
	for _, prior := range fact.summary.Calls {
		if prior.ID == edge {
			return
		}
	}
	fact.summary.Calls = append(fact.summary.Calls, CallEdge{ID: edge, Name: sourceText(ast.GetSourceFileOfNode(operation), operation), Resolved: true, TargetID: facts[producer].summary.ID})
	fact.targets = append(fact.targets, producer)
	if consumer < len(work.dirty) && producer < len(work.callers) {
		// DATA consumers may discover an actual invocation after propagation
		// setup. Join the existing reverse index and wake this source caller.
		work.dirty[consumer] = true
		if !slices.Contains(work.callers[producer], consumer) {
			work.callers[producer] = append(work.callers[producer], consumer)
		}
	}
}

// prepareOperationUses reconnects exact source subscribers, registers required
// backedges before extraction, then drains and delivers on this existing owner.
// No query is replayed. Unsupported transfer stays pending rather than unknown.
func (work *callableEffectWork) prepareOperationUses(facts []callableFacts, owners ...*executableBodyOwner) {
	if work.operationPreparing {
		return
	}
	work.operationPreparing = true
	// Operation sources may yield while a canonical definition is collecting.
	// They cannot impersonate that definition's direct-call extraction context.
	extracting := work.extracting
	canonical := work.operationCanonical
	work.extracting = -1
	defer func() {
		work.operationPreparing, work.extracting, work.operationCanonical = false, extracting, canonical
	}()
	var owner *executableBodyOwner
	if len(owners) == 1 {
		owner = owners[0]
		if owner != nil && owner.values != nil {
			work.operationGeneration = owner.values.generation
		}
	}
	work.indexOperationSources(facts)
	work.operationCanonical = work.canonicalReadinessOwner(facts, owner, extracting)
	work.refreshStagedEvaluations(facts, owner)
	work.prepareConstructedOccurrences(facts, owner)
	for index := range facts {
		facts[index].staged.operationsPending = len(facts[index].staged.operationUses) != 0
		for _, use := range facts[index].staged.operationUses {
			work.requireOperation(facts, use.request)
		}
	}
	// A finite source producer is visited once. Newly registered dependencies join
	// this same queue, including cycles, without descending into source evaluation.
	for index := 1; index < len(work.operations); index++ {
		work.registerOperationDependencies(facts, sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)})
	}
	work.drainOperationExtractions(facts, owner)
	for work.constructedDataChanged {
		work.constructedDataChanged = false
		work.prepareConstructedOccurrences(facts, owner)
		work.drainOperationExtractions(facts, owner)
	}

	for {
		work.constructedDataChanged = false
		work.completeConstructedSources(facts, owner)
		work.drainOperationExtractions(facts, owner)
		if !work.constructedDataChanged {
			break
		}
		work.prepareConstructedOccurrences(facts, owner)
	}
	for index := 1; index < len(work.operations); index++ {
		state := &work.operations[index]
		if len(state.eagerCalls) != 0 {
			work.deliverNativeEagerCalls(facts, work.operationIDs[state.key], owner)
		}
		if work.operationRecipes[state.key].writer != nil {
			work.prepareStagedWriterResults(facts, work.operationIDs[state.key], owner)
		}
		if recipe := work.operationRecipes[state.key]; recipe.writer != nil && recipe.writer.callable {
			work.deliverWriterMethods(facts, work.operationIDs[state.key], owner)
		}
		for getter := range state.getters {
			work.deliverFieldGetterBody(facts, &state.getters[getter], owner)
		}
		work.deliverOperationSubscribers(facts, work.operationIDs[state.key], owner)
	}
	// Revision notifications from the delivery pass join the existing queue.
	// Drain them before closure, without another source query or full graph scan.
	work.drainOperationExtractions(facts, owner)
	work.deliverInstalledFieldGetters(facts, owner)
	for index := 1; index < len(work.operations); index++ {
		if work.operationRecipes[work.operations[index].key].declarationCall != nil {
			work.prepareStagedDeclarationCallEffects(facts, work.operationIDs[work.operations[index].key])
		}
	}
	work.refreshStagedCallResults(facts, owner)
	work.refreshStagedMemberActivations(facts, owner)
	work.refreshEntryLawSources(facts)
	work.refreshOperationPublication(facts)
}

// drainOperationExtractions dispatches only source operation tasks on the shared
// queue. Canonical tasks keep their original FIFO and owner, even when operation
// work is requested during local definition collection. Mark before dispatch so
// a source callback cannot execute the same task again. Appended work joins this
// finite pass and canonical nextExtraction skips only these completed tasks.
func (work *callableEffectWork) drainOperationExtractions(facts []callableFacts, owner *executableBodyOwner) {
	preparing := work.operationPreparing
	work.operationPreparing = true
	defer func() { work.operationPreparing = preparing }()
	for index := work.extractionHead; index < len(work.extractionQueue); index++ {
		task := work.extractionQueue[index]
		if task.operation.index == 0 || task.operationDone {
			continue
		}
		work.extractionQueue[index].operationDone = true
		work.extractOperation(facts, task, owner)
	}
	for work.extractionHead < len(work.extractionQueue) && work.extractionQueue[work.extractionHead].operationDone {
		work.extractionHead++
	}
}

// refreshOperationPublication observes current dependency delivery after both
// operation extraction and callable-summary propagation. This phase performs no
// acquisition or source extraction. Local readiness is not transitive settlement.
func (work *callableEffectWork) refreshOperationPublication(facts []callableFacts) {
	closed := work.closedOperationDependencies()
	// Explicit source uses retain failed registration. Required-only subscribers
	// also gate their own fact, not just the parent's transitive publication.
	for index := range facts {
		facts[index].staged.operationsPending = false
		for _, call := range facts[index].staged.calls {
			facts[index].staged.operationsPending = facts[index].staged.operationsPending || call.inputConsumerWait != nil
		}
		for _, occurrence := range facts[index].staged.constructedOccurrences {
			if _, represented := work.operationIDs[occurrence.request.producer]; !represented {
				facts[index].staged.operationsPending = true
			}
		}
		for _, use := range facts[index].staged.operationUses {
			if _, found := work.operationIDs[use.request.producer]; !found {
				facts[index].staged.operationsPending = true
			}
		}
	}
	for index := 1; index < len(work.operations); index++ {
		state := &work.operations[index]
		for _, key := range state.subscriberOrder {
			subscriber := state.subscribers[key]
			if !closed[index] || subscriber.applied != state.revision || subscriber.blocked {
				facts[work.memberNodes[key.consumer]].staged.operationsPending = true
			}
		}
	}
}

// registerOperationDependencies owns membership before either initial or late
// source publication. Dependencies discovered during extraction join the same
// finite queue, without recursively extracting their source or replaying a Get.
func (work *callableEffectWork) registerOperationDependencies(facts []callableFacts, id sourceStagedOperationID) {
	// Breadth-first membership registration follows source edges only, never
	// producer queries. Mark before expansion so cycles and diamonds are finite.
	queue := []sourceStagedOperationID{id}
	for head := 0; head < len(queue); head++ {
		current := queue[head]
		if current.epoch != work.operationEpoch || current.index == 0 || int(current.index) >= len(work.operations) || work.operations[current.index].dependenciesRegistered {
			continue
		}
		work.operations[current.index].dependenciesRegistered = true
		key := work.operations[current.index].key
		recipe := work.operationRecipes[key]
		if recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil {
			work.indexNativeWriterCapability(key)
		}
		work.enrollNativeEagerKey(facts, recipe)
		required := operationRecipeEffectRequirements(recipe)
		if recipe.memberSource != nil && recipe.memberSource.moduleExcluded != nil {
			required = append(append([]sourceStagedOperationRequest(nil), required...), recipe.memberSource.moduleExcluded.required...)
		}
		for _, request := range required {
			child, admitted := work.requireOperation(facts, request)
			if !admitted {
				work.operations[current.index].invalid = true
				continue
			}
			work.operations[current.index].dependencies = append(work.operations[current.index].dependencies, sourceStagedOperationDependency{child, request})
			if !work.operations[child.index].dependenciesRegistered {
				queue = append(queue, child)
			}
		}
	}
	for _, current := range queue {
		work.indexRegisteredEntryLawModules(current)
	}
}
