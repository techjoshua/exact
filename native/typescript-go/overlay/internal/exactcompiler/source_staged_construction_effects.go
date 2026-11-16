package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedConstructionEffects names original New Effects, independently of
// any allocated value, class/category result, integrity or normal completion.
type sourceStagedConstructionEffects struct {
	request, root sourceStagedOperationRequest
	phase         string
	generation    *projectGeneration
}

// The graph retains only detached original phase accounting. Fresh graphs must
// visit the source owner again. No selected sourceValue or binder is cached.
type sourceStagedConstructionObservation struct {
	root                   sourceStagedOperationRequest
	generation             *projectGeneration
	issuer                 *sourceStagedConstructionIssuer
	constructor, prototype *ast.Node
	cut                    sourceRelativeCut
	phases                 []sourceStagedOperationDelta
	prototypeGet           *sourceStagedConstructionPrototypeGet
	noUserEntry            bool // Independent actual callee/prototype DATA laws and the zero-input algorithm.
}

type sourceStagedConstructionIssuer struct {
	observation  *sourceStagedConstructionObservation
	prototypeGet *sourceStagedConstructionPrototypeGet
}

// A detached receipt of the actual complete original prototype Get. Its opaque
// issuer binds it to one graph observation. It contains no Get pointer, scope,
// selected value, normal completion, instance identity or integrity authority.
type sourceStagedConstructionPrototypeGet struct {
	request                                             sourceStagedOperationRequest
	operation, reference, receiver, acquired, prototype *ast.Node
	cut                                                 sourceRelativeCut
	generation                                          *projectGeneration
	issuer                                              *sourceStagedConstructionIssuer
}

// sourceStagedConstructionGetBorrow lends exactly one original New's prototype
// Get. The external and internal pointers expire together on synchronous exit.
type sourceStagedConstructionGetBorrow struct {
	issuer        *sourceValueQuery
	owner         *sourceValueOwner
	generation    *projectGeneration
	root          sourceStagedOperationRequest
	get, selected *sourceGetInputs
	receiver      sourceValue
	cut           sourceRelativeCut
	finished      bool
}

var stagedConstructionPhases = [...]string{"callee", "inputs", "prototype", "algorithm"}

func stagedConstructionRequest(root sourceStagedOperationRequest, phase string) sourceStagedOperationRequest {
	request := root
	if phase != "" {
		request.producer.selector = sourceStagedOperationSelector{occurrence: root.use.Expression(), field: "construction:" + phase}
		request.edge += ":" + phase
	}
	return request
}

func sameStagedConstructionEffects(a, b *sourceStagedConstructionEffects) bool {
	return a == b || a != nil && b != nil && a.phase == b.phase && a.generation == b.generation && sameOperationRequest(a.root, b.root) && sameOperationRequest(a.request, b.request)
}

func validStagedConstructionEffectsRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.constructionEffects
	if s == nil || s.generation == nil || !validStagedMemberParent(s.root) || !ast.IsNewExpression(s.root.use) || !sameOperationRequest(s.request, stagedConstructionRequest(s.root, s.phase)) || recipe.key != s.request.producer || recipe.assignment != nil || recipe.hasInstance != nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.callResult != nil || recipe.writer != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.constructed != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.fieldForwards)+len(recipe.constructedInputs)+len(recipe.constructedGroup) != 0 || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals)+len(recipe.delta.effects) != 0 {
		return false
	}
	known := s.phase == ""
	for _, phase := range stagedConstructionPhases {
		known = known || s.phase == phase
	}
	if !known {
		return false
	}
	if s.phase == "" {
		if len(recipe.delta.required) != len(stagedConstructionPhases) {
			return false
		}
		for i, phase := range stagedConstructionPhases {
			if !sameOperationRequest(recipe.delta.required[i], stagedConstructionRequest(s.root, phase)) {
				return false
			}
		}
	}
	for _, child := range recipe.delta.required {
		if child.inputs != nil || !validStagedConstructionRequired(child, s) {
			return false
		}
	}
	return true
}

