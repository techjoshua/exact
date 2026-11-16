package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeGetSource is a detached conditional source relationship.
// Only the original member owner constructs it. The standard branch is possible,
// independently of whether own writers replace it. None of its prerequisites is
// settled by retaining that branch. No query, binding map or acquisition survives.
type sourceStagedNativeGetSource struct {
	effectsSource *sourceStagedNativeEffectsRequest // Root-only original Effects demand; no current Get.

	request           sourceStagedOperationRequest
	get               *ast.Node
	getContributions  sourceStagedOperationRequest
	memberSources     []sourceStagedOperationRequest    // finite source coverage, not selected values
	callAlternatives  sourceStagedOperationRequest      // actual nonnative Call alternatives
	observerInputs    []sourceStagedNativeObserverInput // Exact native observer input reader associations.
	selectionRequired []sourceStagedOperationRequest    // Exact source prerequisites actually consumed by complete callee selection.
	callResults       []sourceStagedOperationRequest    // demanded source data, never callee/category completion
	calleeEntry       *sourceStagedNativeCalleeEffects  // current graph original callee event, cleared on clone
	kind              sourceNativeKind
	method            *ast.Node                          // original selected standard declaration, not a signature inference
	input             *sourceStagedNativeInputPlan       // selected input association, not a result
	descriptorRead    *sourceStagedDescriptorRetrieval   // Original two-actual descriptor retrieval relation, not output.
	inputInvocation   *sourceStagedNativeInputInvocation // independent direct-input Call disposition
	targetSource      sourceStagedOperationRequest       // conditional target creator, never a current value
	targetBinding     *ast.Node                          // original immutable local declaration, if target is a local read
	eagerSources      []sourceStagedOperationRequest
	inputSource       sourceStagedOperationRequest   // original child input Effects, never a returned value
	prototype         *sourceStagedCreatePrototype   // conditional source association, not object identity
	coercions         []sourceRelativeCoercion       // represented ToString input roles, not callable invocations
	activationImports []sourceStagedActivationImport // selected no-entry import dependencies, not initializer effects
	moduleSources     []sourceStagedModuleInput      // selected source initialization dependencies, never acquired values
	keySources        []sourceStagedKeySource        // original primitive-category requirements, not key identities
	inputEffects      bool                           // input Effects independently represented
	createTarget      bool                           // Original Create-shaped target ticket, not selection or execution authority.
	eager             *sourceStagedNativeEagerInputs
	installation      *sourceStagedNativeInstallation   // conditional original source endpoints, never a performed write
	standard          sourceDemandStandardPremises      // conditional intrinsic relationship, not source preservation
	descriptorEntry   *sourceStagedMapEntryContribution // original map entry Get, not target/result identity
	descriptorMap     *sourceStagedNativeDescriptorMapPlan
	mapTargetEffects  bool      // original selected ordinary target definition Effects
	descriptorGet     *ast.Node // only attached by the synchronous selected algorithm admission
}

// Native parents retain an original observer description before their genuine
// native root exists. It is an association, not selected algorithm authority.
type sourceStagedNativeObserver struct {
	request sourceStagedOperationRequest
	get     *ast.Node
	cut     sourceRelativeCut
}

// sourceStagedNativeGetBorrow belongs to this synchronous callee traversal only.
// Its callback registers detached requirements before the original member owner
// starts inventory. It does not skip inventory or publish selection closure.
type sourceStagedNativeGetBorrow struct {
	entry                        *sourceStagedNativeEntryAcquisition
	entryRequired, entryObserved []sourceStagedOperationRequest
	entryRefused                 bool
	effectsIssuer                *sourceStagedNativeEffectsIssuer
	effectsGet                   *sourceGetInputs // Synchronous original selected-branch publisher only.

	observation       *sourceStagedNativeObservation
	sourceWork        *callableEffectWork
	sourceEpoch       *sourceStagedOperationEpoch
	observations      []sourceStagedOperationRequest
	selectionRequired []sourceStagedOperationRequest
	bindInput         func(*sourceWriterInputRequest)
	consumeInput      func(*sourceWriterInputRequest) sourceStagedWriterCallDisposition
	getRequest        sourceStagedOperationRequest
	argumentIssuer    *sourceStagedNativeArgumentIssuer  // Scoped original child-callee acquisition only.
	eagerAdmission    *sourceStagedNativeEagerAdmission  // Only successful original input callback.
	inputSelection    *sourceStagedNativeSelection       // synchronous selected-algorithm event only
	inputInvocation   *sourceStagedNativeInputInvocation // detached admission from this original traversal
	observedGet       *sourceGetInputs                   // synchronous complete callee event only
	observedCallee    *sourceStagedNativeCalleeEffects
	issuer            *sourceValueQuery
	owner             *sourceValueOwner
	generation        *projectGeneration
	call              *ast.Node // original receiver/callee evaluation, before actual arguments
	entries           []sourceStagedNativeEntry
	activationImports []sourceStagedActivationImport
	publish           func(*sourceValueQuery, *sourceGetInputs, *sourceValue, []string, string, sourceValueBindings)
	finish            func(*sourceValueQuery, *sourceGetInputs, *sourceValue, *accessorCandidates)
	memberSources     []sourceStagedOperationRequest
	dataBranch        bool
	finishing         bool
	sourceObserved    bool // query-local original Get end event, never a selected callee proof.
	resultPending     bool // exact original source result obligation was registered
	symbolInput       bool // Original one-input Symbol algorithm, never exposure mode.
	createInput       bool // Scoped original create algorithm acquisition, distinct from direct exposure.
	canonical         bool // This original Get was requested without application input substitutions.
	contextual        bool // Actual binding substitutions remain an unmigrated callee domain.
	writerDependent   bool // Writer input/capture transfer remains a separate unmigrated producer.
	legacyPrepared    bool // The covered callee slice cannot depend on recursive invocation preparation.
}

