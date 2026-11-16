package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedReflectiveTargetPreparation retains a reader's registration
// context. Its receiver is descriptive; no C population or target birth is
// implied by the original visitor's physical Get interval.
type sourceStagedReflectiveTargetPreparation struct {
	parent, request sourceStagedOperationRequest
	acquisition     sourceStagedGetPreparationAcquisitionKind
	cut             sourceRelativeCut
	receiver        sourceRelativeEndpoint
}

func cloneReflectiveTargetPreparation(p *sourceStagedReflectiveTargetPreparation) *sourceStagedReflectiveTargetPreparation {
	if p == nil {
		return nil
	}
	c := *p
	c.receiver = cloneSourceRelativeEndpoint(p.receiver)
	return &c
}
func sameReflectiveTargetPreparation(a, b *sourceStagedReflectiveTargetPreparation) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.request, b.request) && a.acquisition == b.acquisition && a.cut == b.cut && sameOperationEndpoint(a.receiver, b.receiver)
}

func reflectiveTargetKeyGet(s *sourceStagedReflectiveTargetSource) *ast.Node {
	if s.preparation != nil {
		return s.preparation.parent.producer.operation
	}
	return s.native.get
}

func validPreparedReflectiveTargetRecipe(recipe sourceStagedOperationRecipe) bool {
	m := recipe.memberSource
	if m == nil || m.targetSource == nil || m.targetSource.preparation == nil {
		return false
	}
	s := m.targetSource
	p := s.preparation
	root, child := p.parent, s.creating
	if !validStagedMemberParent(root) || !ast.IsPropertyAccessExpression(root.producer.operation) || !sameOperationRequest(p.request, stagedGetPreparationRequest(root)) || !validGetPreparationReceiver(root, p.acquisition, p.cut, p.receiver) || !sameOperationRequest(s.parent, p.request) || !sameOperationRequest(m.parent, root) || s.cut != p.cut || s.origin != p.receiver.expression || s.generation == nil || m.generation != s.generation || s.native != (sourceStagedNativeObserver{}) || s.construction != (sourceStagedOperationRequest{}) {
		return false
	}
	if s.operation == nil || !ast.IsCallExpression(s.operation) || !sourceStagedOccurrenceOwned(s.operation, root.consumer) || s.binding == nil || !ast.IsVariableDeclaration(s.binding) || s.binding.Parent == nil || !ast.IsVariableDeclarationList(s.binding.Parent) || s.binding.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(s.binding) != root.consumer || child.use == nil || !ast.IsCallExpression(child.use) || s.binding.Initializer() != child.use || child.consumer != root.consumer || child.producer.declaration != root.consumer || child.producer.operation != child.use || child.producer.kind != relativeDemandEffects || child.producer.selector != (sourceStagedOperationSelector{}) || child.inputs != nil || child.reading != (sourceStagedOperationKey{}) || child.edge == "" || child.cut != (sourceRelativeCut{operation: child.use, use: child.use, reading: child.use}) {
		return false
	}
	args := restrictedInvocationArguments(s.operation.AsCallExpression())
	inputs := restrictedInvocationArguments(child.use.AsCallExpression())
	if len(args) < 1 || !ast.IsIdentifier(args[0]) || !sameOperationEndpoint(s.target, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[0], producer: s.operation, cut: s.cut}) || s.binding.Pos() >= args[0].Pos() || len(inputs) != 1 || !sameOperationEndpoint(s.prototype, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: inputs[0], producer: child.use, cut: child.cut}) || s.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(s.method)) {
		return false
	}
	if !sameOperationRequest(s.request, stagedReflectiveTargetRequest(s)) || !sameOperationRequest(m.request, s.request) || recipe.key != s.request.producer || m.candidate.operation != s.operation || m.candidate.origin != s.origin || m.candidate.cut != s.cut || !sameOperationRequest(m.candidate.request, root) || !sameOperationEndpoint(m.candidate.target, s.target) || !m.candidate.reflective || m.candidate.protocol || m.nativeWriter != nil || m.globalWrite != nil || m.hasFreshTarget != nil || m.writeEffects || m.protocolSource != nil || m.coverage != nil || m.call != nil || m.getEffects != nil || m.getPreparation != nil || m.extraction != nil || m.moduleExcluded != nil || len(m.values)+len(m.moduleImports) != 0 || recipe.nativeGet != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.callResult != nil || recipe.constructed != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards)+len(recipe.delta.effects)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if s.sourceCut != (sourceRelativeCut{}) {
		expected := sourceRelativeCut{operation: child.use, reading: child.use, initializing: child.use}
		if runtimeModuleEvaluation(root.consumer) {
			expected.use = child.use
		}
		if s.sourceCut != expected {
			return false
		}
	}
	if s.keySource != nil && !validReflectiveKey(s) || s.resultSupport != nil && !validReflectiveResult(s) {
		return false
	}
	if recipe.delta.extracted && s.keySource == nil && s.sourceCut == (sourceRelativeCut{}) {
		return false
	}
	if len(recipe.delta.required) == 0 || !sameOperationRequest(recipe.delta.required[0], child) {
		return false
	}
	expected := []sourceStagedOperationRequest{child}
	if s.keySource != nil {
		expected = appendEntryLawRequirement(expected, reflectiveKeyReading(s))
	}
	for _, r := range reflectiveResultRequirements(s) {
		expected = appendEntryLawRequirement(expected, r)
	}
	alternative := nativeMemberAlternativeRequest(&sourceStagedNativeGetSource{request: child, get: child.use.Expression()}, "callee-alternatives")
	if operationContainsRequest(recipe.delta.required, alternative) {
		expected = appendEntryLawRequirement(expected, alternative)
	}
	if len(expected) != len(recipe.delta.required) {
		return false
	}
	for _, r := range expected {
		if !operationContainsRequest(recipe.delta.required, r) {
			return false
		}
	}
	return true
}

