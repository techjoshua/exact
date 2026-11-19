package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberCandidate is one original indexed write relation at an
// actual Get/Set. The original owner publishes it before input/receiver/RHS
// recovery. It describes a possible writer, never activation or replacement.
// Scalar source endpoints stay at their own observation and retain no scope.
type sourceStagedMemberCandidate struct {
	request                   sourceStagedOperationRequest
	operation, region, origin *ast.Node
	target, key, value        sourceRelativeEndpoint
	reflective                bool
	getContribution           bool
	invoking                  bool // actual Call alternatives, separate from Get Effects
	protocol                  bool // original implicit/open operation, never executed by discovery
	prior                     bool // possible previous function activation, not this invocation
	runtimeUnknown            bool
	cut                       sourceRelativeCut
}

// sourceStagedMemberDisposition separates local alternative extraction from
// replacement/value precision. Required producer work and an explicitly reached
// external runtime alternative remain separate channels of the existing delta.
// Only a live original owner may issue it, after every candidate was represented.
type sourceStagedMemberDisposition struct {
	request    sourceStagedOperationRequest
	cut        sourceRelativeCut
	generation *projectGeneration
	mode       accessorTraversal // original semantic member demand
	indexed    bool              // Indexed membership only, never activation or whole-source closure.
	delta      sourceStagedOperationDelta
}

// sourceStagedCallResultTransfer separates accepted dormant data debt from a
// conditional noncallable result law. Neither field supplies normal output,
// constructor selection, successful return or completed producer Effects.
type sourceStagedCallResultTransfer struct {
	source                *sourceStagedFreezeReturnRead // Authenticated SOURCE only, distinct from accepted debt.
	descriptorViews       []sourceNativeDescriptorView  // Current conditional DATA, never raw/native output.
	sourcePending         bool                          // Unpaid receiver-DATA membership; never a runtime alternative.
	accepted, noncallable bool
	views                 []sourceFrameworkStorageView // Fully represented conditional source DATA; never normal output.
	required              sourceStagedOperationRequest // Retained only by a consumer that uses the noncallable law.
}

