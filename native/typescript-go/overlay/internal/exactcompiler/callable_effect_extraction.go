package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type callableExtractionPhase uint8

const (
	callableExtractionRegistered callableExtractionPhase = iota
	callableExtractionQueued
	callableExtractionRunning
	callableExtractionReady
)

// sourceStagedDeclarationCall owns an effects-only edge. The canonical CallEdge
// consumes its callee's summary after local extraction, never a selected normal
// invocation. Relative actuals describe forwarding, not current argument values.
type sourceStagedDeclarationCall struct {
	ambientReads      []sourceAmbientArgumentRead // Fresh conditional argument-use descriptions; not current/runtime receipts.
	kind              sourceRelativeDemandKind
	invocation        sourceRelativeInvocation
	backedge          bool
	inputs            *sourceRelativeInputEdge
	sourceInputs      *sourceStagedInputSubstitution // entry source association, never binder delivery
	legacyInputs      bool                           // graph-local explicit unmigrated input-protocol consumer
	inputConsumerWait *sourceStagedInputConsumerWait // Graph-local owned wait; never coverage or result authority.
}

// callableExtractionTask dispatches a callable or operation source producer on
// the same finite extraction queue. It retains no deferred query callback.
type callableExtractionTask struct {
	callable             int
	operation            sourceStagedOperationID
	delivery             bool // Revision delivery on the same queue, never another source traversal.
	nativeInputReading   sourceStagedOperationRequest
	nativeInputRevision  uint64
	nativeTargetRevision uint64 // Applied target revision requests a fresh original native Get, never ordinary extraction.
	operationDone        bool   // Early operation dispatch cannot consume canonical callable tasks.
}

// sourceCallableExtractionFact combines sealed source recipes with graph-local
// extraction/publication bookkeeping. Clone reconstruction clears graph state.
// Legacy reasons describe unmigrated demands, not execution or public warnings.
// No live query, input frame or acquisition lease is retained.
type sourceCallableExtractionFact struct {
	mutationBody      sourceOriginalMutationBodyPopulation                 // Passive original BODY operation population, never authority.
	mutationTransfers map[string]map[string]sourceRelativeMutationTransfer // Exact typed mutation atoms, separate from invocation.
	mutationWriters   []sourceMutationWriterTemplate                       // Passive original encountered RHS descriptions only.
	// Graph-local observation counters are excluded from semantic fingerprints.
	// They expose the real source journey without an observer callback or trace.
	pendingBeforeLocal          uint64
	revisionDeliveries          uint64
	ready                       bool
	settled                     bool
	pending                     []sourceStagedPending
	calls                       []sourceStagedDeclarationCall
	legacy                      map[*ast.Node]sourceStagedCallGap
	invoked                     []sourceRelativeInvokedInput
	coercionTransfers           map[string]map[sourceRelativeCoercion][]EnvironmentEffectSource
	transfers                   map[string]map[sourceRelativeInvokedInput][]EnvironmentEffectSource
	constructedInventory        *sourceStagedConstructedInventory // immutable source relationships, not execution/cached values
	constructedOccurrences      []sourceStagedConstructedOccurrence
	operationRecipes            []sourceStagedOperationRecipe
	operationUses               []sourceStagedOperationUse
	operationsPending           bool
	operationDeliveries         uint64
	operationCreatingDeliveries uint64
	operationSkipped            []*ast.Node
	returnedCreations           []sourceStagedReturnedCreation
	returnedInvocations         []sourceStagedReturnedInvocation
}

type sourceStagedCallGap uint8

const (
	stagedCallSupported sourceStagedCallGap = iota
	stagedCallNormalConsumer
	stagedCallNonDeclarationOwner
	stagedCallNonDirectCallee
	stagedCallUnresolvedDeclaration
	stagedCallMutableOrDynamic
	stagedCallInputShape
	stagedCallValueConsumer
)

// registerCallableEffectWork registers all source producers before any local
// extraction can request another producer. The existing effect work owner owns
// the finite source-index queue as well as later summary propagation.
func registerCallableEffectWork(facts []callableFacts) callableEffectWork {
	work := callableEffectWork{
		extractionPhases: make([]callableExtractionPhase, len(facts)),
		extractionQueue:  make([]callableExtractionTask, len(facts)),
		extractionCalls:  make(map[*ast.Node]struct{}),
		extracting:       -1,
	}
	work.indexOperationSources(facts)
	for index := range facts {
		work.extractionPhases[index] = callableExtractionQueued
		work.extractionQueue[index] = callableExtractionTask{callable: index}
	}
	return work
}