// Required selectors normally retain their producer's graph cut. The two
// typed invocation readers instead subscribe this New's original C while their
// producer/Get cut stays on its semantic recipe. Shape grants no live receipt.
func validStagedConstructionRequired(request sourceStagedOperationRequest, context ...*sourceStagedConstructionEffects) bool {
	if request.edge == "" || request.inputs != nil || !sourceStagedOccurrenceOwned(request.producer.operation, request.producer.declaration) || request.producer.kind != relativeDemandEffects || request.use != request.producer.operation {
		return false
	}
	if request.reading == (sourceStagedOperationKey{}) && request.consumer == request.producer.declaration && request.cut == (sourceRelativeCut{operation: request.use, use: request.use, reading: request.use}) {
		return true
	}
	if len(context) != 1 || context[0] == nil {
		return false
	}
	source := context[0]
	root, call := source.root, request.producer.operation
	if source.phase != "callee" && source.phase != "prototype" || !validStagedMemberParent(root) || !ast.IsNewExpression(root.use) || !ast.IsCallExpression(call) || request.consumer != root.consumer || request.cut != root.cut || request.reading.declaration != root.producer.declaration || request.reading.operation != root.use || request.reading.kind != relativeDemandEffects || request.reading.selector.field != stagedMemberContextField(root, "member-source-set") || request.reading.selector.association == nil || request.reading.selector.occurrence != root.use && request.reading.selector.occurrence != root.use.Expression() {
		return false
	}
	field := request.producer.selector.field
	return (field == "callee-alternatives" || field == "direct-input-invocation") && request.producer.selector == (sourceStagedOperationSelector{occurrence: call.Expression(), field: field})
}

// constructionRequiredSourcesCurrent authenticates contextual reader factories
// against the existing original source observations. Cached descriptions and
// arbitrary Effects keys cannot pay a used invocation premise. No child closure
// is required here; every independent source ticket remains in the graph.
func (work *callableEffectWork) constructionRequiredSourcesCurrent(recipe sourceStagedOperationRecipe, admission ...bool) bool {
	source := recipe.constructionEffects
	if source == nil || source.generation != work.operationGeneration {
		return false
	}
	for _, request := range recipe.delta.required {
		child := work.operationRecipes[request.producer]
		if child.memberSource != nil && child.memberSource.targetSource != nil {
			if !validStagedConstructionRequired(request, source) || !work.stagedReflectiveTargetCurrent(request) || !sameOperationRequest(child.memberSource.targetSource.construction, source.root) {
				return false
			}
			continue
		}
		typed := child.memberSource != nil && child.memberSource.call != nil && len(child.memberSource.call.standard) != 0 || child.nativeGet != nil && child.nativeGet.inputInvocation != nil
		if !typed && validStagedConstructionRequired(request) {
			continue
		}
		if request.reading == (sourceStagedOperationKey{}) || !validStagedConstructionRequired(request, source) {
			return false
		}
		if request.producer.selector.field == "callee-alternatives" {
			if len(admission) == 1 && admission[0] && work.requestedMemberCallSupported(child) && work.acceptedStandardMemberCallReading(request) {
				continue
			}
			if !work.acceptedStandardMemberCallReading(request) || !child.delta.extracted || !child.memberSource.call.complete || work.memberCoverageObserved[child.key] != work.operationGeneration {
				return false
			}
		} else {
			described := len(admission) == 1 && admission[0] && work.requestedWriterSourceSupported(child) && work.describedNativeInputInvocationReading(request)
			if !described && !work.acceptedNativeInputInvocationReading(request) {
				return false
			}
			fullCall := false
			for _, required := range recipe.delta.required {
				fullCall = fullCall || sameOperationRequest(required, child.nativeGet.request)
			}
			if !fullCall {
				return false
			}
		}
		parent := work.operationRecipes[request.reading].memberSource
		if parent == nil || !sameOperationRequest(parent.parent, source.root) {
			return false
		}
	}
	return true
}