// sourceStagedMemberBorrow is an ephemeral original-member publication interval.
// Neither callbacks, Get pointers nor source bindings enter persistent recipes.
// Candidate acceptance registers an obligation. It does not certify exclusion.
type sourceStagedMemberBorrow struct {
	descriptorEnumeration *sourceDescriptorSourceEnumeration // Live original-P producer only; never cloned/cached.
	descriptorStrongRead  func(sourceNativeDescriptorView, *sourceGetInputs, *sourceMemberWriterReadCut, accessorTraversal, sourceValueBindings, *accessorCandidates) bool
	descriptorRecordGet   func(sourceNativeDescriptorView, *sourceGetInputs, *sourceMemberWriterReadCut, sourceValueBindings) bool
	descriptorUse         *sourceDescriptorGetUse // stack-scoped original Effects use; nil retains full SOURCE

	installedCallSelection *sourceInstalledCallSelection
	installedMember        *sourceInstalledMemberEvent    // distinct SOURCE-input factory
	stringKey              string                         // Actual single STRING demand of this live inventory; never a category proof.
	reflectiveDisjoint     func(*ast.Node) bool           // Original complete outer-row disjoint event only.
	globalWriteEvent       *sourceStagedGlobalWriteEvent  // Original external Set publisher interval only.
	nativeObservation      *sourceStagedNativeObservation // Exact synchronous native physical-source entry only.
	nativeEntry            *sourceStagedNativeEntryAcquisition
	issuer                 *sourceValueQuery
	owner                  *sourceValueOwner
	generation             *projectGeneration
	request                sourceStagedOperationRequest
	call                   *ast.Node                         // Original Call/New callee evaluation, before its arguments.
	getPreparation         *sourceStagedGetPreparationBorrow // Original preparation interval, never physical Get.
	constructionCallee     bool                              // Lent only for the original New selector, never its later prototype Get.
	get                    *sourceGetInputs
	read                   *sourceMemberWriterReadCut
	mode                   accessorTraversal
	transferSetWriter      func(*ast.Node, *ast.Node) bool
	excludePrivateWriter   func(*ast.Node, *ast.Node) bool
	// The original standalone Get owner lends one post-traversal event. The
	// callback accepts source registration, not completion, output or invocation.
	constructedGetEffects   func(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, accounted bool, result *accessorCandidates) bool
	constructedGetEvent     *sourceGetInputs
	constructedGetStandard  *sourceValue
	freshTargetOperation    func(*ast.Node, *ast.Node, *sourceGetInputs) bool
	transferGet             func(*sourceGetInputs, *ast.Node, []string, string, accessorTraversal, *sourceValue) bool
	transferringGet         bool
	transferStandard        *sourceValue
	transferredGet          *sourceGetInputs
	transferredCut          sourceRelativeCut
	publish                 func(sourceStagedMemberCandidate) bool
	finish                  func(sourceStagedMemberDisposition) bool
	disposition             *sourceStagedMemberDisposition
	coverage                *sourceStagedMemberCoverage
	externalGet             *sourceStagedMemberExternalGet
	current                 *sourceStagedMemberCandidate
	publication             sourceStagedMemberPublication
	publishing, enumerating bool
	represented             bool
	required                []sourceStagedOperationRequest
	fieldBodies             []sourceStagedMemberFieldBody // Original factory provenance; coverage retains detached copies.
	moduleEntry             func(*ast.Node, *sourceGetInputs, *sourceMemberWriterReadCut) bool
	selectionRequired       []sourceStagedOperationRequest // Exact prerequisites of exclusions actually consumed by this Get.
	moduleReceipt           *sourceStagedModuleActivation
	moduleImports           []sourceStagedActivationImport
	receiverDataOwner       func(*sourceGetReference) bool // Current work/fact at original issuance.
	returnResult            func(*ast.Node, sourceCallResultInterest) sourceStagedCallResultTransfer
	writerCall              func(*ast.Node) sourceStagedWriterCallDisposition
	registerWriterSource    func(*sourceWriterInputRequest)
	reflectiveTarget        func(*ast.Node, sourceValue) sourceStagedReflectiveTargetTransfer
	prepareNativeInputs     func()
	nativeInputCall         func(*ast.Node) sourceStagedWriterCallDisposition
	checkingCall            *ast.Node
	observation             sourceRelativeCut
	projectingReturn        *ast.Node
	indexed                 bool
	seen                    map[*ast.Node]bool
}

func (q *sourceValueQuery) beginStagedMemberSource(request sourceStagedOperationRequest, publish func(sourceStagedMemberCandidate) bool, finish func(sourceStagedMemberDisposition) bool) (func(), bool) {
	if q == nil || q.owner == nil || q.owner.program == nil || q.owner.generation == nil || !q.dependenciesOnly || !q.definitionWriteInventoryContext() || q.inputs != nil || q.operation != nil || q.effectOwner != request.consumer || q.reading != request.producer.operation && !q.nativePhysicalMemberEntryOwned(request) || !validStagedMemberParent(request) || publish == nil || finish == nil {
		return func() {}, false
	}
	if field, phase, contextual := stagedFieldMemberParent(request); contextual && (q.stagedFieldGet == nil || !sameOperationRequest(field, q.stagedFieldGet.request) || q.stagedFieldGet.observation == nil || q.stagedFieldGet.observation.phase != phase) {
		return func() {}, false
	}
	if stagedMapEntryMemberParent(request) && (q.stagedMap == nil || !q.stagedMap.reading || q.stagedMap.currentRead == nil || !sameOperationRequest(q.stagedMap.currentRead.request, request) || !q.originalMapEntryCoverageOwned(request) && (q.stagedMap.noUserPublication == nil || q.stagedMap.noUserPublication.law != stagedMapOwnDataGetNoUserEntry)) {
		return func() {}, false
	}
	file := ast.GetSourceFileOfNode(q.reading)
	if file == nil || q.owner.program.GetSourceFile(file.FileName()) != file {
		return func() {}, false
	}
	return q.installStagedMemberSource(request, publish, finish, nil)
}