func (work *callableEffectWork) nextExtraction() (callableExtractionTask, bool) {
	for work.extractionHead < len(work.extractionQueue) && work.extractionQueue[work.extractionHead].operationDone {
		work.extractionHead++
	}
	if work.extractionHead == len(work.extractionQueue) {
		return callableExtractionTask{}, false
	}
	task := work.extractionQueue[work.extractionHead]
	work.extractionHead++
	if task.operation.index == 0 {
		work.extractionPhases[task.callable] = callableExtractionRunning
		work.extracting = task.callable
	}
	return task, true
}

func (work *callableEffectWork) finishExtraction(facts []callableFacts, index int) {
	work.extractionPhases[index] = callableExtractionReady
	facts[index].staged.ready = true
	work.extracting = -1
	work.notifyNativeWriterSourceCallerReady(facts, index)
}

// deferDeclarationCall transfers this consumer to a registered summary producer
// and yields immediately. It never enters the callee, even for a self/backedge.
// All producers are already queued, so repeated requests create no new tasks.
func (work *callableEffectWork) deferDeclarationCall(facts []callableFacts, caller, target int, invocation sourceRelativeInvocation, inputs *sourceRelativeInputEdge) bool {
	if work == nil || work.extracting != caller || target < 0 || target >= len(work.extractionPhases) || facts[target].node != invocation.declaration {
		return false
	}
	if _, present := work.extractionCalls[invocation.operation]; present {
		return false
	}
	work.extractionCalls[invocation.operation] = struct{}{}
	backedge := work.extractionPhases[target] == callableExtractionRunning
	facts[caller].staged.calls = append(facts[caller].staged.calls, sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: invocation, backedge: backedge, inputs: inputs})
	work.requireStagedSummary(facts, caller, target, stagedDeclarationCallEdge(facts[caller].summary.ID, invocation), invocation.operation, invocation.cut)
	return true
}

// stageDeclarationCall recognizes the initial declaration-level effect domain.
// It authenticates source identity and immutable ordered formal forwarding only.
// Arbitrary actual evaluation, defaults, captures and value-result consumers keep
// their existing owners until those capabilities migrate. No type grants purity.
func stageDeclarationCall(fact *callableFacts, node *ast.Node, c *checker.Checker, owner *executableBodyOwner) (sourceRelativeInvocation, sourceStagedCallGap) {
	request, gap := describeStagedDeclarationInvocation(fact, node, c, owner)
	if gap != stagedCallSupported {
		return request, gap
	}
	outer := node
	for outer.Parent != nil && ast.IsParenthesizedExpression(outer.Parent) {
		outer = outer.Parent
	}
	if outer.Parent == nil || (!ast.IsExpressionStatement(outer.Parent) && !ast.IsReturnStatement(outer.Parent)) {
		return sourceRelativeInvocation{}, stagedCallValueConsumer
	}
	return request, stagedCallSupported
}

