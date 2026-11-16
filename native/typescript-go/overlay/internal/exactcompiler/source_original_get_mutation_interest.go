package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceOriginalGetMutationInterest is a passive demand header issued before
// the original Get has a SOURCE observation. Its own unextracted child keeps
// later SOURCE attachment separate from an already sealed origin Effects role.
// Receiver preparation captures real query/physical cuts. Native registration
// has no future Get cut and retains only its actual selected target origin.
// source is bound only by a later genuine Get publisher, never by discovery.
type sourceOriginalGetMutationInterest struct {
	nativeField             *sourceOriginalGetNativeField  // Original selected field/phase header, no future Get receipt.
	nativeCallee            *sourceOriginalGetNativeCallee // passive callee-only scope, no future query receipt
	origin, parent, reading sourceStagedOperationRequest
	operation, receiver     *ast.Node
	queryCut, physicalCut   sourceRelativeCut
	descriptor              *sourceStagedDescriptorRetrieval
	method                  *ast.Node
	nativeRoot              sourceStagedOperationRequest
	nativeKind              sourceNativeKind
	generation              *projectGeneration
	source                  *sourceOriginalGetMutationSource
}

func originalGetMutationInterestOrigin(i *sourceOriginalGetMutationInterest) sourceStagedOperationRequest {
	if i == nil {
		return sourceStagedOperationRequest{}
	}
	return i.origin
}

func originalGetMutationInterestRequest(i *sourceOriginalGetMutationInterest) sourceStagedOperationRequest {
	if i == nil {
		return sourceStagedOperationRequest{}
	}
	request := i.origin
	if i.nativeField != nil {
		h := i.nativeField
		request.producer.kind = relativeDemandDirectExposure
		request.producer.operation = i.operation
		request.producer.selector = sourceStagedOperationSelector{occurrence: h.field.producer.selector.occurrence, association: h.field.producer.selector.association, field: fmt.Sprintf("original-get-mutation-interest:native-field:%#v:%d:%d", h.field, h.ordinal, h.phase)}
		request.edge += ":" + request.producer.selector.field
		request.reading = i.origin.producer
		return request
	}
	association := i.receiver
	if i.nativeCallee != nil {
		association = i.nativeCallee.root.producer.operation
	} else if i.nativeRoot.producer.operation != nil {
		association = i.nativeRoot.producer.operation
	}
	request.producer.kind = relativeDemandDirectExposure
	request.producer.operation = i.operation
	request.producer.selector = sourceStagedOperationSelector{occurrence: i.operation, association: association, field: "original-get-mutation-interest:" + i.origin.producer.selector.field}
	request.edge += ":mutation-interest"
	request.reading = i.origin.producer
	return request
}

func cloneOriginalGetMutationInterest(i *sourceOriginalGetMutationInterest) *sourceOriginalGetMutationInterest {
	if i == nil {
		return nil
	}
	out := *i
	out.nativeField = cloneOriginalGetNativeField(i.nativeField)
	out.nativeCallee = cloneOriginalGetNativeCallee(i.nativeCallee)
	out.descriptor = cloneDescriptorRetrieval(i.descriptor)
	out.source = cloneOriginalGetMutationSource(i.source)
	return &out
}

// sameOriginalGetMutationInterest compares the immutable issued demand header.
// Field snapshots do not inherit a later bound SOURCE payload.
func sameOriginalGetMutationInterest(a, b *sourceOriginalGetMutationInterest) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.origin, b.origin) && sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.reading, b.reading) && a.operation == b.operation && a.receiver == b.receiver && a.queryCut == b.queryCut && a.physicalCut == b.physicalCut && sameDescriptorRetrieval(a.descriptor, b.descriptor) && sameOriginalGetNativeCallee(a.nativeCallee, b.nativeCallee) && sameOriginalGetNativeField(a.nativeField, b.nativeField) && a.method == b.method && sameOperationRequest(a.nativeRoot, b.nativeRoot) && a.nativeKind == b.nativeKind && a.generation == b.generation
}