// installStagedMemberSource is called only after the generic or actual-entry
// owner validates its own authority. Nested inventory never mutates its parent.
func (q *sourceValueQuery) installStagedMemberSource(request sourceStagedOperationRequest, publish func(sourceStagedMemberCandidate) bool, finish func(sourceStagedMemberDisposition) bool, entry *sourceStagedNativeEntryAcquisition) (func(), bool) {
	prior := q.stagedMember
	borrow := &sourceStagedMemberBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, request: request, publish: publish, finish: finish, nativeEntry: entry}
	if entry == nil && q.nativePhysicalMemberEntryOwned(request) {
		borrow.nativeObservation = q.stagedNativeGet.observation
	}
	if ast.IsCallExpression(request.producer.operation) || ast.IsNewExpression(request.producer.operation) {
		borrow.call = request.producer.operation
	} else {
		member := request.producer.operation
		if parent := member.Parent; parent != nil && ast.IsCallExpression(parent) && parent.Expression() == member {
			borrow.call = parent
		}
	}
	q.stagedMember = borrow
	live := true
	return func() {
		if !live {
			return
		}
		live = false
		if q.stagedMember == borrow {
			q.stagedMember = prior
		}
		borrow.descriptorEnumeration = nil
		borrow.descriptorStrongRead = nil
		borrow.descriptorRecordGet = nil
		borrow.descriptorUse = nil
		borrow.issuer = nil
		borrow.nativeObservation = nil
		borrow.nativeEntry = nil
		borrow.call = nil
		borrow.constructionCallee = false
		borrow.getPreparation = nil
		borrow.publish = nil
		borrow.finish = nil
		borrow.get = nil
		borrow.read = nil
		borrow.current = nil
		borrow.required = nil
		borrow.fieldBodies = nil
		borrow.disposition = nil
		borrow.coverage = nil
		borrow.externalGet = nil
		borrow.moduleEntry, borrow.moduleReceipt, borrow.moduleImports = nil, nil, nil
		borrow.receiverDataOwner = nil
		borrow.returnResult = nil
		borrow.writerCall, borrow.checkingCall = nil, nil
		borrow.reflectiveDisjoint = nil
		borrow.nativeInputCall = nil
		borrow.reflectiveTarget = nil
		borrow.prepareNativeInputs = nil
		borrow.selectionRequired = nil
		borrow.transferSetWriter = nil
		borrow.excludePrivateWriter = nil
		borrow.constructedGetEffects, borrow.constructedGetEvent, borrow.constructedGetStandard = nil, nil, nil
		borrow.freshTargetOperation = nil
		borrow.transferGet, borrow.transferStandard, borrow.transferredGet = nil, nil, nil
		borrow.transferredCut = sourceRelativeCut{}
		borrow.transferringGet = false
		borrow.projectingReturn = nil
	}, true
}

func (q *sourceValueQuery) liveStagedMemberSource(borrow *sourceStagedMemberBorrow, get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	if borrow != nil && borrow.installedCallSelection != nil {
		return q.liveInstalledCallSelection(borrow, get, cut)
	}
	if borrow != nil && borrow.installedMember != nil {
		return q != nil && q.stagedMember == borrow && borrow.issuer == q && borrow.owner == q.owner && borrow.generation == q.owner.generation && borrow.get == get && borrow.read == cut && borrow.publish != nil && borrow.finish != nil && q.liveInstalledMemberPhase(borrow.installedMember, get, cut)
	}
	return q != nil && borrow != nil && q.stagedMember == borrow && borrow.issuer == q && borrow.owner == q.owner && q.owner != nil && borrow.generation == q.owner.generation && q.dependenciesOnly && q.inputs == nil && q.operation == nil && borrow.publish != nil && borrow.finish != nil && get != nil && cut != nil && borrow.get == get && borrow.read == cut && cut.use == q.reading && get.operation == cut.operation && q.memberSourceObservationOwned(borrow, get.operation) && q.effectOwner == borrow.request.consumer
}

