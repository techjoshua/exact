package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceOriginalGetMutationSource describes the mutation-output interest of
// one original SOURCE Get. The standard data-slot arm is conditional; it does
// not classify authored getters or settle the independent population children.
// Query and reader cuts stay in their distinct declaration/physical domains.
type sourceOriginalGetMutationSource struct {
	intrinsicField     *sourceOriginalIntrinsicFieldMutation // Conditional primitive output; no field Value or aggregate NoWrites.
	nativeField        *sourceOriginalGetNativeField         // Actual ordered descriptor field/phase SOURCE, not a normal Get value.
	nativeCallee       *sourceOriginalGetNativeCallee        // real callee-only SOURCE scope, generic fullCall unchanged
	providers          []sourceOriginalGetMutationProvider   // Exact registered per-C description, not output readiness.
	record             *sourceDescriptorRecordGet            // Actual returned-record SOURCE Get only.
	ownMember          *ast.Node                             // Original selected literal DATA terminal, never a getter body.
	operation          *ast.Node                             // actual Get, distinct from a native parent Call
	nativeTarget       *sourceOriginalGetNativeTarget
	slot               sourceNativeDescriptorKind
	intrinsicPrototype bool
	receiverKind       sourceNativeKind
	mode               accessorTraversal
	request            sourceStagedOperationRequest
	coverage           sourceStagedOperationRequest
	queryCut           sourceRelativeCut
	origin             *ast.Node
	property           string
	standard           *ast.Node
	kind               sourceNativeKind
	generation         *projectGeneration
	upstreamBodies     []sourceStagedMemberFieldBody // Required provenance, never mutation provider output.
	population         []sourceStagedOperationRequest
	pending            bool
}

func cloneOriginalGetMutationSource(s *sourceOriginalGetMutationSource) *sourceOriginalGetMutationSource {
	if s == nil {
		return nil
	}
	out := *s
	out.nativeField = cloneOriginalGetNativeField(s.nativeField)
	out.intrinsicField = cloneOriginalIntrinsicFieldMutation(s.intrinsicField)
	out.providers = cloneOriginalGetMutationProviders(s.providers)
	out.upstreamBodies = cloneStagedMemberFieldBodies(s.upstreamBodies)
	out.nativeCallee = cloneOriginalGetNativeCallee(s.nativeCallee)
	out.record = cloneDescriptorRecordGet(s.record)
	if s.nativeTarget != nil {
		n := *s.nativeTarget
		out.nativeTarget = &n
	}
	out.population = cloneOperationDelta(sourceStagedOperationDelta{required: s.population}).required
	return &out
}

func sameOriginalGetMutationSource(a, b *sourceOriginalGetMutationSource) bool {
	if a == b {
		return true
	}
	return a != nil && b != nil && sameOriginalIntrinsicFieldMutation(a.intrinsicField, b.intrinsicField) && sameStagedMemberFieldBodies(a.upstreamBodies, b.upstreamBodies) && len(a.providers) == len(b.providers) && operationPrefix(a.providers, b.providers, sameOriginalGetMutationProvider) && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.coverage, b.coverage) && a.queryCut == b.queryCut && a.origin == b.origin && a.property == b.property && a.standard == b.standard && a.kind == b.kind && a.mode == b.mode && a.operation == b.operation && a.ownMember == b.ownMember && sameDescriptorRecordGet(a.record, b.record) && sameOriginalGetNativeTarget(a.nativeTarget, b.nativeTarget) && sameOriginalGetNativeCallee(a.nativeCallee, b.nativeCallee) && sameOriginalGetNativeField(a.nativeField, b.nativeField) && a.slot == b.slot && a.intrinsicPrototype == b.intrinsicPrototype && a.receiverKind == b.receiverKind && a.generation == b.generation && a.pending == b.pending && len(a.population) == len(b.population) && operationPrefix(a.population, b.population, sameOperationRequest)
}