// prepareStagedConstructionSource serves a demanded original allocation before
// ordinary collection reaches New. The live fact publisher owns the conditional
// constructor source; passive phase registration grants no reached use or New
// result. A copied fact or another generation cannot borrow that publication.
func (work *callableEffectWork) prepareStagedConstructionSource(facts []callableFacts, site *ast.Node, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.values.program == nil || owner.values.generation == nil || site == nil || !ast.IsNewExpression(site) || work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return false
	}
	file := ast.GetSourceFileOfNode(site)
	if file == nil || file.IsDeclarationFile || owner.values.program.GetSourceFile(file.FileName()) != file || site.AsNewExpression().Arguments != nil && len(site.AsNewExpression().Arguments.Nodes) != 0 {
		return false
	}
	region := sourceStagedEvaluationOwner(site)
	if region == nil {
		region = sourceStagedModuleOwner(site)
	}
	consumer, known := work.memberNodes[region]
	if !known || consumer < 0 || consumer >= len(facts) || facts[consumer].node != region {
		return false
	}
	index := owner.values.index(file)
	occurrence := index.normalOccurrences[site]
	if index.incomplete || index.normalDynamicScope || occurrence == nil || occurrence.node != site || occurrence.region != sourceStagedEvaluationOwner(site) {
		return false
	}
	publisher := owner.pendingMemberPublishers[region]
	if publisher == nil || !publisher.live || publisher.fact != &facts[consumer] {
		return false
	}
	if _, registered := work.registerStagedConstructionEffects(facts, consumer, site, owner); !registered {
		return false
	}
	contribution, published := owner.standardConstructions[site]
	return published && contribution.site == site && contribution.owner == region && contribution.selectionComplete
}

// registerStagedConstructionEffects records original phase/source relationships
// only. In particular an enclosing Set input cannot refresh dependency owners,
// adopt an ordinary New use or recover a binder through this registration.
func (work *callableEffectWork) registerStagedConstructionEffects(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	root, registered := work.describeStagedConstructionEffects(facts, consumer, node, owner)
	if registered {
		work.observeStagedConstructionEffects(facts, root, owner)
	}
	return root, registered
}

// describeStagedConstructionEffects registers only the original phase factories.
// Source tasks may require these before observing New; no selection is issued.
func (work *callableEffectWork) describeStagedConstructionEffects(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if node == nil || !ast.IsNewExpression(node) || owner == nil || owner.values == nil || facts[consumer].normalInputs != nil {
		return sourceStagedOperationRequest{}, false
	}
	root, owned := sourceStagedOccurrenceRequest(&facts[consumer], node, relativeDemandEffects, fmt.Sprintf("%s:construction:%d", facts[consumer].summary.ID, node.Pos()))
	if !owned {
		return sourceStagedOperationRequest{}, false
	}
	work.operationGeneration = owner.values.generation
	work.indexOperationSources(facts)
	// Indexing the root can synchronously attach an already waiting protocol
	// consumer and adopt its required children. Describe every phase before
	// publishing that root; absent children are genuine registration failures.
	var phases [len(stagedConstructionPhases) + 1]string
	copy(phases[:], stagedConstructionPhases[:])
	for _, phase := range phases {
		request := stagedConstructionRequest(root, phase)
		recipe := sourceStagedOperationRecipe{key: request.producer, constructionEffects: &sourceStagedConstructionEffects{request: request, root: root, phase: phase, generation: work.operationGeneration}}
		if phase == "" {
			for _, child := range stagedConstructionPhases {
				recipe.delta.required = append(recipe.delta.required, stagedConstructionRequest(root, child))
			}
		}
		if prior, exists := work.operationRecipes[recipe.key]; exists {
			if !sameStagedConstructionEffects(prior.constructionEffects, recipe.constructionEffects) {
				return sourceStagedOperationRequest{}, false
			}
		} else if !work.registerOperationRecipe(facts, recipe) {
			return sourceStagedOperationRequest{}, false
		}
	}
	return root, true
}