// beginStagedNativeGetSource connects the original member producer to the work
// queue. Callers must keep the legacy path until algorithm, Get/own-writer and
// eager-input contributions are independently owned. The current source boundary
// registers all three dispositions pending. Only their independent source
// owners can settle them. An unknown prefix cannot supply that settlement.
func (query *sourceValueQuery) beginStagedNativeGetSource(work *callableEffectWork, facts []callableFacts, request sourceStagedNativeRequest, consumers ...sourceStagedNativeAlgorithmConsumer) (func(), bool) {
	if len(consumers) > 1 || query == nil || work == nil || query.owner == nil || !query.dependenciesOnly || query.operation != nil || query.inputs != nil || request.call == nil || !ast.IsCallExpression(request.call) || request.get != request.call.Expression() || (!ast.IsPropertyAccessExpression(request.get) && !ast.IsElementAccessExpression(request.get)) || request.request.consumer != query.effectOwner || request.request.producer.declaration != query.effectOwner || request.request.producer.operation != request.call || request.request.producer.kind != relativeDemandEffects || request.request.producer.selector != (sourceStagedOperationSelector{}) || request.request.inputs != nil || request.request.use != request.call || request.request.edge == "" || request.request.cut != (sourceRelativeCut{operation: request.call, use: request.call, reading: request.call}) {
		return func() {}, false
	}
	if work.operationGeneration != nil && work.operationGeneration != query.owner.generation {
		return func() {}, false
	}
	work.operationGeneration = query.owner.generation
	if request.occurrence != nil {
		if request.occurrence.work != nil {
			return func() {}, false
		}
		request.occurrence.work, request.occurrence.generation = work, query.owner.generation
	}
	// This validated original interval may issue evidence before an operation
	// is adopted. Its borrow must snapshot the graph identity that adoption uses.
	work.initializeOperationIdentity()
	owner, generation := query.owner, query.owner.generation
	cut, binding := query.relativeInputCut(request.call), query.normalBindingCall
	prior := query.stagedNativeGet
	borrow := &sourceStagedNativeGetBorrow{effectsIssuer: request.effectsIssuer, sourceWork: work, sourceEpoch: work.operationEpoch, observation: request.observation, getRequest: request.request, issuer: query, owner: owner, generation: generation, call: request.call, symbolInput: request.algorithmKind == sourceNativeSymbolFor, createInput: request.algorithmKind == sourceNativeObjectCreate}
	live := true
	receiver, field := accessorReceiver(request.get)
	relative := query.definitionWriteInventoryContext() && query.normalBindingCall == nil && len(query.creators) == 0 && sourceStagedOccurrenceOwned(request.call, request.request.producer.declaration)
	for _, active := range query.active {
		relative = relative && !active
	}
	borrow.publish = func(issuer *sourceValueQuery, get *sourceGetInputs, standard *sourceValue, projection []string, name string, bindings sourceValueBindings) {
		if !live || issuer != query || query.stagedNativeGet != borrow || query.owner != owner || owner.generation != generation || !query.dependenciesOnly || query.operation != nil || query.inputs != nil || query.effectOwner != request.request.consumer || query.normalBindingCall != binding || query.protectedMember != request.get || query.reading != cut.reading || query.initializing != request.call || query.returning != cut.returning || query.invoking != cut.invoking || query.effectUse() != cut.use || get == nil || get.operation != cut.reading || !standardNativeLookup(get) || standard == nil || standard.native == nil || len(standard.path) != 0 || get.receiver.native.acquired != receiver || field == "" || len(projection) != 1 || projection[0] != field || name != "" {
			return
		}
		if request.algorithmKind != 0 && request.algorithmKind != standard.native.kind {
			return
		}
		borrow.dataBranch = borrow.dataBranch || standardNativeDataSlot(get.receiver, field) != 0
		borrow.contextual = borrow.contextual || len(bindings) != 0
		borrow.canonical = relative && len(bindings) == 0
		// The receiver occurrence and field projection must belong to the original
		// Get. A wrapper initializer can acquire the same genuine method at an
		// earlier source occurrence without supplying this later callee selection.
		// The trusted standard-container owner supplies a conditional branch at
		// this actual Get, not a spelling/type match or a pristine-global proof.
		source := &sourceStagedNativeGetSource{request: request.request, get: request.get, kind: standard.native.kind, method: standard.node}
		if !work.registerNativeGetSource(facts, source, request.occurrence != nil) {
			return
		}
		// Reuse the sealed description, never a previous Get receipt. The live
		// callback above authenticated this original selected alternative again.
		source = work.operationRecipes[request.request.producer].nativeGet
		if !work.recordNativeScopeGetRequirements(facts, query, source) {
			return
		}
		if request.occurrence != nil {
			// This is the current original publisher, independently of whether
			// its input/result consumers can complete the source handoff.
			request.occurrence.source = source
		}
		request.argumentIssuer.observe(query, get, source, cut)
		work.recordNativeActivationImports(facts, source, borrow.activationImports)
		source = work.operationRecipes[request.request.producer].nativeGet
		// Reserve mutation-output interest while the actual selected Get owns
		// this interval. The later SOURCE publisher binds it; selection alone
		// grants neither output completeness nor a finished callee receipt.
		work.registerOriginalNativeCalleeGetMutationInterest(facts, query, source)
		if len(consumers) == 1 && consumers[0] != nil {
			query.consumeStagedNativeAlgorithm(source, request, *standard, consumers[0], work, facts)
		} else if source.kind == sourceNativeObjectFreeze && borrow.canonical && !borrow.contextual && !borrow.writerDependent && !borrow.legacyPrepared && request.observation == nil && query.normalBindingCall == nil && len(query.creators) == 0 && work.freezeReturnSourceRequested(source) {
			query.consumeStagedNativeAlgorithm(source, request, *standard, nil, work, facts)
		} else if source.kind == sourceNativeObjectDefineProperties && runtimeModuleEvaluation(source.request.consumer) && borrow.canonical && !borrow.contextual && !borrow.writerDependent && !borrow.legacyPrepared && request.observation == nil && query.relativeInputCut(request.call) == (sourceRelativeCut{operation: request.call, use: request.call, reading: request.call, initializing: request.call}) {
			// A cloned graph's original canonical Get owns fresh selected input
			// admission too. Its absent external descriptor consumer must not omit
			// this same-callback witness. No physical probe or function Get borrows it.
			query.consumeStagedNativeAlgorithm(source, request, *standard, nil, work, facts)
		}
		borrow.effectsGet = get
		work.registerNativeEffectsSource(facts, query, get, source, request.effectsIssuer)
		borrow.effectsGet = nil
	}
	borrow.finish = func(issuer *sourceValueQuery, get *sourceGetInputs, standard *sourceValue, result *accessorCandidates) {
		if !work.nativeEntryCoverageCurrent(query, borrow) {
			return
		}
		if !live || issuer != query || query.stagedNativeGet != borrow || query.owner != owner || owner.generation != generation || !query.dependenciesOnly || query.operation != nil || query.inputs != nil || query.effectOwner != request.request.consumer || query.normalBindingCall != binding || query.protectedMember != request.get || query.reading != cut.reading || query.initializing != request.call || query.returning != cut.returning || query.invoking != cut.invoking || query.effectUse() != cut.use || get == nil || get.operation != cut.reading || !standardNativeLookup(get) || standard == nil || standard.native == nil || len(standard.path) != 0 || get.receiver.native.acquired != receiver || !stagedNativeAlgorithmKind(standard.native.kind) {
			return
		}
		source := work.operationRecipes[request.request.producer].nativeGet
		if source == nil || source.kind != standard.native.kind || source.method != standard.node {
			return
		}
		borrow.sourceObserved = true
		borrow.finishing = true
		defer func() { borrow.finishing = false }()
		// The same real finishing Get transfers late SOURCE-scope requirements.
		// It grants only a pending Effects task, never physical/current Get proof.
		if !work.finishNativeScopePending(facts, query, get, standard, source) {
			return
		}
		if request.occurrence != nil && borrow.canonical && borrow.resultPending {
			request.occurrence.source, request.occurrence.pendingResults = source, true
		}
		if borrow.canonical {
			id, requested := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
			if requested {
				work.operations[id.index].calleeSourceRequested = true
			}
		}
		// Both the selected-only and source-effects Get descriptions retain
		// every premise actually used during this original lookup.
		if !work.recordNativeSelectionRequirements(facts, source, borrow.selectionRequired) {
			return
		}
		if member := query.stagedMember; member != nil && !work.recordNativeSelectionRequirements(facts, source, member.selectionRequired) {
			return
		}
		source = work.operationRecipes[request.request.producer].nativeGet
		if !borrow.canonical || borrow.legacyPrepared || borrow.writerDependent || borrow.contextual {
			if borrow.canonical {
				work.admitNativeMemberSourceEffects(facts, query, source, result)
			}
			return
		}
		root := query.owner.checker.GetSymbolAtLocation(receiver)
		if root == nil || root.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(root.ValueDeclaration)) || !stagedNativeCalleeEffectsRepresented(*standard, result) {
			work.admitNativeMemberSourceEffects(facts, query, source, result)
			return
		}
		proof := sourceStagedNativeCalleeEffects{noUserEntry: stagedNativeGetNoUserEntry(*standard, result), request: nativeRootDebtRequest(source, "callee-get"), cut: query.relativeInputCut(request.call), method: standard.node, generation: query.owner.generation}
		if proof.generation == work.operationGeneration && validStagedNativeCalleeEffects(proof, source) {
			work.admitNativeMemberPopulation(facts, query, source, result, true)
			source = work.operationRecipes[request.request.producer].nativeGet
		}
		if !work.nativeEntryCoverageCurrent(query, borrow) {
			return
		}
		// Direct input invocation is a separate algorithm fact. Only this
		// complete original Get event can observe its earlier admission.
		if source.kind == sourceNativeObjectFreeze || source.kind == sourceNativeObjectCreate {
			previousGet, previousCallee := borrow.observedGet, borrow.observedCallee
			borrow.observedGet, borrow.observedCallee = get, &proof
			defer func() { borrow.observedGet, borrow.observedCallee = previousGet, previousCallee }()
			work.observeStagedNativeInputInvocation(facts, query, source, get, &proof)
		}
		if source.kind == sourceNativeObjectFreeze {
			work.finishFreezeReturnSource(facts, query, source, proof)
		}
		eagerWitness := work.finishNativeEagerObservation(query, source, proof, request.occurrence != nil)
		if request.occurrence != nil && eagerWitness != nil {
			request.occurrence.eagerIssuer, request.occurrence.eagerWitness = request.occurrence, eagerWitness
		}
		if proof.noUserEntry {
			work.recordStagedCalleeEntry(facts, source, proof)
		}
		if request.occurrence != nil {
			request.occurrence.source, request.occurrence.callee = source, &proof
		} else {
			work.admitNativeCalleeEffects(facts, source, proof)
		}
		// Only this actual successful finishing Get can retain the SOURCE-only
		// semantic readset. A wake/ACK cannot manufacture this observation.
		func() {
			previousGet, previousCallee := borrow.observedGet, borrow.observedCallee
			borrow.observedGet, borrow.observedCallee = get, &proof
			defer func() { borrow.observedGet, borrow.observedCallee = previousGet, previousCallee }()
			work.admitNativeScopeGet(facts, query, get, source, &proof)
		}()
		if request.descriptorTarget != nil && source.kind == sourceNativeObjectGetOwnPropertyDescriptor {
			work.captureDescriptorTargetGet(facts, query, source, get, *standard, proof, request.descriptorTarget)
		}
	}
	borrow.bindInput = func(r *sourceWriterInputRequest) {
		work.registerWriterSource(facts, query, r)
	}
	borrow.consumeInput = func(r *sourceWriterInputRequest) sourceStagedWriterCallDisposition {
		return work.consumeNativeObserverInput(facts, query, r)
	}
	query.stagedNativeGet = borrow
	revokeMember := func() {}
	revoke := func() {
		if live {
			revokeMember()
			live = false
			query.stagedNativeGet = prior
			borrow.publish, borrow.finish, borrow.entries, borrow.activationImports = nil, nil, nil, nil
			borrow.memberSources, borrow.finishing = nil, false
			borrow.observations, borrow.selectionRequired, borrow.bindInput, borrow.consumeInput = nil, nil, nil, nil
			borrow.inputSelection, borrow.inputInvocation, borrow.observedGet, borrow.observedCallee = nil, nil, nil, nil
			borrow.issuer, borrow.owner, borrow.generation, borrow.call = nil, nil, nil, nil
			borrow.eagerAdmission = nil
			borrow.sourceWork, borrow.sourceEpoch, borrow.observation = nil, nil, nil
			borrow.effectsIssuer, borrow.effectsGet = nil, nil
		}
	}
	if request.observation != nil && (!work.liveNativeSourceObservation(query, request.request, request.get, request.observation) || !work.reconnectNativeObserver(query, request.observation.coverage)) {
		revoke()
		return func() {}, false
	}
	var memberInstalled bool
	revokeMember, memberInstalled = work.beginStagedMemberWork(query, facts, request.request)
	if !memberInstalled {
		revoke()
		return func() {}, false
	}
	if len(consumers) == 1 && relative && runtimeModuleEvaluation(request.request.consumer) && cut.reading == request.call && cut.use == request.call && cut.initializing == nil && cut.returning == nil && cut.invoking == nil {
		work.invalidateNativeEagerWitness(request.request)
	}
	return revoke, true
}