// Pending/population refinement requires a fresh original event. Provider-only
// refinement may follow existing child descriptions while retaining that event,
// its population and pending status. Consumers preserve immutable factory
// identity and the original required child; DATA snapshots remain independent.
func sameOriginalGetMutationIdentity(a, b *sourceOriginalGetMutationSource) bool {
	if a == nil || b == nil {
		return a == b
	}
	ac, bc := *a, *b
	ac.pending, bc.pending = false, false
	ac.population, bc.population = nil, nil
	ac.providers, bc.providers = nil, nil
	ac.upstreamBodies, bc.upstreamBodies = nil, nil
	return sameOriginalGetMutationSource(&ac, &bc)
}
func originalGetMutationRefinementAllowed(a, b *sourceOriginalGetMutationSource) bool {
	return sameOriginalGetMutationIdentity(a, b) && (a == nil || (a.pending || !b.pending) && operationPrefix(a.population, b.population, sameOperationRequest) && operationPrefix(a.providers, b.providers, originalGetMutationProviderRefinement) && operationPrefix(a.upstreamBodies, b.upstreamBodies, sameStagedMemberFieldBody))
}

// validOriginalGetMutationSource checks descriptive correspondence only. Its
// consumers must additionally require this work's genuine publication event,
// every source child and every actual getter/BODY/RHS DATA contribution.
func validOriginalGetMutationSource(s *sourceOriginalGetMutationSource) bool {
	if s == nil || s.generation == nil || s.request.producer.operation == nil || s.request.producer.declaration == nil || s.request.consumer == nil || s.operation == nil || s.origin == nil || s.property == "" || s.request.inputs != nil || !sourceStagedOccurrenceOwned(s.operation, s.request.producer.declaration) || s.queryCut.operation != s.operation || s.queryCut.invoking != s.request.cut.invoking || s.queryCut.returning != s.request.cut.returning {
		return false
	}
	if !validStagedMemberFieldBodies(s.upstreamBodies, s.request, s.queryCut, s.generation, originalGetMutationUpstreamRequirements(s)) {
		return false
	}
	if !validOriginalGetMutationProviders(s) {
		return false
	}
	if s.intrinsicField != nil {
		return validOriginalIntrinsicFieldMutationSource(s)
	}
	if s.nativeField != nil {
		return validOriginalFieldMutationSource(s)
	}
	if s.nativeCallee != nil {
		return validOriginalCalleeGetMutationSource(s)
	}
	if s.record != nil {
		return validOriginalRecordGetMutationSource(s)
	}
	if s.ownMember != nil {
		return validOriginalOwnGetMutationSource(s)
	}
	if s.mode != accessorAcquire || s.standard == nil || s.kind == 0 || !standardLibrarySource(ast.GetSourceFileOfNode(s.standard)) {
		return false
	}
	if s.intrinsicPrototype {
		if s.slot != 0 || s.receiverKind != sourceNativeObjectConstructor || s.kind != sourceNativeObjectPrototype || s.property != "prototype" {
			return false
		}
	} else if s.slot == 0 {
		return false
	}
	if s.nativeTarget != nil {
		return validOriginalGetNativeTarget(s)
	}
	if s.operation != s.request.producer.operation || !sameOperationRequest(s.coverage, stagedMemberCoverageRequest(s.request, s.origin, s.queryCut)) {
		return false
	}
	for _, child := range s.population {
		if child.consumer != s.request.consumer || child.producer.operation == nil || child.producer.declaration == nil {
			return false
		}
	}
	return true
}