// The ordinary New consumer refreshes already-issued dependencies only after
// passive registration returns. Required input consumers never enter this path.
func (work *callableEffectWork) stageConstructionEffects(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) bool {
	root, registered := work.registerStagedConstructionEffects(facts, consumer, node, owner)
	if !registered {
		return false
	}
	// An enclosing adopted Set may already require this New and have queued its
	// source phases. Deliver those original snapshots before ordinary readiness,
	// without lending passive registration permission to drain dependencies.
	work.prepareOperationUses(facts, owner)
	required := []sourceStagedOperationRequest{root}
	for _, phase := range stagedConstructionPhases {
		required = append(required, work.operationRecipes[stagedConstructionRequest(root, phase).producer].delta.required...)
	}
	work.refreshStagedMemberSourceReceipts(facts, required, owner)
	if !work.operationSourceRequirementsReady(required, func(key sourceStagedOperationKey) (bool, bool) {
		recipe := work.operationRecipes[key]
		if recipe.constructionEffects != nil && sameOperationRequest(recipe.constructionEffects.root, root) {
			return work.passiveConstructionEffectsReady(recipe), true
		}
		return false, false
	}) && !work.ordinaryConstructionLocallyCurrent(facts, consumer, root, owner) {
		return false
	}
	return work.registerOperationUse(facts, sourceStagedOperationUse{request: root})
}

func (work *callableEffectWork) publishConstructionPhase(facts []callableFacts, root sourceStagedOperationRequest, phase string, delta sourceStagedOperationDelta) {
	request := stagedConstructionRequest(root, phase)
	recipe := work.operationRecipes[request.producer]
	if recipe.constructionEffects == nil || !operationDeltaPrefix(recipe.delta, delta) {
		return
	}
	recipe.delta = cloneOperationDelta(delta)
	if !work.constructionRequiredSourcesCurrent(recipe) || !work.attachOperationSource(facts, recipe) {
		return
	}
	if id, adopted := work.operationIDs[request.producer]; adopted && work.passiveConstructionEffectsReady(recipe) {
		work.registerOperationDependencies(facts, id)
		if operationDeltaSize(delta) == 0 {
			work.publishSourceDisposition(id)
		} else {
			work.publishOperation(id, delta)
		}
	}
}