func (query *sourceValueQuery) publishStagedNativeGetSource(get *sourceGetInputs, standard *sourceValue, projection []string, name string, bindings sourceValueBindings) {
	if query.stagedNativeGet != nil && query.stagedNativeGet.publish != nil {
		query.stagedNativeGet.publish(query, get, standard, projection, name, bindings)
	}
}

// publishStagedNativeEntrySource lends the conditional member branch at its
// original binder-owned entry, before acquiring that entry's global property.
// The latter traversal still owns replacement/getter alternatives and Effects;
// this event supplies neither a selected callee nor an acquired entry value.
func (query *sourceValueQuery) publishStagedNativeEntrySource(value sourceValue, bindings sourceValueBindings, result *accessorCandidates) {
	borrow := query.stagedNativeGet
	if !query.stagedCreateAcquisition() || query.owner == nil || query.owner.generation == nil || borrow == nil || borrow.issuer != query || borrow.owner != query.owner || borrow.generation != query.owner.generation || borrow.call == nil || borrow.call.Expression() != query.protectedMember || value.native == nil || value.native.kind != sourceNativeObjectConstructor {
		return
	}
	receiver, key := accessorReceiver(query.protectedMember)
	global, kind := query.nativeRootDeclaration(value.node)
	if global == nil || kind != sourceNativeObjectConstructor || receiver != value.native.acquired || key != "create" {
		return
	}
	origin, seed, known := query.nativeMemberSeed(value, key, nil, result)
	if !known || seed.native == nil || seed.native.kind != sourceNativeObjectCreate {
		return
	}
	_, incomplete := query.nativeSelectionSources(origin, result)
	seed.native.referencesIncomplete = value.native.referencesIncomplete || incomplete
	lookup := value
	get := &sourceGetInputs{operation: query.reading, receiver: value, lookupOwner: &lookup}
	if standardNativeLookup(get) {
		query.publishStagedNativeGetSource(get, &seed, []string{key}, "", bindings)
	}
}