func originalGetMutationInterestRefinementAllowed(a, b *sourceOriginalGetMutationInterest) bool {
	return sameOriginalGetMutationInterest(a, b) && (a == nil || a.source == nil || b.source != nil && originalGetMutationRefinementAllowed(a.source, b.source))
}

// Shape checks describe the original issuer domains only. They supply no Get,
// source observation, selected target proof, DATA delivery or completion.
func validOriginalGetMutationInterestShape(i *sourceOriginalGetMutationInterest) bool {
	if i != nil && i.nativeField != nil {
		return validOriginalFieldMutationInterest(i)
	}
	if i == nil || i.generation == nil || i.operation == nil || !ast.IsPropertyAccessExpression(i.operation) || i.origin.producer.operation == nil || i.origin.consumer == nil || i.origin.inputs != nil || i.origin.consumer != i.origin.producer.declaration || !sourceStagedOccurrenceOwned(i.operation, i.origin.producer.declaration) {
		return false
	}
	if i.nativeCallee != nil {
		return validOriginalCalleeGetMutationInterest(i)
	}
	if i.nativeRoot.producer.operation != nil {
		root := i.nativeRoot
		if i.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(i.method)) || !reflectiveNative(i.nativeKind) || !sameOperationRequest(i.parent, i.origin) || i.receiver != nil || i.descriptor != nil || i.reading.producer.operation != nil || i.queryCut != (sourceRelativeCut{}) || i.physicalCut != (sourceRelativeCut{}) || root.inputs != nil || root.producer.selector != (sourceStagedOperationSelector{}) || root.producer.kind != relativeDemandEffects || root.consumer != i.origin.consumer || root.use != root.producer.operation || root.cut != (sourceRelativeCut{operation: root.producer.operation, use: root.producer.operation, reading: root.producer.operation}) {
			return false
		}
		expected := nativeEagerTargetRequest(&sourceStagedNativeGetSource{request: root})
		return expected.producer.selector.occurrence == i.operation && ast.IsIdentifier(i.operation.Expression()) && sameOperationRequest(expected, i.origin)
	}
	// Framework preparation retains compact result intent before method selection.
	return i.method == nil && i.nativeKind == 0 && i.descriptor != nil && i.descriptor.generation == i.generation && i.descriptor.request.producer.operation == i.receiver && i.receiver != nil && ast.IsCallExpression(i.receiver) && i.operation.Expression() == i.receiver && validStagedMemberParent(i.parent) && i.parent.producer.operation == i.operation && sameOperationRequest(i.origin, frameworkGetResumptionRequest(i.parent)) && memberReceiverCutsCorrespond(i.parent, i.queryCut, i.physicalCut) && validStagedCallResultReading(i.reading, i.parent, i.physicalCut) && i.reading.producer.operation == i.receiver
}

func originalGetMutationInterestSourceMatches(i *sourceOriginalGetMutationInterest, s *sourceOriginalGetMutationSource) bool {
	if !validOriginalGetMutationInterestShape(i) || !validOriginalGetMutationSource(s) || s.generation != i.generation {
		return false
	}
	if i.nativeField != nil {
		return originalFieldMutationInterestMatches(i, s)
	}
	if i.nativeCallee != nil {
		return originalCalleeGetMutationInterestSourceMatches(i, s)
	}
	if s.operation != i.operation {
		return false
	}
	if i.nativeRoot.producer.operation != nil {
		return s.nativeTarget != nil && sameOperationRequest(s.request, i.parent) && sameOperationRequest(s.nativeTarget.root, i.nativeRoot) && s.nativeTarget.method == i.method && s.nativeTarget.kind == i.nativeKind
	}
	return s.record != nil && sameOperationRequest(s.request, i.parent) && s.queryCut == i.queryCut && sameDescriptorRetrieval(&s.record.view.source, i.descriptor) && sameOperationRequest(s.record.view.delivery, i.reading)
}

func originalGetMutationInterestRequirements(i *sourceOriginalGetMutationInterest) []sourceStagedOperationRequest {
	required := []sourceStagedOperationRequest{i.origin}
	if i.source != nil {
		required = appendEntryLawRequirement(required, originalGetMutationRequest(i.source))
	}
	return required
}