// The original New selector preserves callee alternatives before any prototype
// read. The bounded zero-actual WeakMap algorithm invokes no user input protocol.
// Its callee and prototype source Gets still retain every original writer debt.
func (work *callableEffectWork) observeStagedConstructionEffects(facts []callableFacts, root sourceStagedOperationRequest, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration {
		return
	}
	if work.passiveConstructionEffectsReady(work.operationRecipes[root.producer]) {
		return
	}
	delete(work.constructionEffectsObserved, root.producer)
	node := root.use
	args := node.AsNewExpression().Arguments
	if !ast.IsIdentifier(node.Expression()) {
		return
	}
	// Recovering an authored initializer or caller-bound constructor needs its
	// existing source-input producer. This first owner never replays that work.
	symbol := owner.checker.GetSymbolAtLocation(node.Expression())
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return
	}
	q := newSourceDependencyQuery(node, owner.checker, owner, root.consumer)
	defer q.publishDependencyStatistics()
	q.standardConstructionSource, q.protectedMember = node, node
	// Callee acquisition is an original Get before constructor selection. Its
	// source owner must already be installed when the selector enters native
	// member inventory, including the module and initializing-New interval.
	calleeRevoke, calleeInstalled := work.beginStagedMemberWork(q, facts, root)
	if !calleeInstalled {
		return
	}
	// Only the original selector reads the callee before New's actuals. The
	// separately installed prototype loan below must not inherit this cut.
	q.stagedMember.constructionCallee = true
	calleeDelta := sourceStagedOperationDelta{}
	var conditionalConstructor *ast.Node
	// A module callee can transfer its original Get Effects without producing
	// constructor alternatives. Function-prior-state selection retains its
	// existing owner until that stronger alternative-delivery seam is available.
	if runtimeModuleEvaluation(root.consumer) {
		member := q.stagedMember
		member.transferGet = func(get *sourceGetInputs, origin *ast.Node, projection []string, name string, mode accessorTraversal, standard *sourceValue) bool {
			if q.stagedMember != member || !member.transferringGet || member.transferStandard != standard || !q.liveStagedMemberSource(member, get, member.read) || mode != accessorAcquire || !q.traceModeKnown || q.traceMode != mode || q.initializing != node || get.operation != node || standard == nil || standard.native == nil || standard.native.kind != sourceNativeWeakMapConstructor || len(standard.path) != 0 || standard.capture != nil || standard.bound != nil || standard.normal != nil || standard.instance != nil || len(projection) != 1 || name != "" || member.coverage == nil {
				return false
			}
			coverage := member.coverage
			if coverage.generation != work.operationGeneration || coverage.origin != origin || coverage.cut != q.relativeInputCut(node) || !sameOperationRequest(coverage.request, stagedMemberCoverageRequest(root, origin, coverage.cut)) {
				return false
			}
			// Preserve the original stronger owner unless an actual discovered
			// writer still lacks its stored-input delivery. This test only
			// chooses source transfer versus legacy selection. It establishes
			// neither absence of writers nor constructor/category authority.
			missingInput := false
			for _, request := range coverage.required {
				source := work.operationRecipes[request.producer].memberSource
				if source == nil || source.candidate.operation == nil || source.candidate.protocol || source.candidate.runtimeUnknown || source.candidate.getContribution || source.candidate.invoking || source.moduleExcluded != nil {
					continue
				}
				raw := work.operationRecipes[stagedMemberCandidateRequest(root, source.candidate).producer].memberSource
				missingInput = missingInput || raw == nil || len(raw.values) == 0
			}
			if !missingInput {
				return false
			}
			calleeDelta.required = append(calleeDelta.required, coverage.request)
			calleeDelta.extracted = coverage.extracted
			conditionalConstructor = standard.node
			// No selected value, constructor body, prototype or algorithm
			// authority is supplied by this conditional standard Get.
			return true
		}
	}
	result := accessorCandidates{}
	selected := q.selectSourceConstruction(node, nil, &result)
	// Incomplete selection retains the observed source obligations. A complete
	// original selector below owns its Get accounting independently of this
	// broader descriptive source inventory. A real weak transfer already put
	// its mandatory C in calleeDelta and is never discharged here.
	for _, required := range q.stagedMember.selectionRequired {
		calleeDelta.required = appendEntryLawRequirement(calleeDelta.required, required)
	}
	pendingCallee := cloneOperationDelta(calleeDelta)
	if q.stagedMember.coverage != nil {
		// Used local laws do not account for the rest of an incomplete Get.
		pendingCallee.required = appendEntryLawRequirement(pendingCallee.required, q.stagedMember.coverage.request)
	}
	calleeRevoke()
	q.publishStandardConstruction(node, nil, selected)
	if selected == nil || len(selected.acquired.values) == 0 {
		work.recordConstructionEffects(facts, root, q, conditionalConstructor, nil, []sourceStagedOperationDelta{pendingCallee, {}, {}, {}}, nil, false)
		return
	}
	constructor := selected.acquired.values[0]
	// Construction selection keeps acquired alternatives on selected.acquired.
	// Its result aggregates Effects through mergeAccessorCandidates, which never
	// transfers values. Correlate both outputs of this same original selection.
	callee := result
	callee.values = selected.acquired.values
	if constructor.native == nil || constructor.native.kind != sourceNativeWeakMapConstructor || constructor.capture != nil || constructor.bound != nil || constructor.instance != nil || constructor.normal != nil || !stagedNativeCalleeEffectsRepresented(constructor, &callee) || !standardConstructionSelectionComplete(selected, constructor.node) {
		work.recordConstructionEffects(facts, root, q, conditionalConstructor, nil, []sourceStagedOperationDelta{pendingCallee, {}, {}, {}}, nil, false)
		return
	}
	// The actual complete standard selector owns this Get even when its
	// bare lexical callee has no generic member C. Source membership is not
	// an additional universal prerequisite for that original authority.
	calleeDelta.extracted = true
	if args != nil && len(args.Nodes) != 0 {
		// A represented callee does not account the iterable/input protocol or
		// the later prototype Get after those unrepresented argument effects.
		work.recordConstructionEffects(facts, root, q, constructor.node, nil, []sourceStagedOperationDelta{calleeDelta, {}, {}, {}}, nil, false)
		return
	}
	get := &sourceGetInputs{operation: node, receiver: constructor, propertyKey: "prototype"}
	borrow := &sourceStagedConstructionGetBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, root: root, get: get, receiver: constructor, cut: q.relativeInputCut(node)}
	get.constructionEffects = borrow
	defer func() {
		borrow.finished, borrow.issuer, borrow.selected = true, nil, nil
		get.constructionEffects = nil
	}()
	revoke, installed := work.beginStagedMemberWork(q, facts, root)
	if !installed {
		return
	}
	defer revoke()
	prototype := q.accessorsAtGet(node.Expression(), []string{"prototype"}, "", accessorAcquire, nil, nil, get, constructor)
	prototypeDelta := sourceStagedOperationDelta{extracted: hasInstanceAcquisitionRepresented(&prototype) && len(prototype.values) != 0}
	var prototypeNode *ast.Node
	for _, value := range prototype.values {
		prototypeDelta.extracted = prototypeDelta.extracted && value.native != nil && value.native.kind == sourceNativeWeakMapPrototype && value.native.acquired == constructor.native.acquired && len(value.path) == 0 && value.capture == nil && value.bound == nil && value.instance == nil && value.normal == nil
		if prototypeNode == nil {
			prototypeNode = value.node
		}
		prototypeDelta.extracted = prototypeDelta.extracted && value.node == prototypeNode
	}
	if q.owner.generation != work.operationGeneration || !borrow.live(get) {
		return
	}
	for _, required := range q.stagedMember.selectionRequired {
		prototypeDelta.required = appendEntryLawRequirement(prototypeDelta.required, required)
	}
	var prototypeGet *sourceStagedConstructionPrototypeGet
	if prototypeDelta.extracted {
		// This original Get completed its actual source alternatives and
		// protocol accounting. The broader generic C stays descriptive.
		prototypeGet = &sourceStagedConstructionPrototypeGet{request: stagedConstructionRequest(root, "prototype"), operation: node, reference: node.Expression(), receiver: constructor.node, acquired: constructor.native.acquired, prototype: prototypeNode, cut: borrow.cut, generation: work.operationGeneration, issuer: &sourceStagedConstructionIssuer{}}
		prototypeGet.issuer.prototypeGet = prototypeGet
	} else if q.stagedMember.coverage != nil {
		// Unfinished/unknown Gets retain their real source obligations. No
		// conditional native branch can mint the complete Get receipt above.
		prototypeDelta.required = append(prototypeDelta.required, q.stagedMember.coverage.request)
	}
	phases := []sourceStagedOperationDelta{calleeDelta, {extracted: true}, prototypeDelta, {extracted: true}}
	noEntry := stagedNativeGetNoUserEntry(constructor, &callee) && prototypeDelta.extracted && stagedNativeGetNoUserEntry(prototype.values[0], &prototype)
	work.recordConstructionEffects(facts, root, q, constructor.node, prototypeNode, phases, prototypeGet, noEntry)
}