// describeOriginalGetMutationSource is called only inside the real Get's
// existing reader/source interval, before early source transfer can return.
// Discovery retains a conditional noninvoking arm and the exact modeled
// population; no pending alternative is relabeled external or silently paid.
func (q *sourceValueQuery) describeOriginalGetMutationSource(get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, origin *ast.Node, projection []string, name string, standard *sourceValue) (*sourceOriginalGetMutationSource, bool) {
	if q == nil {
		return nil, false
	}
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || q.owner == nil || q.executable == nil || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || mode != accessorAcquire || standard == nil || standard.native == nil || standard.node == nil || b.coverage == nil || b.coverage.origin != origin || b.coverage.cut != q.relativeInputCut(get.operation) || get.hasOnly || get.operation != b.request.producer.operation {
		return nil, false
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return nil, false
	}
	slot := standardNativeDataSlot(get.receiver, key)
	prototype := q.stagedTargetAcquisition() && get.receiver.native != nil && get.receiver.native.kind == sourceNativeObjectConstructor && standard.native.kind == sourceNativeObjectPrototype && key == "prototype"
	if slot == 0 && !prototype {
		return nil, false
	}
	var receiverKind sourceNativeKind
	if get.receiver.native != nil {
		receiverKind = get.receiver.native.kind
	}
	s := &sourceOriginalGetMutationSource{operation: get.operation, slot: slot, intrinsicPrototype: prototype, receiverKind: receiverKind, mode: mode, request: b.request, coverage: b.coverage.request, queryCut: q.relativeInputCut(get.operation), origin: origin, property: key, standard: standard.node, kind: standard.native.kind, generation: b.generation, population: originalGetMutationCoveragePopulation(b.coverage), upstreamBodies: cloneStagedMemberFieldBodies(b.coverage.fieldBodies), pending: !b.indexed || !b.represented || standard.native.referencesIncomplete || !originalGetMutationCoveragePartitionComplete(b.coverage)}
	if !validOriginalGetMutationSource(s) {
		return nil, false
	}
	return s, true
}

// originalGetMutationRequest is a distinct SOURCE-output role of the SAME
// original Get. It neither replaces its Effects request nor certifies that Get.
func originalGetMutationRequest(s *sourceOriginalGetMutationSource) sourceStagedOperationRequest {
	request := s.request
	request.producer.kind = relativeDemandDirectExposure
	request.producer.operation = s.operation
	request.producer.selector = sourceStagedOperationSelector{occurrence: s.request.producer.selector.occurrence, association: s.origin, field: fmt.Sprintf("original-get-mutation:%s:%s:%d", s.request.producer.selector.field, s.property, s.mode)}
	if s.nativeField != nil {
		// The operation is a shared native Call. Full original field and phase
		// domains belong in the producer key, not only the subscriber edge.
		h := s.nativeField
		request.producer.selector.field = fmt.Sprintf("original-get-mutation:native-field:%#v:%d:%d:%#v:%#v", h.field, h.ordinal, h.phase, h.queryCut, h.physicalCut)
	}
	if s.intrinsicField != nil {
		h := s.intrinsicField.header
		request.producer.selector.field = fmt.Sprintf("original-get-mutation:intrinsic-field:%#v:%d:%d:%#v:%#v", h.field, h.ordinal, h.phase, h.queryCut, h.physicalCut)
	}
	request.edge += ":" + request.producer.selector.field
	request.reading = s.request.producer
	return request
}

func validOriginalGetMutationRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.memberSource
	if source == nil || source.originalGetMutation == nil || source.originalGetMutationInterest != nil || !validOriginalGetMutationSource(source.originalGetMutation) || source.generation != source.originalGetMutation.generation || !sameOperationRequest(source.parent, source.originalGetMutation.request) || !sameOperationRequest(source.request, originalGetMutationRequest(source.originalGetMutation)) || recipe.key != source.request.producer || recipe.nativeGet != nil || recipe.callResult != nil || recipe.mutationData != nil || recipe.installedMutationRHS != nil || source.getEffects != nil || source.coverage != nil || source.call != nil || source.protocolSource != nil || source.reflectiveContribution != nil || source.descriptorStrong != nil || source.targetSource != nil || source.writeEffects || source.nativeWriter != nil || source.globalWrite != nil || source.hasFreshTarget != nil || len(recipe.delta.exposures)+len(recipe.delta.residuals)+len(recipe.delta.effects)+len(recipe.delta.invoked)+len(recipe.delta.relative) != 0 || source.installedCallSelection != nil || source.installedMember != nil || source.frameworkRead != nil || source.extraction != nil || source.moduleExcluded != nil || len(source.moduleImports) != 0 || len(source.values) != 0 || source.candidate.operation != nil || source.candidate.origin != nil || source.candidate.region != nil || source.candidate.request.producer.operation != nil || recipe.installedCall != nil || recipe.installedMember != nil || recipe.descriptorSource != nil || recipe.descriptorTarget != nil || recipe.frameworkEffects != nil || recipe.moduleArgument != nil || recipe.entryLaw != nil || recipe.assignment != nil || recipe.declarationCall != nil || recipe.constructionEffects != nil || recipe.hasInstance != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	s := source.originalGetMutation
	// Local extraction is provider-description enumeration only. Every actual
	// provider DATA/BODY/RHS and its closure remain separately required.
	if len(s.providers) != len(s.population) || recipe.delta.extracted != originalGetMutationDescriptionComplete(s) || !validOriginalGetMutationRequirements(s, recipe.delta.required) {
		return false
	}
	return true
}