func validOriginalGetMutationInterestRecipe(recipe sourceStagedOperationRecipe) bool {
	m := recipe.memberSource
	if m == nil || m.originalGetMutationInterest == nil {
		return false
	}
	i := m.originalGetMutationInterest
	if !validOriginalGetMutationInterestShape(i) || m.generation != i.generation || !sameOperationRequest(m.parent, i.origin) || !sameOperationRequest(m.request, originalGetMutationInterestRequest(i)) || recipe.key != m.request.producer || i.source != nil && !originalGetMutationInterestSourceMatches(i, i.source) || i.source == nil && recipe.delta.extracted || len(recipe.delta.required) != len(originalGetMutationInterestRequirements(i)) || !operationPrefix(recipe.delta.required, originalGetMutationInterestRequirements(i), sameOperationRequest) {
		return false
	}
	if m.originalGetMutation != nil || m.reflectiveContribution != nil || m.frameworkRead != nil || m.installedCallSelection != nil || m.installedMember != nil || m.nativeWriter != nil || m.globalWrite != nil || m.hasFreshTarget != nil || m.targetSource != nil || m.writeEffects || m.protocolSource != nil || m.coverage != nil || m.call != nil || m.descriptorStrong != nil || m.getEffects != nil || m.extraction != nil || m.moduleExcluded != nil || len(m.moduleImports)+len(m.values) != 0 || m.candidate.operation != nil || m.candidate.origin != nil || m.candidate.region != nil || m.candidate.request.producer.operation != nil {
		return false
	}
	return recipe.nativeGet == nil && recipe.callResult == nil && recipe.mutationData == nil && recipe.installedMutationRHS == nil && recipe.writer == nil && recipe.installedCall == nil && recipe.installedMember == nil && recipe.descriptorSource == nil && recipe.descriptorTarget == nil && recipe.frameworkEffects == nil && recipe.moduleArgument == nil && recipe.entryLaw == nil && recipe.assignment == nil && recipe.declarationCall == nil && recipe.constructionEffects == nil && recipe.hasInstance == nil && recipe.constructed == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.getter == nil && recipe.returning == nil && recipe.constructedDisposition == nil && len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards)+len(recipe.delta.exposures)+len(recipe.delta.residuals)+len(recipe.delta.effects)+len(recipe.delta.invoked)+len(recipe.delta.relative) == 0
}

// Currentness here authenticates the issued demand and retained origin only.
// A future SOURCE description and its APPLIED delivery have separate checks.
func (work *callableEffectWork) originalGetMutationInterestCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validOriginalGetMutationInterestRecipe(recipe) || work.operationGeneration == nil || !work.operationGeneration.active || recipe.memberSource.generation != work.operationGeneration {
		return false
	}
	i := recipe.memberSource.originalGetMutationInterest
	registered, present := work.operationRecipes[recipe.key]
	if !present || !validOriginalGetMutationInterestRecipe(registered) || !sameOriginalGetMutationInterest(registered.memberSource.originalGetMutationInterest, i) {
		return false
	}
	if i.nativeField != nil {
		return work.originalFieldMutationInterestCurrent(i)
	}
	if i.nativeCallee != nil {
		return work.originalCalleeGetMutationInterestCurrent(recipe)
	}
	origin := work.operationRecipes[i.origin.producer]
	if i.nativeRoot.producer.operation != nil {
		s := origin.nativeGet
		return s != nil && sameOperationRequest(nativeEagerTargetRequest(s), i.origin) && sameOperationRequest(s.request, i.nativeRoot) && s.method == i.method && s.kind == i.nativeKind && validNativeGetRecipe(origin)
	}
	if !validFrameworkGetResumptionRecipe(origin) || origin.callResult.generation != i.generation {
		return false
	}
	r := origin.callResult.getResult.frameworkResume
	if !sameOperationRequest(r.parent, i.parent) || r.cut != i.physicalCut || !operationContainsRequest(r.readings, i.reading) {
		return false
	}
	return work.originalGetMutationInterestDescriptorReading(i)
}