// enterStagedMemberSource is lent by the original member owner only. The
// existing caller still owns lookup and replacement. This interval records
// candidate membership before any legacy recovery can request its inputs.
// result is the actual population owned by this Get, borrowed only until revoke;
// it does not certify a value or normal completion. Only non-installed scope
// callers may explicitly omit that population with nil.
func (q *sourceValueQuery) enterStagedMemberSource(get *sourceGetInputs, cut *sourceMemberWriterReadCut, result *accessorCandidates) func() {
	borrow := q.stagedMember
	if borrow == nil || borrow.issuer != q || borrow.enumerating || get == nil || cut == nil || get.operation != cut.operation || !q.memberSourceObservationOwned(borrow, get.operation) || borrow.installedMember != nil && result == nil {
		return func() {}
	}
	borrow.get, borrow.read, borrow.enumerating, borrow.represented = get, cut, true, true
	if e := borrow.installedMember; e != nil {
		e.observeInstalledMemberResult(result)
	}
	borrow.stringKey = ""
	borrow.observation = q.memberSourceObservationCut(get, cut)
	borrow.indexed = false
	borrow.coverage = nil
	borrow.externalGet = nil
	borrow.seen = make(map[*ast.Node]bool)
	borrow.required = nil
	borrow.fieldBodies = nil
	revokePreparationAcquisition := q.beginGetPreparationAcquisition(borrow, get, cut)
	borrow.moduleReceipt = nil
	borrow.moduleImports = nil
	return func() {
		q.publishStagedMemberDisposition(get, cut, true)
		if e := borrow.installedMember; e != nil && e.complete != nil && result != nil {
			e.complete(result)
		}
		revokePreparationAcquisition()
		borrow.get, borrow.read = nil, nil
		borrow.stringKey = ""
		borrow.enumerating = false
		borrow.seen = nil
		borrow.moduleReceipt = nil
		borrow.moduleImports = nil
	}
}

// transferStagedMapMemberEffects yields only an original immediate ordinary-map
// enum to its already-required source consumer. All indexed relationships are
// published first and remain required. This does not select writer values or
// account OwnKeys/enumerability. The literal owner still publishes its conditional
// entries and final source disposition after this member interval unwinds.
func (q *sourceValueQuery) transferStagedMapMemberEffects(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, result *accessorCandidates) bool {
	initial := q.liveStagedMapObservation(get, mode)
	entry := mode == accessorAcquire && q.liveStagedMapEntryMemberSource(get)
	if !initial && !entry || !q.liveStagedMemberSource(q.stagedMember, get, cut) || origin == nil || !ast.IsObjectLiteralExpression(origin) || origin != q.stagedMap.receiver.expression || q.stagedMember.coverage == nil || q.stagedMember.coverage.origin != origin {
		return false
	}
	// The original module owner may exclude deferred source operations before
	// this initial enumeration. Do this before leaving its writer traversal,
	// not by recovering a caller/body through normal interference analysis.
	if initial && q.stagedMap.memberRequest != nil {
		if !q.stagedMap.memberRequest.request(get, cut) {
			return false
		}
	} else if !q.publishStagedMemberDisposition(get, cut, false) {
		return false
	}
	if !q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) || !q.liveStagedMemberSource(q.stagedMember, get, cut) {
		return false
	}
	result.valueIncomplete = true // Source-only enumeration intentionally has no value output.
	return true
}