func (work *callableEffectWork) originalGetMutationCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validOriginalGetMutationRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !recipe.memberSource.generation.active || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	s := recipe.memberSource.originalGetMutation
	registered, present := work.operationRecipes[recipe.key]
	if !present || !validOriginalGetMutationRecipe(registered) || !sameOriginalGetMutationSource(registered.memberSource.originalGetMutation, s) || !work.originalGetMutationProvidersCurrent(s) {
		return false
	}
	if s.intrinsicField != nil {
		return work.originalIntrinsicFieldMutationCurrent(s)
	}
	if s.nativeField != nil {
		return work.originalFieldMutationCurrent(s)
	}
	if s.nativeCallee != nil {
		return work.originalCalleeGetMutationCurrent(s)
	}
	if s.record != nil {
		return work.originalRecordGetMutationCurrent(s)
	}
	if s.ownMember != nil {
		return work.originalOwnGetMutationCurrent(s)
	}
	if s.nativeTarget != nil {
		return work.originalGetTargetMutationCurrent(s)
	}
	coverage := work.operationRecipes[s.coverage.producer]
	return validStagedMemberCoverageRecipe(coverage) && coverage.memberSource.generation == work.operationGeneration && sameOperationRequest(coverage.memberSource.request, s.coverage) && coverage.memberSource.coverage.origin == s.origin && coverage.memberSource.coverage.cut == s.queryCut && sameOriginalGetMutationCoveragePartition(s, coverage.memberSource.coverage)
}

// publishOriginalGetMutationSource receives only an actual Get's synchronous
// SOURCE event. It uses the existing registry, adoption and subscriber queue;
// a recipe or cloned data-slot description cannot manufacture this event.
func (work *callableEffectWork) publishOriginalGetMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, origin *ast.Node, projection []string, name string, standard *sourceValue, ownMembers ...*ast.Node) bool {
	if len(ownMembers) != 0 {
		return work.publishOriginalOwnGetMutationSource(facts, q, get, ownMembers[0], mode)
	}
	if q != nil && q.originalGetMutationTarget != nil {
		return work.observeOriginalTargetGetMutation(q, get, cut, mode, origin, projection, name, standard)
	}
	s, issued := q.describeOriginalGetMutationSource(get, cut, mode, origin, projection, name, standard)
	if !issued || s.generation != work.operationGeneration {
		return false
	}
	// Native callee SOURCE belongs to this original Get, not a map/field
	// source-request lease. Its owner publishes an early coverage description
	// without certifying the finishing Get or importing the full Call output.
	if callee, issued := work.describeOriginalNativeCalleeGetMutationSource(facts, q, get, cut, s); issued {
		return work.publishOriginalNativeCalleeGetMutationSource(facts, q, get, cut, callee)
	}
	if !q.publishStagedMemberDispositionPhase(get, cut, stagedMemberSourceRequest) || !q.liveStagedMemberSource(q.stagedMember, get, cut) || q.relativeInputCut(get.operation) != s.queryCut {
		return false
	}
	if !work.registerOriginalGetMutationSource(facts, s) {
		return false
	}
	work.bindOriginalGetMutationInterests(facts, q, get, cut, s)
	// The same real standard Get can describe its callee-only output scope.
	// Generic full-Call SOURCE remains separate and keeps all original debt.
	if callee, issued := work.describeOriginalNativeCalleeGetMutationSource(facts, q, get, cut, s); issued && work.originalNativeCalleeGetMutationPublicationOwned(q, get, cut, callee) {
		if work.registerOriginalGetMutationSource(facts, callee) {
			work.bindOriginalGetMutationInterests(facts, q, get, cut, callee)
		}
	}
	return true
}