// describeStagedDeclarationInvocation shares only declaration/input selection.
// The ordinary collector retains its terminal-use restriction above. An eager
// argument consumer must separately authenticate its original evaluation position
// and install its own binder/summary requirement, without acquiring Call output.
func describeStagedDeclarationInvocation(fact *callableFacts, node *ast.Node, c *checker.Checker, owner *executableBodyOwner) (sourceRelativeInvocation, sourceStagedCallGap) {
	request := sourceRelativeInvocation{}
	if owner == nil || owner.values == nil || fact.normalInputs != nil || fact.initializerPlan != nil {
		return request, stagedCallNormalConsumer
	}
	caller := fact.node
	if !ast.IsExternalModule(fact.sourceFile) || !ast.IsFunctionDeclaration(caller) || caller.Parent == nil || !ast.IsSourceFile(caller.Parent) {
		return request, stagedCallNonDeclarationOwner
	}
	if async, ordinary := ordinaryResultCategory(caller); async || !ordinary {
		return request, stagedCallNormalConsumer
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || call.QuestionDotToken != nil {
		return request, stagedCallNonDirectCallee
	}
	symbol, callee := stagedLexicalFunctionImplementation(call.Expression, owner)
	if c != owner.checker || symbol == nil || callee == nil {
		return request, stagedCallUnresolvedDeclaration
	}
	if !ast.IsFunctionDeclaration(callee) || callee.Body() == nil || callee.Parent == nil || !ast.IsSourceFile(callee.Parent) || ast.GetSourceFileOfNode(callee) != fact.sourceFile || ast.GetSourceFileOfNode(callee).IsDeclarationFile {
		return request, stagedCallUnresolvedDeclaration
	}
	if async, ordinary := ordinaryResultCategory(callee); async || !ordinary {
		return request, stagedCallNormalConsumer
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
		return request, stagedCallMutableOrDynamic
	}
	formals := make(map[ast.SymbolId]int)
	for _, declaration := range []*ast.Node{caller, callee} {
		for position, parameter := range declaration.Parameters() {
			name := parameter.Name()
			if name == nil || !ast.IsIdentifier(name) || name.Text() == "this" || parameter.Initializer() != nil && stagedLexicalDefaultFunction(parameter, declaration, owner.values) == nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
				return request, stagedCallInputShape
			}
			formal := c.GetSymbolAtLocation(name)
			if formal == nil || formal.ValueDeclaration != parameter || len(index.bindings[ast.GetSymbolId(formal)]) != 0 {
				return request, stagedCallInputShape
			}
			if declaration == caller {
				formals[ast.GetSymbolId(formal)] = position
			}
		}
	}
	var actuals []*ast.Node
	if call.Arguments != nil {
		actuals = call.Arguments.Nodes
	}
	if len(actuals) > len(callee.Parameters()) {
		return request, stagedCallInputShape
	}
	for _, parameter := range callee.Parameters()[len(actuals):] {
		if stagedLexicalDefaultFunction(parameter, callee, owner.values) == nil {
			return request, stagedCallInputShape
		}
	}
	request = sourceRelativeInvocation{declaration: callee, operation: node, use: node, actualsKnown: true, cut: sourceRelativeCut{operation: node, use: node, reading: node}}
	defaultDeclaration, defaultDeclarationKnown := false, false
	for position, actual := range actuals {
		if !ast.IsIdentifier(actual) {
			return sourceRelativeInvocation{}, stagedCallInputShape
		}
		formal := c.GetSymbolAtLocation(actual)
		if formal == nil {
			return sourceRelativeInvocation{}, stagedCallInputShape
		}
		if !defaultDeclarationKnown {
			defaultDeclaration = stagedLexicalDefaultDeclaration(callee, owner.values)
			defaultDeclarationKnown = true
		}
		if defaultDeclaration && c.IsUndefinedSymbol(formal) {
			request.actuals = append(request.actuals, sourceRelativeActual{expression: actual, ordinal: position, endpoint: sourceRelativeEndpoint{kind: relativeEndpointUndefined}})
			continue
		}
		slot, exists := formals[ast.GetSymbolId(formal)]
		if !exists {
			declaration := formal.ValueDeclaration
			if declaration == nil || !ast.IsFunctionDeclaration(declaration) || declaration.Body() == nil || declaration.Parent == nil || !ast.IsSourceFile(declaration.Parent) || ast.GetSourceFileOfNode(declaration) != fact.sourceFile || len(index.bindings[ast.GetSymbolId(formal)]) != 0 {
				return sourceRelativeInvocation{}, stagedCallInputShape
			}
			// A source member's relative invocation can carry a dynamic receiver.
			// Until that receiver is transported by its demanded-role consumer,
			// receiver-dependent callback actuals retain the original Call owner.
			if stagedCallbackNeedsReceiver(declaration) {
				return sourceRelativeInvocation{}, stagedCallInputShape
			}
			if body, selected := owner.body(actual); selected && body != declaration {
				return sourceRelativeInvocation{}, stagedCallInputShape
			}
			request.actuals = append(request.actuals, sourceRelativeActual{expression: actual, ordinal: position, endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: declaration}})
			continue
		}
		request.actuals = append(request.actuals, sourceRelativeActual{expression: actual, ordinal: position, endpoint: sourceRelativeEndpoint{kind: relativeEndpointRole, role: sourceRelativeRole{kind: relativeRoleFormal, declaration: caller, slot: slot}}})
	}
	return request, stagedCallSupported
}