// Both implicit field phases and map reads yield before legacy interference.
// Consume each original candidate's module disposition while that same source
// interval is live. The phase owner supplies its own predecessor requirements.
func (q *sourceValueQuery) excludeStagedMemberModuleCandidates(get *sourceGetInputs, cut *sourceMemberWriterReadCut) {
	if !q.liveStagedMemberSource(q.stagedMember, get, cut) {
		return
	}
	for _, request := range q.stagedMember.required {
		operation := request.producer.selector.occurrence
		if operation != nil && q.stagedMember.seen[operation] {
			q.moduleWriterExcluded(operation, get, cut)
		}
	}
}

func (q *sourceValueQuery) observeStagedMemberCandidate(get *sourceGetInputs, cut *sourceMemberWriterReadCut, origin *ast.Node, operation *ast.Node, reflective bool) bool {
	borrow := q.stagedMember
	if !q.liveStagedMemberSource(borrow, get, cut) || !borrow.enumerating || borrow.publishing || operation == nil {
		return false
	}
	if borrow.seen[operation] {
		return true
	}
	borrow.seen[operation] = true
	candidate := sourceStagedMemberCandidate{request: borrow.request, operation: operation, origin: origin, reflective: reflective, prior: !runtimeModuleEvaluation(q.effectOwner), cut: q.memberSourceObservationCut(get, cut)}
	if file := ast.GetSourceFileOfNode(operation); file != nil {
		if occurrence := q.owner.index(file).normalOccurrences[operation]; occurrence != nil {
			candidate.region = occurrence.region
		}
	}
	if reflective && ast.IsCallExpression(operation) {
		actuals := restrictedInvocationArguments(operation.AsCallExpression())
		if len(actuals) > 0 {
			candidate.target = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[0], producer: operation, cut: candidate.cut}
		}
		if len(actuals) > 1 {
			candidate.key = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[1], producer: operation, cut: candidate.cut}
		}
		if len(actuals) > 2 {
			candidate.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[2], producer: operation, cut: candidate.cut}
		}
	} else if ast.IsBinaryExpression(operation) && operation.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		assignment := operation.AsBinaryExpression()
		// The index classifies the unwrapped target, while its original writer
		// retains authored wrappers. Select endpoints from the same target without
		// changing the original operation, value Get or observation cut.
		member := unwrapSourceCallableReference(assignment.Left)
		receiver, key := accessorReceiver(member)
		candidate.target = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: receiver, producer: operation, cut: candidate.cut}
		if ast.IsElementAccessExpression(member) {
			candidate.key = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: member.AsElementAccessExpression().ArgumentExpression, producer: operation, cut: candidate.cut}
		} else if key != "" {
			candidate.key = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: member.Name(), producer: operation, cut: candidate.cut}
		}
		candidate.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: assignment.Right, producer: operation, get: assignment.Left, cut: candidate.cut}
	}
	return q.publishStagedMemberCandidate(get, cut, candidate)
}