// prepareGetReflectiveTarget registers only the existing immutable-alias source
// domain. The live Get owner supplies context; standard method metadata cannot
// publish a selected Create, target value, or completed Get.
func (work *callableEffectWork) prepareGetReflectiveTarget(facts []callableFacts, q *sourceValueQuery, c sourceStagedGetPreparationContext, operation *ast.Node, target sourceValue) sourceStagedReflectiveTargetTransfer {
	var none sourceStagedReflectiveTargetTransfer
	if q == nil || q.owner == nil || q.executable == nil || q.stagedMember == nil || operation == nil || !ast.IsCallExpression(operation) || !sourceStagedOccurrenceOwned(operation, c.parent.consumer) || !reflectiveDescriptorCall(operation.AsCallExpression(), q.owner.checker) {
		return none
	}
	args := restrictedInvocationArguments(operation.AsCallExpression())
	if len(args) == 0 || !ast.IsIdentifier(args[0]) {
		return none
	}
	symbol := q.owner.checker.GetSymbolAtLocation(args[0])
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || q.owner.bindingWritten(symbol) {
		return none
	}
	binding := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(binding) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Pos() >= args[0].Pos() || enclosingCallableNode(binding) != c.parent.consumer {
		return none
	}
	call := binding.Initializer()
	if call == nil || !ast.IsCallExpression(call) || target.node != call || len(target.path) != 0 || target.capture != nil {
		return none
	}
	receiver, name := accessorReceiver(call.Expression())
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if receiver == nil || name != "create" || len(actuals) != 1 {
		return none
	}
	global := q.owner.checker.GetGlobalSymbol("Object", ast.SymbolFlagsValue, nil)
	root := q.owner.checker.GetSymbolAtLocation(receiver)
	if global == nil || global.ValueDeclaration == nil || root == nil || root.ValueDeclaration != global.ValueDeclaration || !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) {
		return none
	}
	method := q.owner.checker.GetPropertyOfType(q.owner.checker.GetTypeOfSymbol(global), name)
	if method == nil || method.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(method.ValueDeclaration)) {
		return none
	}
	caller, known := work.memberNodes[c.parent.consumer]
	if !known || caller < 0 || caller >= len(facts) || !stagedNativeInputSourceOwner(&facts[caller], call, q.executable) || !stagedNativeInputEligible(call, &facts[caller], q.executable) {
		return none
	}
	creating, issued := stagedNativeInputOccurrenceRequest(&facts[caller], call)
	if !issued {
		return none
	}
	if source := work.operationRecipes[creating.producer].nativeGet; source != nil {
		creating = source.request
	}
	p := &sourceStagedReflectiveTargetPreparation{parent: c.parent, request: c.request, acquisition: c.acquisition, cut: c.cut, receiver: cloneSourceRelativeEndpoint(c.receiver)}
	s := &sourceStagedReflectiveTargetSource{preparation: p, parent: c.request, creating: creating, operation: operation, binding: binding, origin: c.receiver.expression, target: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[0], producer: operation, cut: c.cut}, cut: c.cut, generation: work.operationGeneration, method: method.ValueDeclaration, prototype: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[0], producer: call, cut: creating.cut}}
	s.request = stagedReflectiveTargetRequest(s)
	candidate := sourceStagedMemberCandidate{request: c.parent, operation: operation, origin: s.origin, cut: c.cut, target: cloneSourceRelativeEndpoint(s.target), reflective: true}
	recipe := sourceStagedOperationRecipe{key: s.request.producer, memberSource: &sourceStagedMemberSource{request: s.request, parent: c.parent, candidate: candidate, generation: s.generation, targetSource: s}, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{creating}}}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if !validPreparedReflectiveTargetRecipe(prior) {
			return none
		}
		old := prior.memberSource.targetSource
		s.sourceCut = old.sourceCut
		s.keySource = cloneReflectiveKey(old.keySource)
		s.resultSupport = cloneReflectiveResult(old.resultSupport)
		if !sameStagedReflectiveTarget(old, s) {
			return none
		}
		recipe = prior
	} else {
		s.keySource = work.describeReflectiveKey(q, s)
		if s.keySource != nil {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, reflectiveKeyReading(s))
		}
		recipe = work.extendReflectiveResult(recipe)
		if !validPreparedReflectiveTargetRecipe(recipe) || !work.registerOperationRecipe(facts, recipe) {
			return none
		}
	}
	if !validPreparedReflectiveTargetRecipe(recipe) {
		return none
	}
	if s.keySource != nil {
		work.enrollReflectiveKey(facts, recipe)
	}
	// A source stamp authorizes this issued relation only; birth and key
	// readers still require their independent currentness and APPLIED checks.
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	if _, adopted := work.requireOperation(facts, s.request); !adopted {
		return none
	}
	reading := stagedReflectiveTargetReading(recipe.memberSource.targetSource)
	if !work.retainGetPreparationReflectiveTarget(facts, q, reading) {
		return none
	}
	id := work.operationIDs[recipe.key]
	work.operations[id.index].memberCoverageObserved = true
	return sourceStagedReflectiveTargetTransfer{request: reading, creating: creating, registered: true, current: work.getPreparationReflectiveTargetBirthReadingCurrent(reading), pending: work.preparedReflectiveTargetPending(q, s.request), keyExcluded: work.getPreparationReflectiveTargetKeyReadingCurrent(reading)}
}