// The original result factory may precede every selected-native source. Check
// its real registered D/RD association without requiring a root, method, local
// extraction, APPLIED delivery, final Get observation or transitive closure.
func (work *callableEffectWork) originalGetMutationInterestDescriptorReading(i *sourceOriginalGetMutationInterest) bool {
	if !validOriginalGetMutationInterestShape(i) || i.nativeField != nil || i.nativeCallee != nil || i.nativeRoot.producer.operation != nil {
		return false
	}
	result := work.operationRecipes[i.reading.producer]
	if !validNativeDescriptorResultRecipe(result) || result.callResult.generation != i.generation || !sameDescriptorRetrieval(result.callResult.nativeDescriptor, i.descriptor) {
		return false
	}
	for index, reading := range result.callResult.readings {
		if sameOperationRequest(reading, i.reading) && result.callResult.readCuts[index] == i.physicalCut {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) validOriginalGetMutationInterestReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	return work.originalGetMutationInterestCurrent(recipe) && sameOperationRequest(recipe.memberSource.request, request)
}

func (work *callableEffectWork) registerOriginalGetMutationInterest(facts []callableFacts, i *sourceOriginalGetMutationInterest) bool {
	if !validOriginalGetMutationInterestShape(i) || i.source != nil || i.generation != work.operationGeneration {
		return false
	}
	request := originalGetMutationInterestRequest(i)
	if prior, present := work.operationRecipes[request.producer]; present {
		return validOriginalGetMutationInterestRecipe(prior) && sameOriginalGetMutationInterest(prior.memberSource.originalGetMutationInterest, i)
	}
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: i.origin, generation: i.generation, originalGetMutationInterest: i}, delta: sourceStagedOperationDelta{required: originalGetMutationInterestRequirements(i)}}
	return validOriginalGetMutationInterestRecipe(recipe) && work.registerOperationRecipe(facts, recipe)
}

// The original receiver visitor registers this passive interest while its
// existing DATA/read loan is live. No Get/C/observation is manufactured.
func (work *callableEffectWork) registerPreparedOriginalGetMutationInterest(facts []callableFacts, q *sourceValueQuery, source *sourceStagedCallResultSource, reading sourceStagedOperationRequest) bool {
	if q == nil || source == nil || source.nativeDescriptor == nil || source.nativeDescriptor.generation != work.operationGeneration || !q.liveStagedMemberReceiverPreparation(source.request.producer.operation) || !work.memberReceiverPreparationOwner(facts, q, q.memberReceiverPreparation.reference) {
		return false
	}
	p := q.memberReceiverPreparation
	i := &sourceOriginalGetMutationInterest{origin: frameworkGetResumptionRequest(p.parent), parent: p.parent, reading: reading, operation: p.reference.operation, receiver: source.request.producer.operation, queryCut: p.queryCut, physicalCut: p.cut, descriptor: cloneDescriptorRetrieval(source.nativeDescriptor), generation: work.operationGeneration}
	if !work.originalGetMutationInterestDescriptorReading(i) {
		return false
	}
	return work.registerOriginalGetMutationInterest(facts, i)
}

// This selected target registration precedes its query. Its header carries no
// future physical Get or observation; final binding needs that actual event.
func (work *callableEffectWork) registerNativeTargetGetMutationInterest(facts []callableFacts, source *sourceStagedNativeGetSource) bool {
	if source == nil || !reflectiveNative(source.kind) || source.method == nil || source.request.consumer == nil || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.program == nil {
		return false
	}
	origin := nativeEagerTargetRequest(source)
	if origin.producer.selector.occurrence == nil || work.operationRecipes[origin.producer].nativeGet != source {
		return false
	}
	actor, known := work.memberNodes[origin.consumer]
	if !known || actor < 0 || actor >= len(facts) || len(facts) != len(work.operationFacts) || &facts[actor] != &work.operationFacts[actor] || facts[actor].sourceFile == nil || work.operationGeneration.program.GetSourceFile(facts[actor].sourceFile.FileName()) != facts[actor].sourceFile {
		return false
	}
	i := &sourceOriginalGetMutationInterest{origin: origin, parent: origin, operation: origin.producer.selector.occurrence, nativeRoot: source.request, nativeKind: source.kind, method: source.method, generation: work.operationGeneration}
	return work.registerOriginalGetMutationInterest(facts, i)
}