// prepareStagedMemberSources runs within the original member owner before its
// interference, input or receiver consumers. Index population is only local
// candidate membership. Activation, source selection and all value work remain
// independently required even when every indexed relationship was accepted.
func (q *sourceValueQuery) prepareStagedMemberSources(get *sourceGetInputs, cut *sourceMemberWriterReadCut, origin *ast.Node, projection []string, name string, mode accessorTraversal, indexes []sourceValueIndex, result *accessorCandidates, standard *sourceValue) {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || !b.enumerating {
		return
	}
	b.mode = mode
	b.stringKey = ""
	if mode == accessorAcquire && get.symbol == nil && get.receiver.native != nil {
		if len(projection) == 1 && name == "" {
			b.stringKey = projection[0]
		} else if len(projection) == 0 {
			b.stringKey = name
		}
	}
	b.indexed = len(indexes) != 0
	for _, index := range indexes {
		b.indexed = b.indexed && !index.incomplete && index.importsPrepared
		cursor := index.memberAssignments(origin)
		for {
			assignment, found := cursor.next()
			if !found {
				break
			}
			if cut.followsCalleeGet(q, get, assignment.right.Parent, result) {
				b.seen[assignment.right.Parent] = true
				continue
			}
			if q.afterRead(assignment.left) && runtimeModuleEvaluation(q.effectOwner) {
				continue
			}
			// Exclude only a positively proven non-enterable private definition.
			// The source index remains complete; no existing requirement is removed.
			if q.privateDeferredDefinitionExcluded(assignment.right.Parent, result) {
				b.seen[assignment.right.Parent] = true
				continue
			}
			q.observeStagedMemberCandidate(get, cut, origin, assignment.right.Parent, false)
			if !q.liveStagedMemberSource(b, get, cut) {
				return
			}
		}
		for _, call := range index.calls {
			if q.privateDeferredDefinitionExcluded(call, result) {
				b.seen[call] = true
				continue
			}
			if q.sourceReflectiveMemberCandidate(origin, projection, name, call, mode, result, get, cut) {
				q.observeStagedMemberCandidate(get, cut, origin, call, true)
			}
			if !q.liveStagedMemberSource(b, get, cut) {
				return
			}
		}
	}
	q.prepareStagedMemberCoverage(get, cut, origin, projection, name, mode, indexes, result, standard)
}

func (q *sourceValueQuery) publishStagedMemberCandidate(get *sourceGetInputs, cut *sourceMemberWriterReadCut, candidate sourceStagedMemberCandidate) bool {
	borrow := q.stagedMember
	if !q.liveStagedMemberSource(borrow, get, cut) || borrow.publishing {
		return false
	}
	borrow.current = &candidate
	borrow.publishing = true
	accepted := borrow.publish(candidate)
	live := q.liveStagedMemberSource(borrow, get, cut) && borrow.current == &candidate && q.memberSourceObservationCut(get, cut) == candidate.cut
	borrow.current = nil
	borrow.publishing = false
	borrow.represented = borrow.represented && accepted && live
	if c := borrow.coverage; c != nil && c.origin == candidate.origin && c.cut == candidate.cut {
		c.extracted = c.extracted && borrow.represented
	}
	return accepted && live
}

// observeStagedExternalMember is called by the original Identifier semantic
// owner after checker selection of the global binding. This is a reached open
// runtime alternative. It is not a substitute for indexed/source activation,
// and cannot certify field absence, a receiver value or normal completion.
func (q *sourceValueQuery) observeStagedExternalMember(expression *ast.Node, projection []string, name string, mode accessorTraversal, cut *sourceMemberWriterReadCut, result *accessorCandidates) {
	b := q.stagedMember
	if b == nil || b.issuer != q || b.enumerating || q.owner == nil || q.owner.checker == nil || q.protectedMember != b.request.producer.operation || q.reading != b.request.producer.operation {
		return
	}
	if !ast.IsPropertyAccessExpression(q.protectedMember) && !ast.IsElementAccessExpression(q.protectedMember) {
		return
	}
	if mode != accessorRead && mode != accessorSet && mode != accessorSet|accessorNoGet {
		return
	}
	symbol := q.owner.checker.GetSymbolAtLocation(expression)
	global := q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil)
	isGlobal := symbol != nil && global != nil && symbol == global
	host := q.stagedMemberExternalGet(expression, symbol, mode)
	if !isGlobal && host == nil {
		return
	}
	get := &sourceGetInputs{operation: q.protectedMember, receiver: sourceValue{node: expression}}
	restore := q.enterStagedMemberSource(get, cut, result)
	defer restore()
	if !q.liveStagedMemberSource(b, get, cut) {
		return
	}
	sources, referencesIncomplete := q.nativeSelectionSources(expression, result)
	if host != nil {
		supported := !referencesIncomplete && !result.opaque && !result.receiverIncomplete && !result.valueIncomplete
		for _, source := range sources {
			supported = supported && len(q.owner.index(source).bindings[ast.GetSymbolId(symbol)]) == 0
		}
		if !supported {
			host = nil
		} // Receiver/import producers must supply their own input contribution.
	}
	var storage [4]sourceValueIndex
	indexes := q.occurrenceSourceViewIn(expression, result, sources, storage[:0])
	q.prepareStagedMemberSources(get, cut, expression, projection, name, mode, indexes, result, nil)
	if host != nil {
		host.cut = q.memberSourceObservationCut(get, cut)
		b.externalGet = host
		return
	}
	if !q.liveStagedMemberSource(b, get, cut) {
		return
	}
	candidate := sourceStagedMemberCandidate{request: b.request, operation: q.protectedMember, origin: expression, runtimeUnknown: true, cut: q.memberSourceObservationCut(get, cut)}
	candidate.target = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: expression, producer: get.operation, cut: candidate.cut}
	if isGlobal && mode == (accessorSet|accessorNoGet) {
		revoke, installed := q.beginStagedGlobalWrite(get, cut, candidate, symbol, global, mode)
		if !installed {
			return
		}
		defer revoke()
	}
	q.publishStagedMemberCandidate(get, cut, candidate)
}