// registerNativeGetSource creates required membership before inventory can
// recurse. These finite source roles are not descriptor-field keys. Algorithm
// and eager-input owners cannot pay the callee Get/own-writer obligation, and a
// field prefix cannot pay any of these debts. Pending records never auto-extract.
func (work *callableEffectWork) registerNativeGetSource(facts []callableFacts, source *sourceStagedNativeGetSource, registrationOnly ...bool) (registered bool) {
	defer func() {
		if registered {
			work.notifyNativeWriterSourceRequests(facts, source)
		}
	}()
	request := source.request
	root := sourceStagedOperationRecipe{key: request.producer, nativeGet: source}
	work.indexOperationSources(facts)
	if existing, found := work.operationRecipes[request.producer]; found {
		if !validNativeGetRecipe(existing) || !sameNativeGetSource(existing.nativeGet, source) {
			return false
		}
		for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
			debt, found := work.operationRecipes[nativeRootDebtRequest(source, role).producer]
			if !found || !validNativeGetRecipe(debt) || !sameNativeGetSource(debt.nativeGet, source) {
				return false
			}
		}
		if len(registrationOnly) == 1 && registrationOnly[0] {
			return true
		}
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
			return false
		}
		work.registerOperationDependencies(facts, work.operationIDs[request.producer])
		return true
	}
	for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
		required := request
		required.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: role}
		required.edge += ":" + role
		debt := sourceStagedOperationRecipe{key: required.producer, nativeGet: source}
		if !work.registerOperationRecipe(facts, debt) {
			return false
		}
		root.delta.required = append(root.delta.required, required)
	}
	if !work.registerOperationRecipe(facts, root) {
		return false
	}
	if len(registrationOnly) == 1 && registrationOnly[0] {
		return true // Relationships are registered. No consumer has adopted them yet.
	}
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
		return false
	}
	// Registration of every subscriber precedes returning to member inventory.
	for _, required := range root.delta.required {
		if _, ok := work.requireOperation(facts, required); !ok {
			return false
		}
	}
	return true
}

func validNativeGetRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source != nil && source.effectsSource != nil && !validNativeEffectsRequest(recipe) {
		return false
	}
	if source != nil && source.inputInvocation != nil {
		return validNativeInputInvocationRecipe(recipe)
	}
	if source == nil || source.kind == 0 || source.get == nil || source.request.producer.declaration == nil || source.request.producer.kind != relativeDemandEffects || source.request.producer.selector != (sourceStagedOperationSelector{}) || source.request.producer.operation == nil || !ast.IsCallExpression(source.request.producer.operation) || source.request.producer.operation.Expression() != source.get || recipe.key.declaration != source.request.producer.declaration || recipe.key.operation != source.request.producer.operation || recipe.key.kind != relativeDemandEffects && recipe.key.kind != relativeDemandDirectExposure {
		return false
	}
	for _, input := range source.observerInputs {
		if !validNativeObserverInput(source, input) {
			return false
		}
	}
	if source.kind == sourceNativeObjectGetOwnPropertyDescriptor && (source.input != nil || source.inputInvocation != nil || source.descriptorMap != nil || source.descriptorGet != nil || source.descriptorEntry != nil || source.prototype != nil || source.installation != nil) {
		return false
	}
	if source.descriptorRead != nil && !validDescriptorRetrieval(source) {
		return false
	}
	selector := recipe.key.selector
	if recipe.key == nativeRootDebtRequest(source, "callee-get").producer && len(source.callResults)+len(source.memberSources)+len(source.selectionRequired) != 0 {
		count := len(source.callResults) + len(source.memberSources) + len(source.selectionRequired)
		if source.getContributions.producer.operation != nil {
			count++
		}
		if recipe.delta.extracted || operationDeltaSize(recipe.delta) != count {
			return false
		}
		return validNativeCalleeRequired(source, recipe.delta.required)
	}
	if source.descriptorRead != nil && (recipe.key == nativeRootDebtRequest(source, "algorithm").producer || recipe.key == nativeRootDebtRequest(source, "eager-inputs").producer) {
		return validDescriptorEffectsPhase(recipe)
	}
	if source.descriptorEntry != nil {
		return validStagedMapFieldRecipe(recipe)
	}
	if source.descriptorMap != nil && validNativeDescriptorMapRecipe(recipe) {
		return true
	}
	if recipe.key.kind == relativeDemandDirectExposure {
		return validNativeFieldExposureRecipe(recipe)
	}
	if selector == (sourceStagedOperationSelector{}) {
		if len(recipe.delta.required) != 3+nativeMemberCallRequirementCount(source) || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 {
			return false
		}
		for index, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
			expected := source.request
			expected.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: role}
			expected.edge += ":" + role
			if !sameOperationRequest(expected, recipe.delta.required[index]) {
				return false
			}
		}
		return nativeMemberCallRequirementCount(source) == 0 || sameOperationRequest(recipe.delta.required[3], source.callAlternatives) && sameOperationRequest(source.callAlternatives, nativeMemberAlternativeRequest(source, "callee-alternatives"))
	}
	if selector.occurrence == source.get && selector.field == "algorithm" && source.descriptorGet != nil {
		if len(recipe.delta.required) != len(reflectiveDescriptorKeys) || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 {
			return false
		}
		for index, field := range reflectiveDescriptorKeys {
			expected := source.request
			expected.producer.selector = sourceStagedOperationSelector{occurrence: source.descriptorGet, field: field}
			if !sameOperationRequest(expected, recipe.delta.required[index]) {
				return false
			}
		}
		return true
	}
	if source.descriptorGet != nil && selector.occurrence == source.descriptorGet && stagedDescriptorFieldIndex(selector.field) >= 0 {
		parent := source.request
		parent.producer = recipe.key
		roles, valid := fieldSourceRequests(parent)
		base := valid && !recipe.delta.extracted && len(recipe.delta.required) >= 2 && operationDeltaSize(recipe.delta) == len(recipe.delta.required) && sameOperationRequest(recipe.delta.required[0], roles.ownWriters) && sameOperationRequest(recipe.delta.required[1], roles.prototype)
		return base && (len(recipe.delta.required) == 2 || len(recipe.delta.required) == 3 && validStagedDescriptorReceiverRequirement(source, parent, recipe.delta.required[2]))
	}
	request := source.request
	request.producer = recipe.key
	if _, valid := fieldSourceParent(request); valid && selector.occurrence == source.descriptorGet {
		return len(recipe.delta.exposures)+len(recipe.delta.relative) == 0
	}
	if selector == nativeEagerTargetRequest(source).producer.selector {
		if source.targetSource.producer.operation != nil {
			return validNativeTargetSource(source) && len(recipe.delta.required) == 1 && operationDeltaSize(recipe.delta) == 1 && sameOperationRequest(recipe.delta.required[0], source.targetSource)
		}
		return !recipe.delta.extracted && operationDeltaSize(recipe.delta) == 0
	}
	if selector.occurrence != source.get {
		return false
	}
	if selector.field == "eager-inputs" && source.eager != nil && (len(source.eager.operations) != 0 || len(source.keySources) != 0 || source.targetSource.producer.operation != nil || source.eager.descriptorData.producer.operation != nil) {
		if !validStagedNativeEagerInputs(*source.eager, source) {
			return false
		}
		if !validNativeEagerSourcesPrefix(source) {
			return false
		}
		if !recipe.delta.extracted && len(source.eagerSources) == 0 && len(source.keySources) == 0 && operationDeltaSize(recipe.delta) == 0 {
			return true // Existing unissued target/child bootstrap description.
		}
		if recipe.delta.extracted && !validNativeEagerSources(source) {
			return false
		}
		expected := nativeEagerRequired(source)
		return len(recipe.delta.required) == len(expected) && operationDeltaSize(recipe.delta) == len(expected) && operationPrefix(recipe.delta.required, expected, sameOperationRequest)
	}
	if selector.field == "eager-inputs" && source.eager != nil && source.eager.targetPending {
		return !recipe.delta.extracted && (operationDeltaSize(recipe.delta) == 0 || len(recipe.delta.required) == 1 && operationDeltaSize(recipe.delta) == 1 && sameOperationRequest(recipe.delta.required[0], nativeEagerTargetRequest(source)))
	}
	if source.inputSource.producer.operation != nil {
		if selector.field == "algorithm" || selector.field == "eager-inputs" {
			return validStagedNativeInputSource(source) && len(recipe.delta.required) == 1 && operationDeltaSize(recipe.delta) == 1 && sameOperationRequest(recipe.delta.required[0], source.inputSource)
		}
	}
	if source.input != nil && source.input.bindingData.producer.operation != nil && (selector.field == "algorithm" || selector.field == "eager-inputs") {
		return validNativeInputBindingPhase(recipe)
	}
	if source.kind == sourceNativeSymbolFor && source.input != nil && validStagedNativeInputPlan(*source.input, source) && selector == nativeRootDebtRequest(source, "eager-inputs").producer.selector && len(source.coercions) != 0 {
		if !source.inputEffects || !recipe.delta.extracted || operationDeltaSize(recipe.delta) != len(source.coercions) || len(recipe.delta.effects) != len(source.coercions) {
			return false
		}
		for i, demand := range source.coercions {
			if !sameRelativeCoercion(recipe.delta.effects[i].relativeCoercion, &demand) || !validStagedCoercionEffect(recipe, recipe.delta.effects[i]) {
				return false
			}
		}
		return true
	}
	if operationDeltaSize(recipe.delta) != 0 {
		return false
	}
	if source.input != nil && validStagedNativeInputPlan(*source.input, source) {
		if selector.field == "algorithm" {
			return true // Explicit selected input-algorithm semantics, not empty-result inference.
		}
		if selector.field == "eager-inputs" && source.inputEffects {
			return true
		}
	}
	switch selector.field {
	case "callee-get":
		return !recipe.delta.extracted // Original Get completion is graph-local, not a cached query result.
	case "eager-inputs":
		return !recipe.delta.extracted || source.eager != nil && !source.eager.targetPending && validStagedNativeEagerInputs(*source.eager, source)
	case "algorithm":
		return !recipe.delta.extracted
	}
	return false
}