func originalGetMutationRequirements(s *sourceOriginalGetMutationSource) []sourceStagedOperationRequest {
	// Record requests describe the lexical Get; its real Effects role owns debt.
	required := []sourceStagedOperationRequest{originalGetMutationReader(s)}
	if s.intrinsicField != nil {
		for _, child := range originalIntrinsicFieldMutationRequirements(s) {
			required = appendEntryLawRequirement(required, child)
		}
	}
	for _, provider := range s.providers {
		required = appendEntryLawRequirement(required, provider.candidate)
		if provider.reader.producer.operation != nil {
			required = appendEntryLawRequirement(required, provider.reader)
			if provider.data.producer.operation != nil {
				required = appendEntryLawRequirement(required, provider.data)
			}
		}
	}
	for _, upstream := range s.upstreamBodies {
		required = appendEntryLawRequirement(required, upstream.request)
	}
	if s.record != nil {
		required = appendEntryLawRequirement(required, descriptorRecordGetEffectsRequest(s.request))
		required = appendEntryLawRequirement(required, s.record.view.delivery)
	}
	if s.nativeTarget != nil {
		root := &sourceStagedNativeGetSource{request: s.nativeTarget.root, get: s.nativeTarget.root.producer.operation.Expression()}
		required = appendEntryLawRequirement(required, nativeRootDebtRequest(root, "callee-get"))
	}
	if s.coverage.producer.operation != nil {
		required = append(required, s.coverage)
	}
	return required
}

// The authenticated requirements are a finite set. Their stored order follows
// first publication, so a later provider refinement can only append new debt.
func validOriginalGetMutationRequirements(s *sourceOriginalGetMutationSource, required []sourceStagedOperationRequest) bool {
	allowed := originalGetMutationRequirements(s)
	if len(required) != len(allowed) {
		return false
	}
	for index, request := range required {
		if !operationContainsRequest(allowed, request) || operationContainsRequest(required[:index], request) {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) registerOriginalGetMutationSource(facts []callableFacts, s *sourceOriginalGetMutationSource) bool {
	s = cloneOriginalGetMutationSource(s)
	s.providers = work.describeOriginalGetMutationProviders(s)
	request := originalGetMutationRequest(s)
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: s.request, generation: s.generation, originalGetMutation: s}, delta: sourceStagedOperationDelta{extracted: originalGetMutationDescriptionComplete(s), required: originalGetMutationRequirements(s)}}
	if !validOriginalGetMutationRecipe(recipe) {
		return false
	}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if prior.memberSource == nil || !originalGetMutationRefinementAllowed(prior.memberSource.originalGetMutation, s) {
			return false
		}
		// Preserve the old ordered prefix; newly described provider inputs may
		// otherwise appear between requirements already observed by readers.
		required := append([]sourceStagedOperationRequest(nil), prior.delta.required...)
		for _, request := range recipe.delta.required {
			required = appendEntryLawRequirement(required, request)
		}
		recipe.delta.required = required
		if !validOriginalGetMutationRecipe(recipe) || !work.attachOperationSource(facts, recipe) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	// Discovery publishes a description. Only an actual mutation-DATA demand
	// adopts this role; unused unsupported outputs must not block Effects.
	id, adopted := work.operationIDs[request.producer]
	if !adopted {
		return true
	}
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	work.attachSourceObservationDependencies(facts, id)
	if work.originalGetMutationCurrent(recipe) {
		work.publishMemberSourceContributions(id)
	}
	return true
}