// originalSourceCalleeOperation is the shared source read-cut loan. Native selection
// and ordinary callee Gets use the same before-arguments phase. No normal
// selection, output, module activation or prior-invocation exclusion follows.
func (q *sourceValueQuery) originalSourceCalleeOperation() *ast.Node {
	if q == nil || !q.dependenciesOnly || q.owner == nil {
		return nil
	}
	if borrow := q.stagedFieldGet; borrow != nil && borrow.issuer == q && borrow.owner == q.owner && borrow.generation == q.owner.generation {
		return nil
	}
	// A map algorithm is entered after its Call's actuals. Its enumeration and
	// entry reads cannot borrow the earlier callee-before-arguments boundary.
	if borrow := q.stagedMap; borrow != nil && borrow.issuer == q && borrow.owner == q.owner && borrow.generation == q.owner.generation {
		return nil
	}
	if borrow := q.stagedNativeGet; borrow != nil && borrow.issuer == q && borrow.owner == q.owner && borrow.generation == q.owner.generation {
		return borrow.call
	}
	if borrow := q.stagedMember; borrow != nil && borrow.issuer == q && borrow.owner == q.owner && borrow.generation == q.owner.generation && borrow.request.consumer == q.effectOwner {
		if borrow.call != nil && ast.IsNewExpression(borrow.call) && !borrow.constructionCallee {
			return nil
		}
		return borrow.call
	}
	return nil
}

// memberSourceObservationOwned preserves the current physical binding/receiver
// Get inside the same original callee. Its live cut remains separate from the
// enclosing operation request. Earlier saved creators cannot borrow this loan.
func (q *sourceValueQuery) memberSourceObservationOwned(b *sourceStagedMemberBorrow, operation *ast.Node) bool {
	if b != nil && b.installedCallSelection != nil {
		return q.installedCallSelectionObservationOwned(b, operation)
	}
	if b != nil && b.installedMember != nil {
		e := b.installedMember
		return operation == e.get.operation && q.liveInstalledMemberPhase(e, e.get, e.read)
	}
	if q == nil || b == nil || operation == nil || q.reading != operation {
		return false
	}
	root := b.request.producer.operation
	if b.nativeEntry != nil {
		return b.nativeEntry.live(q) && b.nativeEntry.get != nil && b.nativeEntry.get.operation == operation
	}
	if b.nativeObservation != nil {
		return q.nativePhysicalMemberEntryOwned(b.request) && q.stagedNativeGet.observation == b.nativeObservation && operation == b.nativeObservation.observer.cut.operation
	}
	if operation == root {
		return true
	}
	call := q.originalSourceCalleeOperation()
	return call != nil && call == b.call && (root == call || root == call.Expression()) && nodeInside(operation, call.Expression())
}