// cloneCallableExtraction detaches the construction-time collections. Source
// endpoint payloads are immutable after extraction and carry no issuing rights.
func cloneCallableExtraction(value sourceCallableExtractionFact) sourceCallableExtractionFact {
	value.settled, value.pending = false, nil
	value.pendingBeforeLocal, value.revisionDeliveries = 0, 0
	value.calls = append([]sourceStagedDeclarationCall(nil), value.calls...)
	for i := range value.calls {
		value.calls[i].legacyInputs = false
		value.calls[i].inputConsumerWait = nil
	}
	value.constructedOccurrences = append([]sourceStagedConstructedOccurrence(nil), value.constructedOccurrences...)
	value.invoked = append([]sourceRelativeInvokedInput(nil), value.invoked...)
	// Transfers are rebuilt by the owning work phase for the current graph.
	value.transfers = nil
	value.mutationTransfers = nil
	value.mutationBody.operations = append([]sourceOriginalMutationBodyOperation(nil), value.mutationBody.operations...)
	value.mutationWriters = append([]sourceMutationWriterTemplate(nil), value.mutationWriters...)
	for i := range value.mutationWriters {
		value.mutationWriters[i].value = cloneSourceRelativeEndpoint(value.mutationWriters[i].value)
	}
	value.coercionTransfers = nil
	value.operationRecipes = append([]sourceStagedOperationRecipe(nil), value.operationRecipes...)
	for index := range value.operationRecipes {
		recipe := &value.operationRecipes[index]
		recipe.mutationData = cloneFieldMutationData(recipe.mutationData)
		recipe.installedMutationRHS = cloneInstalledMutationRHS(recipe.installedMutationRHS)
		recipe.installedCall = cloneInstalledCallPhase(recipe.installedCall)

		recipe.descriptorTarget = cloneDescriptorTargetSource(recipe.descriptorTarget)
		if recipe.descriptorSource != nil {
			copy := *recipe.descriptorSource
			recipe.descriptorSource = &copy
		}
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil {
			copy := *recipe.nativeGet
			copy.descriptorRead = cloneDescriptorRetrieval(copy.descriptorRead)
			recipe.nativeGet = &copy
		}
		if recipe.moduleArgument != nil {
			source := *recipe.moduleArgument
			source.order = nil
			recipe.moduleArgument = &source
		}
		recipe.declarationCall = cloneStagedDeclarationCall(recipe.declarationCall)
		if recipe.constructionEffects != nil {
			source := *recipe.constructionEffects
			recipe.constructionEffects = &source
		}
		if recipe.assignment != nil {
			source := *recipe.assignment
			recipe.assignment = &source
		}
		if recipe.hasInstance != nil {
			source := *recipe.hasInstance
			recipe.hasInstance = &source
		}
		if recipe.frameworkEffects != nil {
			view := projectFrameworkStorageView(*recipe.frameworkEffects, nil)
			recipe.frameworkEffects = &view
		}
		recipe.callResult = cloneStagedCallResultSource(recipe.callResult)
		if recipe.callResult != nil && recipe.callResult.freezeReturn != nil {
			recipe.callResult.freezeReturn.calleePending = true
		}
		recipe.constructedDisposition = cloneConstructedDisposition(recipe.constructedDisposition)
		if recipe.nativeGet != nil && len(recipe.nativeGet.memberSources) != 0 {
			source := *recipe.nativeGet
			source.memberSources = append([]sourceStagedOperationRequest(nil), source.memberSources...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil {
			source := *recipe.nativeGet
			proof := *source.inputInvocation
			proof.input = cloneSourceRelativeEndpoint(proof.input)
			source.inputInvocation = &proof
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.callResults)+len(recipe.nativeGet.selectionRequired) != 0 {
			source := *recipe.nativeGet
			source.callResults = cloneOperationDelta(sourceStagedOperationDelta{required: source.callResults}).required
			source.selectionRequired = cloneOperationDelta(sourceStagedOperationDelta{required: source.selectionRequired}).required
			recipe.nativeGet = &source
		}
		if recipe.entryLaw != nil {
			recipe.entryLaw = cloneStagedEntryLawSource(recipe.entryLaw)
		}
		recipe.installedMember = cloneInstalledMemberApplication(recipe.installedMember)
		recipe.memberSource = cloneStagedMemberSource(recipe.memberSource)
		if recipe.nativeGet != nil && recipe.nativeGet.effectsSource != nil {
			source := *recipe.nativeGet
			source.effectsSource = cloneNativeEffectsRequest(source.effectsSource)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && recipe.nativeGet.calleeEntry != nil {
			source := *recipe.nativeGet
			source.calleeEntry = nil
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorMap != nil {
			source := *recipe.nativeGet
			plan := *source.descriptorMap
			plan.argumentOrder = nil
			source.descriptorMap = &plan
			recipe.nativeGet = &source
		}
		if recipe.mapEntry != nil {
			recipe.mapEntry = cloneStagedMapContribution(recipe.mapEntry)
		}
		if recipe.mapProtocol != nil {
			protocol := *recipe.mapProtocol
			if protocol.writerSource != nil {
				proof := *protocol.writerSource
				protocol.writerSource = &proof
			}
			protocol.entries = append([]sourceStagedMapEntry(nil), protocol.entries...)
			for i := range protocol.entries {
				protocol.entries[i] = cloneStagedMapEntry(protocol.entries[i])
			}
			recipe.mapProtocol = &protocol
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.observerInputs) != 0 {
			source := *recipe.nativeGet
			source.observerInputs = append([]sourceStagedNativeObserverInput(nil), source.observerInputs...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.coercions) != 0 {
			source := *recipe.nativeGet
			source.coercions = append([]sourceRelativeCoercion(nil), source.coercions...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.activationImports) != 0 {
			source := *recipe.nativeGet
			source.activationImports = append([]sourceStagedActivationImport(nil), source.activationImports...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.moduleSources) != 0 {
			source := *recipe.nativeGet
			source.moduleSources = append([]sourceStagedModuleInput(nil), source.moduleSources...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.eagerSources) != 0 {
			source := *recipe.nativeGet
			source.eagerSources = append([]sourceStagedOperationRequest(nil), source.eagerSources...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && len(recipe.nativeGet.keySources) != 0 {
			source := *recipe.nativeGet
			source.keySources = append([]sourceStagedKeySource(nil), source.keySources...)
			recipe.nativeGet = &source
		}
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorEntry != nil {
			source := *recipe.nativeGet
			source.descriptorEntry = cloneStagedMapContribution(source.descriptorEntry)
			recipe.nativeGet = &source
		}
		recipe.writerRequired = append([]sourceStagedOperationRequest(nil), recipe.writerRequired...)
		if recipe.writer != nil {
			source := *recipe.writer
			source.reads = append([]sourceStagedWriterRead(nil), source.reads...)
			source.projections = append([]*sourceStagedWriterProjection(nil), source.projections...)
			for slot, projection := range source.projections {
				if projection != nil {
					source.projections[slot] = &sourceStagedWriterProjection{delta: cloneOperationDelta(projection.delta), pending: cloneSourceRelativeEndpoints(projection.pending), resultContext: projection.resultContext}
				}
			}
			for slot := range source.reads {
				source.reads[slot] = cloneStagedWriterRead(source.reads[slot])
			}
			recipe.writer = &source
		}
		recipe.constructedInputs = append([]sourceStagedOperationRequest(nil), recipe.constructedInputs...)
		recipe.constructedGroup = append([]sourceStagedConstructedMember(nil), recipe.constructedGroup...)
		recipe.fieldMutationLinks = cloneOriginalGetMutationFieldLinks(recipe.fieldMutationLinks)
		recipe.fieldForwards = append([]sourceStagedFieldForward(nil), recipe.fieldForwards...)
		for slot := range recipe.fieldForwards {
			recipe.fieldForwards[slot].mutationRHS = cloneInstalledMutationRHS(recipe.fieldForwards[slot].mutationRHS)
			recipe.fieldForwards[slot].alternative.endpoint = cloneSourceRelativeEndpoint(recipe.fieldForwards[slot].alternative.endpoint)
		}
	}
	value.operationUses = append([]sourceStagedOperationUse(nil), value.operationUses...)
	value.operationsPending = len(value.operationUses) != 0
	value.operationDeliveries = 0
	value.operationCreatingDeliveries = 0
	value.operationSkipped = append([]*ast.Node(nil), value.operationSkipped...)
	value.returnedCreations = append([]sourceStagedReturnedCreation(nil), value.returnedCreations...)
	for index := range value.returnedCreations {
		value.returnedCreations[index].uses = append([]*ast.Node(nil), value.returnedCreations[index].uses...)
	}
	value.returnedInvocations = append([]sourceStagedReturnedInvocation(nil), value.returnedInvocations...)
	if value.legacy != nil {
		legacy := make(map[*ast.Node]sourceStagedCallGap, len(value.legacy))
		for call, reason := range value.legacy {
			legacy[call] = reason
		}
		value.legacy = legacy
	}
	return value
}

// bindStagedDeclarationInputs consumes the original binder once for the admitted
// lexical-identifier actuals. Their eager reads remain in the original source
// walk. Binder value uncertainty is not an additional executed effect: relative
// formal relationships and missing exact values are distinct contracts here.
// Getters, Calls, spreads and effectful defaults retain their original eager
// owner. Immutable lexical defaults use only the original binder SOURCE event.
func bindStagedDeclarationInputs(fact *callableFacts, request sourceRelativeInvocation, owner *executableBodyOwner) (*sourceRelativeInputEdge, bool) {
	query := newSourceDependencyQuery(request.operation, owner.checker, owner, fact.node)
	defer query.publishDependencyStatistics()
	request.use = query.effectUse()
	request.cut = query.relativeInputCut(request.operation)
	edge := &sourceRelativeInputEdge{}
	revoke, installed := query.beginSourceRelativeInputRequest(request, edge)
	if !installed {
		return nil, false
	}
	defer revoke()
	query.withActiveInvocation(request.operation, func() {
		query.bindInputs(request.declaration, request.operation, nil, &accessorCandidates{})
	})
	if !edge.delivered || edge.bound.unsupported != relativeInputsSupported {
		return nil, false
	}
	plan := planSourceRelativeInputs(edge.request, owner.values)
	if stagedLexicalDefaultDeclaration(edge.request.declaration, owner.values) {
		plan = planStagedLexicalDefaultInputs(edge.request, edge.bound, owner.values)
	}
	if plan.unsupported != relativeInputsSupported {
		return nil, false
	}
	for _, binding := range plan.bindings {
		if len(binding.pending) != 0 {
			return nil, false // Pending input producers require their registered central disposition.
		}
	}
	// The exact source role recipe covers all values of an uninstalled caller
	// formal without pretending its runtime value was acquired. The bounded
	// lexical-default composition consumes this binder; rest/capture stay refused.
	edge.relative = edge.bound
	edge.relative.bindings = plan.bindings
	return edge, true
}

func stageInvokedFormal(fact *callableFacts, node *ast.Node, owner *executableBodyOwner) (sourceRelativeInvokedInput, bool) {
	if fact.normalInputs != nil || fact.initializerPlan != nil || !ast.IsExternalModule(fact.sourceFile) || !ast.IsFunctionDeclaration(fact.node) || fact.node.Parent == nil || !ast.IsSourceFile(fact.node.Parent) || sourceParameterDefault(node, fact.node) != nil {
		return sourceRelativeInvokedInput{}, false
	}
	if async, ordinary := ordinaryResultCategory(fact.node); async || !ordinary {
		return sourceRelativeInvokedInput{}, false
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || call.QuestionDotToken != nil || call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		return sourceRelativeInvokedInput{}, false
	}
	if _, selected := owner.body(call.Expression); selected {
		return sourceRelativeInvokedInput{}, false
	}
	symbol := owner.checker.GetSymbolAtLocation(call.Expression)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsParameterDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != fact.node {
		return sourceRelativeInvokedInput{}, false
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
		return sourceRelativeInvokedInput{}, false
	}
	wanted := -1
	for slot, parameter := range fact.node.Parameters() {
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return sourceRelativeInvokedInput{}, false
		}
		if parameter == symbol.ValueDeclaration {
			wanted = slot
		}
	}
	if wanted >= 0 {
		return sourceRelativeInvokedInput{kind: relativeDemandEffects, role: sourceRelativeRole{kind: relativeRoleFormal, declaration: fact.node, slot: wanted}, origin: node, cut: sourceRelativeCut{operation: node, reading: node}}, true
	}
	return sourceRelativeInvokedInput{}, false
}