func sameNativeGetSource(a, b *sourceStagedNativeGetSource) bool {
	return a == b || a != nil && b != nil && a.get == b.get && a.kind == b.kind && a.method == b.method && sameOperationRequest(a.request, b.request)
}

func validNativeGetRequest(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if !validNativeGetRecipe(recipe) {
		return false
	}
	if request.reading.selector.field == "key-source" {
		source := recipe.nativeGet
		return source != nil && source.kind == sourceNativeSymbolFor && recipe.key == source.request.producer && request.producer == recipe.key && request.inputs == nil && request.edge != "" && request.consumer == request.reading.declaration && request.reading.kind == relativeDemandEffects && request.reading.operation != nil && request.reading.selector.occurrence != nil && request.use == source.request.use && request.cut == source.request.cut
	}
	if recipe.nativeGet.descriptorEntry != nil {
		return stagedMapFieldRequest(recipe, request)
	}
	if recipe.mapProtocol != nil {
		return sameOperationRequest(request, recipe.mapProtocol.request)
	}
	if plan := recipe.nativeGet.descriptorMap; plan != nil && recipe.key == plan.protocol.producer {
		return sameOperationRequest(request, plan.protocol)
	}
	if recipe.key == nativeEagerTargetRequest(recipe.nativeGet).producer {
		return sameOperationRequest(request, nativeEagerTargetRequest(recipe.nativeGet))
	}
	expected := recipe.nativeGet.request
	if recipe.key.kind == relativeDemandDirectExposure && request.reading != (sourceStagedOperationKey{}) {
		if request.reading.kind != relativeDemandEffects || request.reading.declaration != recipe.key.declaration || request.reading.operation != request.use || request.inputs != nil || request.consumer != recipe.key.declaration || request.cut != expected.cut || request.edge == "" {
			return false
		}
		expected.reading, expected.use, expected.edge = request.reading, request.use, request.edge
	}
	if recipe.key.selector != (sourceStagedOperationSelector{}) {
		expected.producer = recipe.key
		if recipe.key.selector.occurrence == recipe.nativeGet.get {
			expected.edge += ":" + recipe.key.selector.field
		}
	}
	return sameOperationRequest(expected, request)
}