// This source receipt records each local phase separately. A known callee is
// retained when argument/prototype work is still pending. The root merely names
// the finite required conjunction and cannot complete over a failed exit.
func (work *callableEffectWork) recordConstructionEffects(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, constructor, prototype *ast.Node, phases []sourceStagedOperationDelta, prototypeGet *sourceStagedConstructionPrototypeGet, noUserEntry bool) {
	if q.owner.generation != work.operationGeneration || q.reading != root.use || q.effectOwner != root.consumer || len(phases) != len(stagedConstructionPhases) {
		return
	}
	// A fresh source observation reduces its own result while preserving the
	// already sealed conjunction, including a formerly pending Get's C.
	for i, phase := range stagedConstructionPhases {
		prior := work.operationRecipes[stagedConstructionRequest(root, phase).producer].delta.required
		required := cloneOperationDelta(sourceStagedOperationDelta{required: prior}).required
		for _, request := range phases[i].required {
			required = appendEntryLawRequirement(required, request)
		}
		phases[i].required = required
	}
	observation := &sourceStagedConstructionObservation{root: root, generation: work.operationGeneration, issuer: &sourceStagedConstructionIssuer{}, constructor: constructor, prototype: prototype, cut: q.relativeInputCut(root.use), noUserEntry: noUserEntry}
	if prototypeGet != nil {
		if prototypeGet.issuer == nil || prototypeGet.issuer.prototypeGet != prototypeGet || prototypeGet.issuer.observation != nil || prototypeGet.generation != work.operationGeneration || !sameOperationRequest(prototypeGet.request, stagedConstructionRequest(root, "prototype")) || prototypeGet.operation != root.use || prototypeGet.reference != root.use.Expression() || prototypeGet.receiver != constructor || prototypeGet.prototype != prototype || prototypeGet.cut != observation.cut {
			return
		}
		observation.issuer, observation.prototypeGet = prototypeGet.issuer, prototypeGet
	}
	if phases[2].extracted && prototypeGet == nil {
		return
	}
	observation.issuer.observation = observation
	for _, phase := range phases {
		observation.phases = append(observation.phases, cloneOperationDelta(phase))
	}
	for i, phase := range stagedConstructionPhases {
		work.publishConstructionPhase(facts, root, phase, phases[i])
	}
	delta := work.operationRecipes[root.producer].delta
	delta.extracted = true
	work.publishConstructionPhase(facts, root, "", delta)
	if work.constructionEffectsObserved == nil {
		work.constructionEffectsObserved = make(map[sourceStagedOperationKey]*sourceStagedConstructionObservation)
	}
	work.constructionEffectsObserved[root.producer] = observation
	for i, phase := range stagedConstructionPhases {
		work.publishConstructionPhase(facts, root, phase, phases[i])
	}
	work.publishConstructionPhase(facts, root, "", delta)
}