// Interest lookup uses only descriptions retained by this exact canonical
// owner. Ambiguous source contexts are pending, not collapsed by AST identity.
func (work *callableEffectWork) originalGetMutationInterestFor(facts []callableFacts, operation, region *ast.Node) (*sourceOriginalGetMutationInterest, bool) {
	actor, known := work.memberNodes[region]
	if !known || actor < 0 || actor >= len(facts) || len(facts) != len(work.operationFacts) || &facts[actor] != &work.operationFacts[actor] {
		return nil, false
	}
	var found *sourceOriginalGetMutationInterest
	for _, recipe := range facts[actor].staged.operationRecipes {
		if recipe.memberSource == nil || recipe.memberSource.originalGetMutationInterest == nil {
			continue
		}
		i := recipe.memberSource.originalGetMutationInterest
		// Field phases have their own exact-header lookup. Unrelated operations
		// cannot contribute here, so validate currentness only for candidates
		// that can enter this lookup's ambiguity decision.
		if i.nativeField != nil || i.operation != operation {
			continue
		}
		if !work.originalGetMutationInterestCurrent(recipe) {
			continue
		}
		if found != nil && !sameOriginalGetMutationInterest(found, i) {
			return nil, false
		}
		found = i
	}
	return cloneOriginalGetMutationInterest(found), found != nil
}

// resolve returns a CURRENT authentic bound SOURCE description, independently
// of its local extraction/APPLIED and transitive closure. Known prefixes may
// be enumerated at this threshold; final DATA consumers need InterestData.
func (work *callableEffectWork) resolveOriginalGetMutationInterest(i *sourceOriginalGetMutationInterest) (*sourceOriginalGetMutationSource, bool) {
	if !validOriginalGetMutationInterestShape(i) {
		return nil, false
	}
	recipe := work.operationRecipes[originalGetMutationInterestRequest(i).producer]
	if !work.originalGetMutationInterestCurrent(recipe) || !sameOriginalGetMutationInterest(recipe.memberSource.originalGetMutationInterest, i) {
		return nil, false
	}
	bound := recipe.memberSource.originalGetMutationInterest.source
	if bound == nil {
		return nil, false
	}
	source := work.operationRecipes[originalGetMutationRequest(bound).producer]
	if source.memberSource == nil || source.memberSource.originalGetMutation == nil || !sameOriginalGetMutationIdentity(source.memberSource.originalGetMutation, bound) || !work.originalGetMutationCurrent(source) {
		return nil, false
	}
	return cloneOriginalGetMutationSource(source.memberSource.originalGetMutation), true
}