// consumeStagedNativeAlgorithm delivers the actual selected value only while the
// original member owner is on the stack. Direct source vector extent is known
// here, but evaluating arguments and their effects remains independent work.
func (query *sourceValueQuery) consumeStagedNativeAlgorithm(source *sourceStagedNativeGetSource, request sourceStagedNativeRequest, selected sourceValue, consume sourceStagedNativeAlgorithmConsumer, work *callableEffectWork, facts []callableFacts) {
	arguments := restrictedInvocationArguments(request.call.AsCallExpression())
	if reflectiveNative(source.kind) && (len(arguments) != 3 || request.descriptorGet != arguments[2]) || (source.kind == sourceNativeObjectFreeze || source.kind == sourceNativeObjectCreate || source.kind == sourceNativeSymbolFor) && (len(arguments) != 1 || request.descriptorGet != nil) || (source.kind == sourceNativeObjectDefineProperties || source.kind == sourceNativeObjectGetOwnPropertyDescriptor) && (len(arguments) != 2 || request.descriptorGet != nil) || !stagedNativeAlgorithmKind(source.kind) {
		return
	}
	selection := sourceStagedNativeSelection{selected: selected, call: request.call, get: request.get, descriptorGet: request.descriptorGet, request: request.request}
	if request.argumentIssuer != nil {
		selection.argumentOrder = request.argumentIssuer.observed
		selection.argumentSource = request.argumentIssuer.description
	}
	for _, argument := range arguments {
		if ast.IsSpreadElement(argument) {
			return
		}
		selection.actuals = append(selection.actuals, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: argument, producer: request.call, cut: request.request.cut})
	}
	if source.kind == sourceNativeObjectGetOwnPropertyDescriptor {
		borrow := query.stagedNativeGet
		if borrow != nil {
			prior := borrow.inputSelection
			borrow.inputSelection = &selection
			work.admitDescriptorRetrieval(facts, query, source, &selection)
			borrow.inputSelection = prior
		}
	}
	if (source.kind == sourceNativeObjectFreeze || source.kind == sourceNativeObjectCreate) && query.stagedNativeGet != nil {
		// This selected algorithm does not directly Call its argument. Input
		// effects/Proxy protocols and successful completion remain separate.
		borrow := query.stagedNativeGet
		previous := borrow.inputSelection
		borrow.inputSelection = &selection
		defer func() { borrow.inputSelection = previous }()
		if source.kind == sourceNativeObjectFreeze {
			work.admitStagedNativeInputInvocation(facts, query, source, &selection)
		}
	}
	if source.kind == sourceNativeObjectDefineProperties {
		if work.nativeEagerInputObservationOwned(facts, query, source, selection) {
			// Only this authentic full canonical input event revokes old input
			// currency. Get-only physical probes and copied/foreign intervals cannot.
			work.invalidateNativeEagerWitness(source.request)
			query.stagedNativeGet.eagerAdmission = nil
		}
		work.admitNativeDescriptorMap(facts, source, selection, query.stagedStandardPrototype(selected), query.executable, func(fresh *sourceStagedNativeGetSource) {
			work.captureNativeEagerAdmission(facts, query, fresh, selection)
		})
	}
	if source.kind == sourceNativeSymbolFor {
		work.admitNativeSymbolInput(facts, source, selection, query.executable)
	}
	if source.kind == sourceNativeObjectFreeze || source.kind == sourceNativeObjectCreate {
		if work.admitNativeInputEffects(facts, source, selection, query.executable) && source.kind == sourceNativeObjectCreate {
			// Only the genuine prototype-owner admission above can authorize
			// this additional algorithm family; a selected prefix is not current.
			work.admitStagedNativeInputInvocation(facts, query, source, &selection)
		}
	}
	if source.kind == sourceNativeObjectFreeze {
		current := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet
		if current != nil {
			work.captureFreezeReturnSource(facts, query, current, selected)
		}
	}
	if source.kind == sourceNativeObjectCreate {
		// Existing descriptions are the waiting index. Publication refines only
		// this actual original producer; it executes no indexed Call or body.
		current := work.operationRecipes[source.request.producer].nativeGet
		var waiting []sourceStagedOperationRequest
		for _, recipe := range work.operationRecipes {
			if member := recipe.memberSource; member != nil && member.targetSource != nil && sameOperationRequest(member.targetSource.creating, source.request) {
				waiting = append(waiting, member.request)
			}
		}
		for _, request := range waiting {
			work.publishStagedReflectiveTargetSource(facts, query, request, current, &selection)
		}
	}
	if reflectiveNative(source.kind) {
		work.admitNativeEagerEffects(facts, source, selection, query.executable)
	}
	if consume == nil {
		return // Selected map input admission above grants no descriptor callback.
	}
	active := true
	defer func() { active = false }()
	owner, generation, cut, member, borrow := query.owner, query.owner.generation, query.relativeInputCut(request.call), query.protectedMember, query.stagedNativeGet
	checker, program, binding := owner.checker, owner.program, query.normalBindingCall
	standard := query.stagedStandardPrototype(selected)
	consume(selection, func(plan sourceStagedNativeDescriptorPlan) bool {
		if !active || query.owner != owner || owner.generation != generation || owner.checker != checker || owner.program != program || query.normalBindingCall != binding || query.effectOwner != source.request.consumer || query.relativeInputCut(request.call) != cut || query.protectedMember != member || query.stagedNativeGet != borrow || !query.dependenciesOnly || query.operation != nil || query.inputs != nil {
			return false
		}
		if !reflectiveNative(source.kind) {
			return false
		}
		return work.admitNativeDescriptor(facts, source, selection, plan, standard)
	})
	if reflectiveNative(source.kind) && query.stagedNativeGet != nil {
		issuer := query.stagedNativeGet.effectsIssuer
		if issuer.live() && issuer.work == work && sameOperationRequest(issuer.request, source.request) {
			current := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet
			if call, _ := nativeReflectiveTargetCall(current, query.executable); call != nil {
				work.describeNativeCreateTargetTicket(facts, current, call, query.executable)
			}
		}
	}
	if source.kind == sourceNativeObjectDefineProperty && query.stagedNativeGet != nil {
		// Only this original selected interval can issue the separate pending
		// mutation-output description. It acquires no operand and grants no Get
		// completion. The field's later original Has/Get owner supplies outputs.
		borrow := query.stagedNativeGet
		func() {
			previous := borrow.inputSelection
			borrow.inputSelection = &selection
			defer func() { borrow.inputSelection = previous }()
			work.observeNativeInstallationMutationSelection(facts, query, source, &selection, request.occurrence)
		}()
	}
}