func (work *callableEffectWork) passiveConstructionEffectsReady(recipe sourceStagedOperationRecipe) bool {
	s := recipe.constructionEffects
	if !validStagedConstructionEffectsRecipe(recipe) || s.generation != work.operationGeneration || !work.constructionRequiredSourcesCurrent(recipe) {
		return false
	}
	observation := work.constructionEffectsObserved[s.root.producer]
	if observation == nil || observation.issuer == nil || observation.issuer.observation != observation || observation.generation != work.operationGeneration || !sameOperationRequest(observation.root, s.root) || observation.constructor == nil || len(observation.phases) != len(stagedConstructionPhases) || observation.phases[2].extracted && observation.prototype == nil {
		return false
	}
	cut := sourceRelativeCut{operation: s.root.use, reading: s.root.use}
	if runtimeModuleEvaluation(s.root.consumer) {
		cut.use = s.root.use
	}
	if observation.cut != cut {
		return false
	}
	if observation.phases[2].extracted {
		get := observation.prototypeGet
		if get == nil || get.issuer != observation.issuer || get.issuer.prototypeGet != get || get.generation != work.operationGeneration || !sameOperationRequest(get.request, stagedConstructionRequest(s.root, "prototype")) || get.operation != s.root.use || get.reference != s.root.use.Expression() || get.acquired != get.reference || get.receiver != observation.constructor || get.prototype != observation.prototype || get.cut != cut {
			return false
		}
	}
	for i, phase := range stagedConstructionPhases {
		current := work.operationRecipes[stagedConstructionRequest(s.root, phase).producer]
		delta := observation.phases[i]
		if !validStagedConstructionEffectsRecipe(current) || !work.constructionRequiredSourcesCurrent(current) || current.constructionEffects.generation != work.operationGeneration || !sameOperationRequest(current.constructionEffects.root, s.root) || current.delta.extracted != delta.extracted || !operationDeltaPrefix(delta, current.delta) || !operationDeltaPrefix(current.delta, delta) {
			return false
		}
	}
	current := work.operationRecipes[recipe.key]
	return sameStagedConstructionEffects(current.constructionEffects, s) && recipe.delta.extracted && operationDeltaPrefix(recipe.delta, current.delta) && operationDeltaPrefix(current.delta, recipe.delta)
}