// moduleWriterExcluded consumes only the original module control owner's
// no-user-entry disposition. It cannot exclude direct module writes or any
// function reader's prior-invocation state. No writer inputs are recovered here.
func (q *sourceValueQuery) moduleWriterExcluded(operation *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || !b.seen[operation] || b.moduleEntry == nil || !runtimeModuleEvaluation(q.effectOwner) {
		return false
	}
	file := ast.GetSourceFileOfNode(operation)
	if file == nil {
		return false
	}
	occurrence := q.owner.index(file).normalOccurrences[operation]
	if occurrence == nil {
		return false
	}
	accepted := b.moduleEntry(operation, get, cut)
	if accepted && q.liveStagedMemberSource(b, get, cut) && b.moduleReceipt != nil {
		for _, required := range b.moduleReceipt.required {
			b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, required)
		}
	}
	return accepted
}

// publishStagedMemberDisposition seals the original source interval before a
// stronger value consumer can recurse. Required semantic children stay pending.
func (q *sourceValueQuery) publishStagedMemberDisposition(get *sourceGetInputs, cut *sourceMemberWriterReadCut, final bool) bool {
	publication := stagedMemberFinalObservation
	if !final {
		publication = stagedMemberEarlyObservation
	}
	return q.publishStagedMemberDispositionPhase(get, cut, publication)
}

func (q *sourceValueQuery) publishStagedMemberDispositionPhase(get *sourceGetInputs, cut *sourceMemberWriterReadCut, publication sourceStagedMemberPublication) bool {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || b.publishing {
		return false
	}
	// All source entry paths publish the same original phase-specific module
	// dispositions before sealing C. Early transfer and ordinary completion
	// cannot omit this handoff or borrow another phase's exclusion.
	if publication != stagedMemberSourceRequest {
		q.excludeStagedMemberModuleCandidates(get, cut)
	}
	if !q.liveStagedMemberSource(b, get, cut) {
		return false
	}
	previousPublication := b.publication
	b.publication = publication
	defer func() { b.publication = previousPublication }()
	if publication != stagedMemberFinalObservation && b.coverage != nil {
		// Early indexed transfer cannot close coverage before a later reached
		// semantic terminal has had its own publication opportunity.
		original := b.coverage
		prefix := *original
		prefix.required = append([]sourceStagedOperationRequest(nil), original.required...)
		prefix.extracted = false
		b.coverage = &prefix
		defer func() {
			if q.liveStagedMemberSource(b, get, cut) && b.coverage == &prefix {
				b.coverage = original
			}
		}()
	}
	receipt := sourceStagedMemberDisposition{request: b.request, cut: q.memberSourceObservationCut(get, cut), generation: b.generation, mode: b.mode, indexed: b.indexed && b.represented, delta: sourceStagedOperationDelta{required: append([]sourceStagedOperationRequest(nil), b.required...)}}
	b.disposition = &receipt
	accepted := b.finish(receipt)
	b.disposition = nil
	return accepted && q.liveStagedMemberSource(b, get, cut)
}

// excludeStagedPrivateWriter consumes only the current original allocation-use
// owner's positive relation. Source membership and absent required edges cannot
// license a skip, and an expired or copied query cannot lend this callback.
func (q *sourceValueQuery) excludeStagedPrivateWriter(get *sourceGetInputs, cut *sourceMemberWriterReadCut, assignment sourceValueAssignment, origin *ast.Node) bool {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || b.excludePrivateWriter == nil || b.coverage == nil || b.coverage.origin != origin || b.coverage.cut != q.memberSourceObservationCut(get, cut) || assignment.left == nil || !plainStagedAssignment(assignment.left.Parent) {
		return false
	}
	observation := q.memberSourceObservationCut(get, cut)
	accepted := b.excludePrivateWriter(assignment.left.Parent, origin)
	return accepted && q.liveStagedMemberSource(b, get, cut) && b.coverage != nil && b.coverage.origin == origin && b.coverage.cut == observation && q.memberSourceObservationCut(get, cut) == observation
}