// Algorithm admission remains capability-specific. A selected input operation
// cannot borrow descriptor field or normal-output authority from another owner.
func stagedNativeAlgorithmKind(kind sourceNativeKind) bool {
	return kind == sourceNativeObjectGetOwnPropertyDescriptor || kind == sourceNativeSymbolFor || reflectiveNative(kind) || kind == sourceNativeObjectDefineProperties || kind == sourceNativeObjectFreeze || kind == sourceNativeObjectCreate
}

// stagedCreateAcquisition opens only the original one-input algorithm's source
// selection. It never brands a value by type or upgrades exposure-only evidence.
func (query *sourceValueQuery) stagedCreateAcquisition() bool {
	return query != nil && query.dependenciesOnly && !query.probingDirectExposure && query.operation == nil && query.inputs == nil && query.stagedNativeGet != nil && query.stagedNativeGet.createInput
}

// stagedSymbolAcquisition is an original algorithm selection interval. Existing
// callable-exposure evidence cannot open it or publish primitive key coverage.
func (query *sourceValueQuery) stagedSymbolAcquisition() bool {
	if query == nil || !query.dependenciesOnly || query.probingDirectExposure || query.operation != nil || query.inputs != nil || query.owner == nil {
		return false
	}
	borrow := query.stagedNativeGet
	return borrow != nil && borrow.issuer == query && borrow.owner == query.owner && borrow.generation == query.owner.generation && borrow.symbolInput
}

// validNativeCalleeRequired accepts the original append order of independently
// issued DATA and member-source debts. Each role's sequence stays ordered;
// selection premises retain their existing order-independent, exact-once
// membership contract, and the single Get contribution may arrive between
// roles. No prefix is reordered and no unknown or duplicate full request is
// accepted. This checks a finite local envelope, never dependency readiness.
func validNativeCalleeRequired(source *sourceStagedNativeGetSource, required []sourceStagedOperationRequest) bool {
	if source == nil {
		return false
	}
	declared := append(append([]sourceStagedOperationRequest(nil), source.callResults...), source.memberSources...)
	dataEnd, memberEnd := len(source.callResults), len(declared)
	if source.getContributions.producer.operation != nil {
		declared = append(declared, source.getContributions)
	}
	declared = append(declared, source.selectionRequired...)
	if len(required) != len(declared) {
		return false
	}
	seen := make([]bool, len(declared))
	dataNext, memberNext := 0, dataEnd
	for _, request := range required {
		match := -1
		for i, description := range declared {
			if sameOperationRequest(request, description) {
				if match != -1 {
					return false
				} // Ambiguous duplicate across/within roles.
				match = i
			}
		}
		if match < 0 || seen[match] {
			return false
		}
		switch {
		case match < dataEnd:
			if match != dataNext {
				return false
			}
			dataNext++
		case match < memberEnd:
			if match != memberNext {
				return false
			}
			memberNext++
		}
		seen[match] = true
	}
	return dataNext == dataEnd && memberNext == memberEnd
}