// refineOriginalGetMutationProviders advances only a currently observed SOURCE's
// previously unsupported provider descriptions. It preserves the genuine Get
// stamp, population and pending status; a dependency retry is not a new event.
// Existing source attachment owns monotone membership enrollment/publication.
// DATA/BODY, subscriber APPLIED and closure are still independently required.
func (work *callableEffectWork) refineOriginalGetMutationProviders(facts []callableFacts, id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	if state.invalid || !state.dependenciesRegistered || state.delta.extracted {
		return false
	}
	prior := work.operationRecipes[state.key]
	if prior.memberSource == nil || prior.memberSource.originalGetMutation == nil || prior.delta.extracted {
		return false // Never grow a sealed local description.
	}
	s := prior.memberSource.originalGetMutation
	unsupported := false
	for _, provider := range s.providers {
		unsupported = unsupported || provider.kind == originalGetMutationProviderUnsupported
	}
	if !unsupported || !work.originalGetMutationCurrent(prior) {
		return false // Registration or a clone cannot replace the original observation.
	}
	next := cloneOriginalGetMutationSource(s)
	next.providers = work.describeOriginalGetMutationProviders(s)
	if sameOriginalGetMutationSource(s, next) || !originalGetMutationRefinementAllowed(s, next) {
		return false
	}
	recipe := prior
	recipe.memberSource = cloneStagedMemberSource(prior.memberSource)
	recipe.memberSource.originalGetMutation = next
	recipe.delta = cloneOperationDelta(prior.delta)
	recipe.delta.extracted = originalGetMutationDescriptionComplete(next)
	for _, request := range originalGetMutationRequirements(next) {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, request)
	}
	if !validOriginalGetMutationRecipe(recipe) || !work.attachOperationSource(facts, recipe) {
		return false
	}
	// Attachment can adopt child operations and move the operations slice.
	// Reborrow by id and let the existing dependency owner install retry wakes.
	work.attachSourceObservationDependencies(facts, id)
	return true
}

func (q *sourceValueQuery) publishOriginalGetMutationSource(get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, origin *ast.Node, projection []string, name string, standard *sourceValue, ownMembers ...*ast.Node) {
	if q == nil || q.executable == nil || q.owner == nil {
		return
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.workRegistrar == nil || publisher.workRegistrar.originalGetMutation == nil {
		return
	}
	publisher.workRegistrar.originalGetMutation(q, get, cut, mode, origin, projection, name, standard, ownMembers...)
}

// originalGetMutationData exposes only this actual role's applied SOURCE
// prefix. Dependency closure and mutation-output completeness stay separate.
func (work *callableEffectWork) originalGetMutationData(s *sourceOriginalGetMutationSource) (sourceStagedOperationDelta, bool) {
	if s == nil {
		return sourceStagedOperationDelta{}, false
	}
	request := originalGetMutationRequest(s)
	recipe := work.operationRecipes[request.producer]
	id, adopted := work.operationIDs[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.originalGetMutationCurrent(recipe) || !sameOriginalGetMutationIdentity(recipe.memberSource.originalGetMutation, s) {
		return sourceStagedOperationDelta{}, false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if state.invalid || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.applied != state.revision {
		return sourceStagedOperationDelta{}, false
	}
	return cloneOperationDelta(state.delta), true
}

// originalGetMutationSourceFor uses the current canonical fact's already-owned
// descriptions. It does not discover another file/population or query a value.
// Several per-use descriptions must agree; ambiguous context stays pending.
func (work *callableEffectWork) originalGetMutationSourceFor(facts []callableFacts, operation, region *ast.Node) (*sourceOriginalGetMutationSource, bool) {
	actor, known := work.memberNodes[region]
	if !known || actor < 0 || actor >= len(facts) {
		return nil, false
	}
	var found *sourceOriginalGetMutationSource
	for _, recipe := range facts[actor].staged.operationRecipes {
		if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil || !work.originalGetMutationCurrent(recipe) {
			continue
		}
		source := recipe.memberSource.originalGetMutation
		if source.nativeField != nil || source.intrinsicField != nil {
			continue // Phase consumers use their exact field/member identity, never an AST-only lookup.
		}
		op := source.operation
		// A callee-only lookup consumes only the disjoint observed Get scope.
		// The generic Call description cannot pay that narrower output role.
		if source.nativeCallee != nil {
			if source.nativeCallee.get != operation {
				continue
			}
		} else if ast.IsCallExpression(op) && op.Expression() == operation {
			continue
		}
		if source.nativeCallee == nil && op != operation && (!ast.IsCallExpression(op) || op.Expression() != operation) {
			continue
		}
		if found != nil && !sameOriginalGetMutationSource(found, source) {
			return nil, false
		}
		found = source
	}
	return found, found != nil
}