func (work *callableEffectWork) prepareStagedConstructionEffects(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	source := work.operationRecipes[work.operations[id.index].key].constructionEffects
	if source == nil || owner == nil || owner.values == nil || source.generation != owner.values.generation {
		return
	}
	work.observeStagedConstructionEffects(facts, source.root, owner)
	root := work.operationRecipes[source.root.producer]
	if work.passiveConstructionEffectsReady(root) {
		for _, phase := range stagedConstructionPhases {
			current := work.operationRecipes[stagedConstructionRequest(source.root, phase).producer]
			work.publishConstructionPhase(facts, source.root, phase, current.delta)
		}
		work.publishConstructionPhase(facts, source.root, "", root.delta)
	}
}

func (b *sourceStagedConstructionGetBorrow) live(get *sourceGetInputs) bool {
	if b == nil || b.issuer == nil || b.finished || get == nil || get.constructionEffects != b || get != b.get && get != b.selected {
		return false
	}
	q := b.issuer
	return q.owner == b.owner && q.owner != nil && q.owner.generation == b.generation && q.dependenciesOnly && q.inputs == nil && q.operation == nil && q.effectOwner == b.root.consumer && q.reading == b.root.use && q.protectedMember == b.root.use && b.cut == q.relativeInputCut(b.root.use) && get.operation == b.root.use && ast.IsNewExpression(get.operation) && (get == b.get && get.propertyKey == "prototype" || get == b.selected && get.propertyKey == "") && get.symbol == nil && get.receiver.node == b.receiver.node && get.receiver.native != nil && b.receiver.native != nil && get.receiver.native.kind == sourceNativeWeakMapConstructor && get.receiver.native.acquired == b.receiver.native.acquired && len(get.receiver.path) == 0
}

// Only the original native member owner's internal Get borrows this marker.
// Its exact selected pointer is revoked before that owner returns.
func (q *sourceValueQuery) lendConstructionEffectsGet(external, selected *sourceGetInputs, key string) func() {
	if external == nil || key != "prototype" || external.constructionEffects == nil {
		return func() {}
	}
	b := external.constructionEffects
	if b.issuer != q || !b.live(external) || b.selected != nil || selected == nil || selected.operation != external.operation || selected.receiver.node != b.receiver.node || selected.receiver.native == nil || selected.receiver.native.kind != sourceNativeWeakMapConstructor || selected.receiver.native.acquired != b.receiver.native.acquired {
		return func() {}
	}
	b.selected, selected.constructionEffects = selected, b
	return func() { selected.constructionEffects = nil; b.selected = nil }
}