func (work *callableEffectWork) validGetPreparationReflectiveTargetReading(recipe sourceStagedOperationRecipe, r sourceStagedOperationRequest) bool {
	return validPreparedReflectiveTargetRecipe(recipe) && recipe.memberSource.generation == work.operationGeneration && sameOperationRequest(r, stagedReflectiveTargetReading(recipe.memberSource.targetSource))
}
func (work *callableEffectWork) preparedReflectiveTargetReadingApplied(r sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[r.producer]
	if !work.validGetPreparationReflectiveTargetReading(recipe, r) {
		return false
	}
	id := work.operationIDs[r.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	st := &work.operations[id.index]
	sub := st.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	return st.key == recipe.key && !st.invalid && st.dependenciesRegistered && st.delta.extracted && st.revision != 0 && operationDeltaPrefix(st.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, st.delta) && work.memberCoverageObserved[recipe.key] == work.operationGeneration && sub != nil && !sub.blocked && sameOperationRequest(sub.request, r) && sub.consumed == st.revision && sub.applied == st.revision
}
func (work *callableEffectWork) getPreparationReflectiveTargetKeyReadingCurrent(r sourceStagedOperationRequest) bool {
	return work.preparedReflectiveTargetReadingApplied(r) && work.reflectiveKeyCurrent(work.operationRecipes[r.producer])
}
func (work *callableEffectWork) getPreparationReflectiveTargetBirthReadingCurrent(r sourceStagedOperationRequest) bool {
	return work.preparedReflectiveTargetReadingApplied(r) && work.stagedReflectiveTargetCurrent(work.operationRecipes[r.producer].memberSource.request)
}
func (work *callableEffectWork) getPreparationReflectiveTargetReadingCurrent(r sourceStagedOperationRequest) bool {
	return work.getPreparationReflectiveTargetKeyReadingCurrent(r) || work.getPreparationReflectiveTargetBirthReadingCurrent(r)
}

// Pending ownership is a real adopted producer/subscriber continuation. It
// never labels an unissued factory, an ACK, or an expired query as progress.
func (work *callableEffectWork) preparedReflectiveTargetPending(q *sourceValueQuery, request sourceStagedOperationRequest) bool {
	if q == nil {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	if !validPreparedReflectiveTargetRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return false
	}
	s := recipe.memberSource.targetSource
	p := s.preparation
	if q.stagedMember == nil || q.stagedMember.getPreparation == nil || !q.stagedMember.getPreparation.live(q) || q.stagedMember.getPreparation.work != work || !q.stagedMember.getPreparation.acquisition.live(q, q.stagedMember.getPreparation) || q.stagedMember.getPreparation.acquisition.kind != p.acquisition || !sameOperationRequest(q.stagedMember.request, p.parent) || q.stagedMember.observation != p.cut {
		return false
	}
	reading := stagedReflectiveTargetReading(s)
	id := work.operationIDs[request.producer]
	prep := work.operationIDs[p.request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.getPreparationTaskOwned(prep) {
		return false
	}
	st := &work.operations[id.index]
	sub := st.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if st.invalid || !st.dependenciesRegistered || sub == nil || sub.blocked || !sameOperationRequest(sub.request, reading) {
		return false
	}
	if s.keySource != nil && work.reflectiveKeyPending(s) {
		return true
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation != id || task.operationDone {
			continue
		}
		if !task.delivery || st.deliveryQueued {
			return true
		}
	}
	return false
}