func (work *callableEffectWork) originalGetMutationInterestData(i *sourceOriginalGetMutationInterest) (sourceStagedOperationDelta, bool) {
	source, current := work.resolveOriginalGetMutationInterest(i)
	if !current {
		return sourceStagedOperationDelta{}, false
	}
	if data, applied := work.originalGetMutationData(source); !applied || !data.extracted {
		return sourceStagedOperationDelta{}, false
	}
	request := originalGetMutationInterestRequest(i)
	id, adopted := work.operationIDs[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return sourceStagedOperationDelta{}, false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if state.invalid || !state.delta.extracted || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.applied != state.revision {
		return sourceStagedOperationDelta{}, false
	}
	return cloneOperationDelta(state.delta), true
}

func (work *callableEffectWork) prepareOriginalGetMutationInterest(facts []callableFacts, id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !work.originalGetMutationInterestCurrent(recipe) {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	defer func() {
		// Scheduling coalescing only; this does not refresh any SOURCE observation.
		work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
	}()
	i := recipe.memberSource.originalGetMutationInterest
	source, current := work.resolveOriginalGetMutationInterest(i)
	if !current {
		return
	}
	data, applied := work.originalGetMutationData(source)
	if !applied || !data.extracted {
		return
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.extracted = true
	if validOriginalGetMutationInterestRecipe(recipe) && work.attachOperationSource(facts, recipe) {
		work.publishMemberSourceContributions(id)
	}
}

// Only an actual Get publisher can bind the deferred child. Native finishing
// may have refined pending/population after its earlier observed data-slot arm;
// compare immutable event identity, not those legitimate mutable descriptions.
// Binding itself supplies no target proof or SOURCE extraction/currentness.
func (work *callableEffectWork) bindOriginalGetMutationInterests(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, read *sourceMemberWriterReadCut, source *sourceOriginalGetMutationSource) {
	if q == nil || source == nil || q.owner == nil || q.executable == nil || work.operationGeneration == nil || !work.operationGeneration.active || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program != work.operationGeneration.program || q.owner.checker != work.operationGeneration.checker || q.owner.generation != work.operationGeneration || source.generation != work.operationGeneration || !validOriginalGetMutationSource(source) {
		return
	}
	if source.nativeField != nil {
		// The registered interest is checked below; the actual phase owner
		// authenticates its live publication when binding each matching header.
		if get == nil || read == nil {
			return
		}
	} else if source.nativeCallee != nil {
		if !work.originalNativeCalleeGetMutationPublicationOwned(q, get, read, source) {
			return
		}
	} else if source.nativeTarget != nil {
		b := q.originalGetMutationTarget
		if get != nil || read != nil || b == nil || !b.live || b.issuer != q || b.work != work || b.epoch != work.operationEpoch || b.owner != q.owner || b.executable != q.executable || b.observed == nil || !sameOriginalGetMutationIdentity(b.observed, source) || b.observed.queryCut != source.queryCut {
			return
		}
	} else {
		b := q.stagedMember
		if source.record == nil || !q.liveStagedMemberSource(b, get, read) || !sameOperationRequest(b.request, source.request) || source.operation != get.operation || q.relativeInputCut(get.operation) != source.queryCut {
			return
		}
	}
	registered := work.operationRecipes[originalGetMutationRequest(source).producer]
	if registered.memberSource == nil || registered.memberSource.originalGetMutation == nil || work.memberCoverageObserved[registered.key] != work.operationGeneration || !sameOriginalGetMutationIdentity(registered.memberSource.originalGetMutation, source) {
		return
	}
	actual := registered.memberSource.originalGetMutation
	actor, known := work.memberNodes[source.request.consumer]
	if !known || actor < 0 || actor >= len(facts) || len(facts) != len(work.operationFacts) || &facts[actor] != &work.operationFacts[actor] {
		return
	}
	publisher := q.executable.pendingMemberPublishers[source.request.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[actor] {
		return
	}
	for _, description := range facts[actor].staged.operationRecipes {
		if description.memberSource == nil || description.memberSource.originalGetMutationInterest == nil {
			continue
		}
		i := description.memberSource.originalGetMutationInterest
		if !work.originalGetMutationInterestCurrent(description) || !originalGetMutationInterestSourceMatches(i, actual) {
			continue
		}
		if i.nativeField != nil && !work.liveOriginalFieldMutationInterestBinding(facts, q, get, read, i, actual) {
			continue
		}
		if i.nativeCallee != nil && !work.originalCalleeGetMutationInterestMatches(q, get, read, i, actual) {
			continue
		}
		if description.delta.extracted {
			continue
		} // A completed child never grows its required prefix.
		next := description
		next.memberSource = cloneStagedMemberSource(description.memberSource)
		next.memberSource.originalGetMutationInterest = cloneOriginalGetMutationInterest(i)
		next.memberSource.originalGetMutationInterest.source = cloneOriginalGetMutationSource(actual)
		if !originalGetMutationInterestRefinementAllowed(i, next.memberSource.originalGetMutationInterest) {
			continue
		}
		next.delta = cloneOperationDelta(description.delta)
		next.delta.required = originalGetMutationInterestRequirements(next.memberSource.originalGetMutationInterest)
		if !validOriginalGetMutationInterestRecipe(next) || !work.attachOperationSource(facts, next) {
			continue
		}
		if id, adopted := work.operationIDs[next.key]; adopted {
			work.attachSourceObservationDependencies(facts, id)
			work.prepareOriginalGetMutationInterest(facts, id)
		}
	}
}
