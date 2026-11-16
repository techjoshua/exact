package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedAssignment names an original plain member Set. Every phase is
// Effects-only. No recipe contains a receiver scope, performed write or output.
type sourceStagedAssignment struct {
	request, root sourceStagedOperationRequest
	phase         string
	generation    *projectGeneration
}

type sourceStagedAssignmentState struct {
	generation        *projectGeneration
	started, observed bool
	bodies            []*sourceRelativeInputEdge
	disposition       *sourceStagedAssignmentDisposition
	setIssuer         *sourceStagedAssignmentIssuer
}

// sourceStagedAssignmentBorrow belongs to the actual sourceSetterRequest.
// Its acquired RHS and caller mapping expire with that original Set traversal.
type sourceStagedAssignmentBorrow struct {
	issuer       *sourceValueQuery
	request      *sourceSetterInputRequest
	generation   *projectGeneration
	cut          sourceRelativeCut
	finished     bool
	observed     bool
	external     bool
	complete     bool
	rhs          []sourceValue
	rhsKnown     bool
	consume      func(*ast.Node, sourceValue, sourceValueBindings, *accessorCandidates) bool
	identity     *sourceStagedAssignmentIssuer
	alternative  *sourceStagedAssignmentAlternativeLoan
	alternatives []*sourceStagedAssignmentAlternativeLoan
	covered      []sourceStagedOperationRequest
	allData      bool
}

// The issuer identifies one original source loan without retaining its query,
// selected Get pointer, caller bindings or acquired scopes in the work graph.
type sourceStagedAssignmentIssuer struct {
	operation, get *ast.Node
	generation     *projectGeneration
	disposition    *sourceStagedAssignmentDisposition
	observation    *sourceStagedAssignmentObservation
}

// A passive observation accounts only for the original local Set phases.
// Required exits remain in the recipes. Neither this receipt nor its issuer
// retains a query, selected scope, setter body loan or delivered input packet.
type sourceStagedAssignmentObservation struct {
	disposition *sourceStagedAssignmentDisposition
	root        sourceStagedOperationDelta
	phases      []sourceStagedOperationDelta
	local       bool
}

type sourceStagedAssignmentAlternative struct {
	get, origin            *ast.Node
	cut                    sourceRelativeCut
	data, setter, external bool
}

type sourceStagedAssignmentAlternativeLoan struct {
	get *sourceGetInputs // exact original selected pointer, synchronous only
	sourceStagedAssignmentAlternative
}

// This receipt is graph-local source accounting only. Required children keep
// their original owners. The flags never supply a Get value or performed write.
type sourceStagedAssignmentDisposition struct {
	root               sourceStagedOperationRequest
	issuer             *sourceStagedAssignmentIssuer
	cut                sourceRelativeCut
	generation         *projectGeneration
	alternatives       []sourceStagedAssignmentAlternative
	required           []sourceStagedOperationRequest
	dataOnly, external bool
}

// Selected source tuples are borrowed only until the original Set traversal
// returns. Passive registration stores neither these scopes nor binder packets.
type sourceStagedAssignmentSetterLoan struct {
	body     *ast.Node
	receiver sourceValue
	captures sourceValueBindings
}

var stagedAssignmentPhases = [...]string{"receiver", "key-input", "key-coercion", "rhs", "set"}

func stagedAssignmentRequest(root sourceStagedOperationRequest, phase string) sourceStagedOperationRequest {
	r := root
	if phase != "" {
		r.producer.selector = sourceStagedOperationSelector{occurrence: root.producer.operation.AsBinaryExpression().Left, field: "assignment:" + phase}
		r.edge += ":" + phase
	}
	return r
}

func sameStagedAssignment(a, b *sourceStagedAssignment) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.phase == b.phase && a.generation == b.generation && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.root, b.root)
}

func validStagedAssignmentRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.assignment
	if s == nil || s.generation == nil || !validStagedMemberParent(s.root) || !plainStagedAssignment(s.root.use) || !sameOperationRequest(s.request, stagedAssignmentRequest(s.root, s.phase)) || recipe.key != s.request.producer || recipe.hasInstance != nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.callResult != nil || recipe.writer != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.constructed != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.fieldForwards)+len(recipe.constructedInputs)+len(recipe.constructedGroup) != 0 || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	known := s.phase == ""
	for _, phase := range stagedAssignmentPhases {
		known = known || phase == s.phase
	}
	if !known {
		return false
	}
	if s.phase == "" {
		if len(recipe.delta.required) != len(stagedAssignmentPhases) {
			return false
		}
		for i, phase := range stagedAssignmentPhases {
			if !sameOperationRequest(recipe.delta.required[i], stagedAssignmentRequest(s.root, phase)) {
				return false
			}
		}
	}
	for _, r := range recipe.delta.required {
		if r.inputs != nil || r.producer.kind != relativeDemandEffects || r.consumer != r.producer.declaration || r.use != r.producer.operation || r.cut != (sourceRelativeCut{operation: r.use, use: r.use, reading: r.use}) {
			return false
		}
	}
	for _, effect := range recipe.delta.effects {
		if !validOperationEnvironmentEffect(effect) {
			return false
		}
	}
	return true
}

func plainStagedAssignment(node *ast.Node) bool {
	if node == nil || !ast.IsBinaryExpression(node) || node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return false
	}
	left := node.AsBinaryExpression().Left
	return ast.IsPropertyAccessExpression(left) || ast.IsElementAccessExpression(left)
}

// registerStagedAssignmentEffects describes the original Set and asks its own
// current source owner for passive phase contributions. Success is registration,
// not readiness. No ordinary use, selected setter B or body activation is issued.
func (work *callableEffectWork) registerStagedAssignmentEffects(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if consumer < 0 || consumer >= len(facts) || !plainStagedAssignment(node) || owner == nil || owner.values == nil || facts[consumer].normalInputs != nil || work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	file := ast.GetSourceFileOfNode(node)
	publisher := owner.pendingMemberPublishers[facts[consumer].node]
	if owner.values.program.GetSourceFile(file.FileName()) != file {
		return sourceStagedOperationRequest{}, false
	}
	root, ok := sourceStagedOccurrenceRequest(&facts[consumer], node, relativeDemandEffects, fmt.Sprintf("%s:assignment:%d", facts[consumer].summary.ID, node.Pos()))
	if !ok {
		return sourceStagedOperationRequest{}, false
	}
	work.operationGeneration = owner.values.generation
	work.indexOperationSources(facts)
	for _, phase := range append([]string{""}, stagedAssignmentPhases[:]...) {
		r := stagedAssignmentRequest(root, phase)
		recipe := sourceStagedOperationRecipe{key: r.producer, assignment: &sourceStagedAssignment{request: r, root: root, phase: phase, generation: owner.values.generation}}
		if phase == "" {
			for _, child := range stagedAssignmentPhases {
				recipe.delta.required = append(recipe.delta.required, stagedAssignmentRequest(root, child))
			}
		}
		if prior, exists := work.operationRecipes[recipe.key]; exists {
			if !sameStagedAssignment(prior.assignment, recipe.assignment) {
				return sourceStagedOperationRequest{}, false
			}
		} else if !work.registerOperationRecipe(facts, recipe) {
			return sourceStagedOperationRequest{}, false
		}
	}
	if _, adopted := work.operationIDs[root.producer]; !adopted && publisher != nil && publisher.live && publisher.fact == &facts[consumer] && !work.passiveAssignmentSourceReady(work.operationRecipes[root.producer]) {
		work.observeStagedAssignment(facts, root, owner, false)
	}
	return root, true
}

// Ordinary collection uses the same source owner, then separately admits the
// reached Set and its dependency graph before any real setter binder runs.
func (work *callableEffectWork) stageAssignment(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) bool {
	root, registered := work.registerStagedAssignmentEffects(facts, consumer, node, owner)
	if !registered {
		return false
	}
	// Consume already adopted source producers before this fresh Set loan. Mere
	// passive registration above creates no operation IDs for this assignment.
	work.prepareOperationUses(facts, owner)
	if id, adopted := work.operationIDs[root.producer]; adopted {
		work.prepareStagedAssignment(facts, id, owner)
	} else {
		// Source observation refines passive recipes. It cannot issue speculative
		// operation IDs or summary subscribers for an unrepresented Set.
		work.observeStagedAssignment(facts, root, owner, true)
	}
	for _, phase := range stagedAssignmentPhases {
		key := stagedAssignmentRequest(root, phase).producer
		id, observed := work.operationIDs[key]
		if !work.operationRecipes[key].delta.extracted || !observed || work.operations[id.index].assignment == nil || !work.operations[id.index].assignment.observed {
			return false
		}
	}
	_, adopted := work.operationIDs[root.producer]
	return adopted && work.registerOperationUse(facts, sourceStagedOperationUse{request: root})
}

func (work *callableEffectWork) publishAssignmentPhase(facts []callableFacts, root sourceStagedOperationRequest, phase string, delta sourceStagedOperationDelta) {
	r := stagedAssignmentRequest(root, phase)
	recipe := work.operationRecipes[r.producer]
	if recipe.assignment == nil || !operationDeltaPrefix(recipe.delta, delta) {
		return
	}
	recipe.delta = cloneOperationDelta(delta)
	if !work.attachOperationSource(facts, recipe) {
		return
	}
	id, issued := work.operationIDs[r.producer]
	if !issued {
		return
	}
	state := &work.operations[id.index]
	if state.assignment == nil {
		state.assignment = &sourceStagedAssignmentState{generation: work.operationGeneration}
	}
	state.assignment.observed = true
	work.registerOperationDependencies(facts, id)
	if operationDeltaSize(delta) == 0 {
		if delta.extracted {
			work.publishSourceDisposition(id)
		}
	} else {
		work.publishOperation(id, delta)
	}
}

// The original Set owner is entered only after finite phase registration. Raw
// receiver results, Proxy protocols and unavailable input scopes remain pending.
func (work *callableEffectWork) prepareStagedAssignment(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	source := work.operationRecipes[work.operations[id.index].key].assignment
	if source == nil || source.generation != owner.values.generation {
		return
	}
	root := source.root
	rootID, adopted := work.operationIDs[root.producer]
	if !adopted {
		return
	}
	state := &work.operations[rootID.index]
	if state.assignment != nil && state.assignment.started {
		return
	}
	state.assignment = &sourceStagedAssignmentState{generation: source.generation, started: true, observed: true}
	if work.passiveAssignmentSourceReady(work.operationRecipes[root.producer]) {
		// This graph already received the original no-setter loan. Transfer its
		// detached phase dispositions, not another query or acquired scope.
		observation := work.assignmentObserved[root.producer]
		for index, phase := range stagedAssignmentPhases {
			work.publishAssignmentPhase(facts, root, phase, observation.phases[index])
		}
		work.publishAssignmentPhase(facts, root, "", observation.root)
		set := work.operationIDs[stagedAssignmentRequest(root, "set").producer]
		work.operations[set.index].assignment.setIssuer = observation.disposition.issuer
		work.operations[set.index].assignment.disposition = observation.disposition
		return
	}
	work.observeStagedAssignment(facts, root, owner, false)
}

// observeStagedAssignment lends the original source Set once. Only a locally
// represented ordinary use may adopt passive recipes. An already-required
// source consumer retains all known contributions while other phases wait.
func (work *callableEffectWork) observeStagedAssignment(facts []callableFacts, root sourceStagedOperationRequest, owner *executableBodyOwner, ordinary bool) {
	if work.assignmentObserving[root.producer] {
		return // A required backedge awaits this original owner's publication.
	}
	if work.assignmentObserving == nil {
		work.assignmentObserving = make(map[sourceStagedOperationKey]bool)
	}
	work.assignmentObserving[root.producer] = true
	defer delete(work.assignmentObserving, root.producer)
	delete(work.assignmentObserved, root.producer)
	// Fresh local outcomes decide adoption. A cached extracted recipe cannot
	// stand in for this source loan or make an unobserved phase ready.
	phases := make(map[string]sourceStagedOperationDelta, len(stagedAssignmentPhases))
	publish := func(phase string, delta sourceStagedOperationDelta) {
		phases[phase] = cloneOperationDelta(delta)
		work.publishAssignmentPhase(facts, root, phase, delta)
	}
	binary := root.use.AsBinaryExpression()
	target := binary.Left
	receiver, name := accessorReceiver(target)
	consumer := work.memberNodes[root.consumer]
	input := func(expression *ast.Node) sourceStagedOperationDelta {
		d := sourceStagedOperationDelta{extracted: stagedLiteralInputEffects(expression, owner)}
		if ast.IsCallExpression(expression) {
			if child, registered := work.registerStagedDeclarationCallEffects(facts, consumer, expression, owner); registered {
				d.required = append(d.required, child)
				d.extracted = true // Actual entry and body delivery belong to the Call owner.
			}
		}
		if ast.IsNewExpression(expression) {
			if child, registered := work.registerStagedConstructionEffects(facts, consumer, expression, owner); registered {
				d.required = append(d.required, child)
				d.extracted = true // The original child owns evaluation, not a New result.
			}
		}
		if !d.extracted {
			if r, exists := work.memberProtocolSources[expression]; exists && r.producer != root.producer {
				d.required = append(d.required, r)
				d.extracted = true
			}
		}
		return d
	}
	publish("receiver", input(receiver))
	keyInput, coercion := sourceStagedOperationDelta{extracted: true}, sourceStagedOperationDelta{extracted: true}
	if ast.IsElementAccessExpression(target) {
		key := target.AsElementAccessExpression().ArgumentExpression
		keyInput = input(key)
		primitive, represented := work.stagedPrimitiveKeySource(facts, key, root.consumer, owner)
		coercion.extracted = represented
		if represented && primitive.producer.producer.operation != nil {
			coercion.required = append(coercion.required, primitive.producer)
		}
	}
	publish("key-input", keyInput)
	publish("key-coercion", coercion)
	publish("rhs", input(binary.Right))

	q := newSourceDependencyQuery(target, owner.checker, owner, root.consumer)
	defer q.publishDependencyStatistics()
	memberRequest, ok := sourceStagedOccurrenceRequest(&facts[consumer], target, relativeDemandEffects, root.edge+":target-source")
	if !ok {
		return
	}
	revokeMember, installed := work.beginStagedMemberWork(q, facts, memberRequest)
	if !installed {
		return
	}
	defer revokeMember()
	request := q.sourceSetterRequest(target, accessorSet|accessorNoGet, nil)
	if request == nil {
		return
	}
	b := &sourceStagedAssignmentBorrow{issuer: q, request: request, generation: q.owner.generation, cut: q.relativeInputCut(root.use), complete: true, allData: true, identity: &sourceStagedAssignmentIssuer{operation: root.use, get: target, generation: q.owner.generation}}
	request.assignment = b
	previous, previousTarget := q.setterInput, q.protectedMember
	q.setterInput, q.protectedMember = request, target
	defer func() {
		b.finished, b.issuer, b.consume, b.rhs = true, nil, nil, nil
		request.assignment = nil
		q.setterInput, q.protectedMember = previous, previousTarget
	}()
	// The original binder may borrow these already acquired inert operands, not
	// replay an arbitrary initializer Call/Get to recover a missing RHS value.
	if sourceInertValueCreation(binary.Right) {
		// The RHS is a separate original operand. It cannot inherit the
		// unresolved LHS key's lookup opacity or source reference marker.
		q.protectedMember = nil
		acquired := q.accessorsAtGet(binary.Right, nil, "", accessorAcquire, nil, nil, nil)
		q.protectedMember = target
		b.rhs = append([]sourceValue(nil), acquired.values...)
		b.rhsKnown = hasInstanceAcquisitionRepresented(&acquired) && len(acquired.values) != 0
	}
	var setters []sourceStagedAssignmentSetterLoan
	b.consume = func(body *ast.Node, actual sourceValue, captures sourceValueBindings, result *accessorCandidates) bool {
		b.observed, b.allData = true, false
		if b.alternative != nil {
			b.alternative.setter = true
		}
		q.recordStagedAssignmentCoverage(b.alternative)
		setters = append(setters, sourceStagedAssignmentSetterLoan{body: body, receiver: actual, captures: captures})
		if !assignmentSetterLocallyMapped(body, actual, b, owner) {
			b.complete = false
		}
		return true // Selection transfers only, with no body or speculative B.
	}
	result := q.accessorsAtGetOutput(receiver, nil, name, accessorSet|accessorNoGet, nil, nil, nil, nil, sourceGetReferenceFor(target, receiver, nil, name, accessorSet|accessorNoGet))
	delta := sourceStagedOperationDelta{extracted: b.observed && b.complete && assignmentSetChannelsRepresented(&result)}
	if len(b.covered) != 0 {
		delta.required = append(delta.required, b.covered...)
	} else {
		delta.extracted = false
	}
	delta.effects = append(delta.effects, result.environmentEffects...)
	if b.external {
		receiverDelta := cloneOperationDelta(phases["receiver"])
		receiverDelta.extracted = true
		publish("receiver", receiverDelta)
	}
	publish("set", delta)
	rootDelta := work.operationRecipes[root.producer].delta
	rootDelta.extracted = true
	work.publishAssignmentPhase(facts, root, "", rootDelta)
	work.recordPassiveAssignmentObservation(root, q, b, phases, len(setters) == 0)
	_, adopted := work.operationIDs[root.producer]
	if !adopted && ordinary {
		ready := true
		for _, phase := range stagedAssignmentPhases {
			ready = ready && phases[phase].extracted
		}
		if ready {
			// The source set describes membership, not accepted semantics. Fresh
			// children are explicit roots because passive phase metadata may not
			// yet contain this loan's new relationships. Only our exact factory
			// roles may borrow local readiness across their self-cycle.
			required := []sourceStagedOperationRequest{root}
			for _, phase := range stagedAssignmentPhases {
				required = append(required, phases[phase].required...)
			}
			work.refreshStagedMemberSourceReceipts(facts, required, owner)
			if q.liveStagedAssignment() != b || b.generation != work.operationGeneration {
				return
			}
			ready = work.operationSourceRequirementsReady(required, func(key sourceStagedOperationKey) (bool, bool) {
				live := q.liveStagedAssignment() == b && b.generation == work.operationGeneration
				if key == root.producer {
					return live, true
				}
				for _, phase := range stagedAssignmentPhases {
					if key == stagedAssignmentRequest(root, phase).producer {
						return live && phases[phase].extracted, true
					}
				}
				return false, false
			})
		}
		if !ready {
			// A passive source keeps its known prefix without scheduling its
			// unfinished child graph or lending any summary/binder authority.
			work.publishAssignmentPhase(facts, root, "set", delta)
			return
		}
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: root}) {
			return
		}
		id := work.operationIDs[root.producer]
		work.operations[id.index].assignment = &sourceStagedAssignmentState{generation: q.owner.generation, started: true, observed: true}
		work.registerOperationDependencies(facts, id)
		adopted = true
	}
	if !adopted {
		return
	}
	// Every selected canonical membership is registered before any original B.
	for _, setter := range setters {
		if target, known := work.memberNodes[setter.body]; known {
			invocation := assignmentSetterInvocation(root, request, setter.body, q)
			work.requireStagedSummary(facts, consumer, target, stagedDeclarationCallEdge(facts[consumer].summary.ID, invocation), root.use, b.cut)
		}
	}
	for _, setter := range setters {
		work.consumeAssignmentSetter(facts, root, q, request, setter.body, setter.receiver, setter.captures, &result, owner)
	}
	// Passive phase descriptions gain graph-local observation only after adoption.
	for _, phase := range stagedAssignmentPhases {
		current := phases[phase]
		if phase == "set" {
			current.extracted = current.extracted && b.complete
		}
		work.publishAssignmentPhase(facts, root, phase, current)
	}
	work.publishAssignmentPhase(facts, root, "", rootDelta)
	work.recordAssignmentDisposition(root, q, b)
}

func (q *sourceValueQuery) liveStagedAssignment() *sourceStagedAssignmentBorrow {
	if q == nil || q.owner == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || q.setterInput == nil {
		return nil
	}
	b := q.setterInput.assignment
	if b == nil || b.issuer != q || b.request != q.setterInput || b.generation != q.owner.generation || b.finished || b.cut != q.relativeInputCut(b.request.operation) || q.protectedMember != b.request.target || !plainStagedAssignment(b.request.operation) {
		return nil
	}
	return b
}

// Called at the original selected own-data slot, after source writer traversal.
// The original Set may throw. No initializer or getter is read by this transfer.
func (q *sourceValueQuery) observeStagedAssignmentData(member *ast.Node, get *sourceGetInputs) {
	b := q.liveStagedAssignment()
	if b == nil || member == nil || q.stagedMember == nil || q.stagedMember.coverage == nil || q.stagedMember.coverage.origin != member.Parent || !q.stagedMember.coverage.extracted {
		return
	}
	if ast.IsPropertyAssignment(member) || ast.IsShorthandPropertyAssignment(member) || ast.IsMethodDeclaration(member) {
		b.observed = true
		if b.alternative != nil && b.alternative.get == get && b.alternative.origin == member.Parent {
			b.alternative.data = true
			q.recordStagedAssignmentCoverage(b.alternative)
		} else {
			b.allData = false
		}
	}
}

// A conditional accessor alternative is not DATA, even if a known data member
// also matches. This observer is called during the original member enumeration
// and supplies no computed key identity or stronger selection result.
func (q *sourceValueQuery) observeStagedAssignmentAccessor(member *ast.Node, selection string) {
	b := q.liveStagedAssignment()
	if b == nil || b.alternative == nil || member == nil || member.Parent != b.alternative.origin || (!ast.IsGetAccessorDeclaration(member) && !ast.IsSetAccessorDeclaration(member)) || member.Name() == nil {
		return
	}
	if ast.IsComputedPropertyName(member.Name()) {
		key := sourceMemberKey(member.Name().AsComputedPropertyName().Expression)
		if !key.resolved || key.name == selection {
			b.allData = false
		}
	} else if callableNameText(member.Name()) == selection {
		b.allData = false
	}
}

// observeOriginalExternalSet preserves the positive external terminal in the
// original ordinary fallback. It is independent of staged adoption and child
// closure. Missing receivers and generic opacity never produce this effect.
// The source traversal continues, retaining authored alternatives and protocols.
func (q *sourceValueQuery) observeOriginalExternalSet(expression *ast.Node, symbol *ast.Symbol, mode accessorTraversal, result *accessorCandidates) {
	if q == nil || q.owner == nil || expression == nil || symbol == nil || result == nil || mode != accessorSet|accessorNoGet || symbol.Flags&ast.SymbolFlagsAlias != 0 || q.owner.bindingWritten(symbol) || q.protectedMember == nil || !plainStagedAssignment(q.protectedMember.Parent) || q.protectedMember.Parent.AsBinaryExpression().Left != q.protectedMember {
		return
	}
	global := q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil)
	external := symbol == global
	if declaration := symbol.ValueDeclaration; declaration != nil && ast.IsVariableDeclaration(declaration) && declaration.Initializer() == nil && ast.GetSourceFileOfNode(declaration) == ast.GetSourceFileOfNode(expression) && ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsAmbient != 0 {
		external = true
	}
	if !external {
		return
	}
	name := ""
	if q.effectOwner != nil && q.effectOwner.Name() != nil {
		name = callableNameText(q.effectOwner.Name())
	}
	effect := environmentSource("unknown", "original external property Set", name)
	effect.Opaque, effect.provenanceIncomplete = true, true
	result.environmentEffects = append(result.environmentEffects, effect)
}

// A bare external receiver Get can execute before its unavailable value is
// projected into the original Set. Retain that positive read prefix, without
// treating the unknown result as a delivered receiver or completed Set.
func (q *sourceValueQuery) observeOriginalExternalReceiverGet(expression *ast.Node, symbol *ast.Symbol, projection []string, name string, mode accessorTraversal, result *accessorCandidates) {
	if q == nil || q.owner == nil || result == nil || expression == nil || symbol == nil || mode != accessorAcquire || len(projection) != 0 || name != "" || !q.dependenciesOnly || q.setterInput == nil || q.setterInput.writer != nil || q.setterInput.target != q.protectedMember || !plainStagedAssignment(q.setterInput.operation) || q.setterInput.operation.AsBinaryExpression().Left != q.protectedMember || symbol.Flags&ast.SymbolFlagsAlias != 0 || q.owner.bindingWritten(symbol) {
		return
	}
	if symbol != q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) || q.owner.checker.GetSymbolAtLocation(expression) != symbol {
		return
	}
	owner := ""
	if q.effectOwner != nil && q.effectOwner.Name() != nil {
		owner = callableNameText(q.effectOwner.Name())
	}
	effect := environmentSource("unknown", "original external receiver Get", owner)
	effect.Opaque, effect.provenanceIncomplete = true, true
	result.environmentEffects = append(result.environmentEffects, effect)
}

// Only the actually reached external entry can issue runtime-unknown Set
// Effects. A missing formal, receiver, source population or opaque flag cannot.
func (q *sourceValueQuery) observeStagedAssignmentExternal(expression *ast.Node, symbol *ast.Symbol, mode accessorTraversal) bool {
	b := q.liveStagedAssignment()
	if b == nil || mode != accessorSet|accessorNoGet || symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || q.owner.bindingWritten(symbol) {
		return false
	}
	global := q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil)
	external := symbol == global
	if d := symbol.ValueDeclaration; d != nil && ast.IsVariableDeclaration(d) && d.Initializer() == nil && ast.GetSourceFileOfNode(d) == ast.GetSourceFileOfNode(expression) && ast.GetCombinedModifierFlags(d)&ast.ModifierFlagsAmbient != 0 {
		external = true
	}
	if !external || q.stagedMember == nil || q.stagedMember.coverage == nil || q.stagedMember.coverage.origin != expression || q.stagedMember.coverage.cut != q.relativeInputCut(q.protectedMember) || !q.stagedMember.coverage.extracted {
		return false
	}
	b.observed, b.external, b.allData = true, true, false
	alternative := &sourceStagedAssignmentAlternativeLoan{sourceStagedAssignmentAlternative: sourceStagedAssignmentAlternative{get: b.request.target, origin: expression, cut: q.relativeInputCut(b.request.target), external: true}}
	b.alternatives = append(b.alternatives, alternative)
	q.recordStagedAssignmentCoverage(alternative)
	return true
}

// The original unresolved-key owner transfers only the Set lookup channel to
// its already registered phase. Key evaluation/coercion stay independent. This
// neither selects a member nor completes lookup. Only a later actual external
// terminal or represented original member source can account the Set phase.
func (q *sourceValueQuery) deferStagedAssignmentKey(operation *ast.Node, mode accessorTraversal) bool {
	b := q.liveStagedAssignment()
	return b != nil && mode == accessorSet|accessorNoGet && operation == b.request.target
}

// These are original unresolved source alternatives, not runtime-unknown
// values. They remain pending beside every selected data/setter contribution.
func (q *sourceValueQuery) observeStagedAssignmentInputGap(symbol *ast.Symbol, mode accessorTraversal, bindings sourceValueBindings) {
	b := q.liveStagedAssignment()
	if b == nil || mode != accessorSet|accessorNoGet || symbol == nil || symbol.ValueDeclaration == nil {
		return
	}
	d := symbol.ValueDeclaration
	if ast.IsParameterDeclaration(d) || ast.IsBindingElement(d) {
		if _, installed := bindings[ast.GetSymbolId(symbol)]; !installed {
			b.complete = false
		}
	}
}

func (q *sourceValueQuery) deferStagedAssignmentReceiver(value *ast.Node, mode accessorTraversal, result *accessorCandidates) bool {
	b := q.liveStagedAssignment()
	if b == nil || mode != accessorSet|accessorNoGet || value == nil || (!ast.IsCallExpression(value) && !ast.IsNewExpression(value) && !ast.IsTaggedTemplateExpression(value) && !ast.IsPropertyAccessExpression(value) && !ast.IsElementAccessExpression(value)) {
		return false
	}
	if q.stagedStandardAssignmentConstruction(value) {
		return false // Continue to the original full member/Set source owner.
	}
	b.complete = false
	result.valueIncomplete = true
	return true
}

func assignmentSetChannelsRepresented(result *accessorCandidates) bool {
	// A Set has no requested value output, but this aggregate flag can also
	// carry an unrepresented receiver/input alternative. A known setter or
	// external sibling cannot discard that original source refusal.
	return hasInstanceAcquisitionRepresented(result)
}

// This checks only whether the selected original tuples can use the bounded
// binder domain. It supplies no delivered input or completed body contribution.
func assignmentSetterLocallyMapped(body *ast.Node, receiver sourceValue, b *sourceStagedAssignmentBorrow, owner *executableBodyOwner) bool {
	_, key := accessorReceiver(b.request.target)
	if !ast.IsSetAccessorDeclaration(body) || key == "" || body.Name() == nil || ast.IsComputedPropertyName(body.Name()) || !b.rhsKnown || !stagedFieldGetterInputsMapped(body, nil, owner) {
		return false
	}
	for _, parameter := range body.Parameters() {
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return false
		}
	}
	_, gap := describeRelativeBoundValues([]sourceValue{receiver}, sourceRelativeRole{kind: relativeRoleReceiver, declaration: body}, b.cut)
	if gap != relativeInputsSupported {
		return false
	}
	for _, value := range b.rhs {
		if !value.undefined && !sourcePrimitiveValue(value.node) {
			return false // Creating/capture transport remains an actual input debt.
		}
	}
	return true
}

func assignmentSetterInvocation(root sourceStagedOperationRequest, request *sourceSetterInputRequest, body *ast.Node, q *sourceValueQuery) sourceRelativeInvocation {
	cut := q.relativeInputCut(root.use)
	return sourceRelativeInvocation{declaration: body, operation: root.use, use: q.effectUse(), cut: cut, actualsKnown: true, receiver: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: root.use.AsBinaryExpression().Left.Expression(), producer: root.use, cut: cut}, actuals: []sourceRelativeActual{{expression: request.right, endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: request.right, producer: root.use, cut: cut}}}}
}

// The original selected setter summary is required before the existing binder.
// It receives the actual receiver/caller/RHS, never a synthesized Call or frame.
func (work *callableEffectWork) consumeAssignmentSetter(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, request *sourceSetterInputRequest, body *ast.Node, receiver sourceValue, captures sourceValueBindings, result *accessorCandidates, owner *executableBodyOwner) bool {
	b := q.liveStagedAssignment()
	if b == nil || b.request != request || !ast.IsSetAccessorDeclaration(body) {
		return false
	}
	b.observed = true
	_, key := accessorReceiver(request.target)
	if key == "" || body.Name() == nil || ast.IsComputedPropertyName(body.Name()) {
		b.complete = false
	}
	target, known := work.memberNodes[body]
	if !known {
		b.complete = false
		return true
	}
	consumer := work.memberNodes[root.consumer]
	invocation := assignmentSetterInvocation(root, request, body, q)
	edge := stagedDeclarationCallEdge(facts[consumer].summary.ID, invocation)
	work.requireStagedSummary(facts, consumer, target, edge, root.use, b.cut)
	if !b.rhsKnown {
		b.complete = false
		return true
	}
	inputs := q.bindSourceSetterInputs(request, body, receiver, captures, result)
	bound := sourceRelativeBoundInputs{declaration: body, operation: root.use, use: invocation.use, cut: b.cut}
	binding, gap := describeRelativeBoundValues(inputs.bindings[0], sourceRelativeRole{kind: relativeRoleReceiver, declaration: body}, b.cut)
	bound.bindings = append(bound.bindings, binding)
	for slot, parameter := range body.Parameters() {
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			gap = relativeInputsUnsupportedCapture
			continue
		}
		symbol := owner.checker.GetSymbolAtLocation(parameter.Name())
		if symbol == nil {
			gap = relativeInputsUnsupportedCapture
			continue
		}
		part, unsupported := describeRelativeBoundValues(inputs.bindings[ast.GetSymbolId(symbol)], sourceRelativeRole{kind: relativeRoleFormal, declaration: body, slot: slot}, b.cut)
		bound.bindings = append(bound.bindings, part)
		if unsupported != relativeInputsSupported {
			gap = unsupported
		}
	}
	bound.unsupported = gap
	packet := &sourceRelativeInputEdge{request: invocation, bound: cloneSourceRelativeBoundInputs(bound), relative: cloneSourceRelativeBoundInputs(bound), delivered: true}
	mapped := stagedFieldGetterInputsMapped(body, packet, owner) && gap == relativeInputsSupported
	if !mapped {
		work.stagedRequired[sourceStagedDependencyKey{consumer, edge}].projectionPending = true
		b.complete = false
	}
	facts[consumer].staged.calls = append(facts[consumer].staged.calls, sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: invocation, inputs: packet})
	work.operationInvocationOnEdge(facts, consumer, target, root.use, b.cut, edge)
	work.operations[work.operationIDs[root.producer].index].assignment.bodies = append(work.operations[work.operationIDs[root.producer].index].assignment.bodies, packet)
	return true
}

// The original visitor records an unrepresented receiver path independently of
// other known alternatives. No result count or opaque flag creates an outcome.
func (q *sourceValueQuery) stagedAssignmentAlternativeVisit(mode accessorTraversal) func() {
	b := q.liveStagedAssignment()
	if b == nil || mode != accessorSet|accessorNoGet {
		return func() {}
	}
	before := len(b.alternatives)
	return func() {
		if q.liveStagedAssignment() == b && len(b.alternatives) == before {
			b.allData = false
		}
	}
}

// Called only by the original selected literal/class owner. The physical Get
// pointer stays inside this synchronous loan. Graph records keep its occurrence.
func (q *sourceValueQuery) beginStagedAssignmentAlternative(origin *ast.Node, get *sourceGetInputs, mode accessorTraversal) func() {
	b := q.liveStagedAssignment()
	if b == nil || mode != accessorSet|accessorNoGet || get == nil || get.operation != b.request.target {
		return func() {}
	}
	prior := b.alternative
	alternative := &sourceStagedAssignmentAlternativeLoan{get: get, sourceStagedAssignmentAlternative: sourceStagedAssignmentAlternative{get: get.operation, origin: origin, cut: q.relativeInputCut(get.operation)}}
	b.alternative = alternative
	b.alternatives = append(b.alternatives, alternative)
	return func() {
		if q.liveStagedAssignment() == b && b.alternative == alternative {
			q.recordStagedAssignmentCoverage(alternative)
			b.alternative = prior
		}
	}
}

func (q *sourceValueQuery) recordStagedAssignmentCoverage(alternative *sourceStagedAssignmentAlternativeLoan) {
	b := q.liveStagedAssignment()
	if b == nil || alternative == nil || q.stagedMember == nil || q.stagedMember.coverage == nil {
		return
	}
	coverage := q.stagedMember.coverage
	if coverage.origin != alternative.origin || coverage.cut != alternative.cut || coverage.generation != b.generation {
		return
	}
	for _, old := range b.covered {
		if sameOperationRequest(old, coverage.request) {
			return
		}
	}
	b.covered = append(b.covered, coverage.request)
}

func (work *callableEffectWork) recordAssignmentDisposition(root sourceStagedOperationRequest, q *sourceValueQuery, b *sourceStagedAssignmentBorrow) {
	if q.liveStagedAssignment() != b || b.generation != work.operationGeneration || b.request.operation != root.use || b.identity == nil || !b.observed {
		return
	}
	request := stagedAssignmentRequest(root, "set")
	id, adopted := work.operationIDs[request.producer]
	if !adopted || work.operations[id.index].assignment == nil || !work.operations[id.index].assignment.observed {
		return
	}
	receipt := stagedAssignmentDisposition(root, b, work.operations[id.index].delta.extracted)
	// One original no-setter loan already issued these exact phase snapshots.
	// Reuse its valid receipt rather than revoking the passive source relation
	// while publishing the ordinary state of that same event.
	if observation := work.assignmentObserved[root.producer]; observation != nil && observation.disposition != nil && observation.disposition.issuer == b.identity && work.passiveAssignmentSourceReady(work.operationRecipes[root.producer]) {
		receipt = observation.disposition
	}
	b.identity.disposition = receipt
	work.operations[id.index].assignment.setIssuer = b.identity
	work.operations[id.index].assignment.disposition = receipt
}

func stagedAssignmentDisposition(root sourceStagedOperationRequest, b *sourceStagedAssignmentBorrow, accounted bool) *sourceStagedAssignmentDisposition {
	receipt := &sourceStagedAssignmentDisposition{root: root, issuer: b.identity, cut: b.cut, generation: b.generation, required: append([]sourceStagedOperationRequest(nil), b.covered...), dataOnly: b.allData && len(b.alternatives) != 0 && accounted, external: b.external}
	for _, alternative := range b.alternatives {
		if !alternative.data || alternative.setter || alternative.external {
			receipt.dataOnly = false
		}
		receipt.alternatives = append(receipt.alternatives, alternative.sourceStagedAssignmentAlternative)
	}
	return receipt
}

// Passive accounting is issued before the adoption decision, while the exact
// original loan still exists. A selected setter needs its real adopted B/body
// consumer and can never obtain this no-binder local receipt.
func (work *callableEffectWork) recordPassiveAssignmentObservation(root sourceStagedOperationRequest, q *sourceValueQuery, b *sourceStagedAssignmentBorrow, phases map[string]sourceStagedOperationDelta, noSetters bool) {
	if q.liveStagedAssignment() != b || b.generation != work.operationGeneration || b.request.operation != root.use || b.identity == nil || !b.observed || !b.complete || !noSetters {
		return
	}
	observation := &sourceStagedAssignmentObservation{root: cloneOperationDelta(work.operationRecipes[root.producer].delta), local: true}
	for _, phase := range stagedAssignmentPhases {
		delta, present := phases[phase]
		if !present || !delta.extracted {
			return
		}
		observation.phases = append(observation.phases, cloneOperationDelta(delta))
	}
	observation.disposition = stagedAssignmentDisposition(root, b, true)
	b.identity.disposition = observation.disposition
	b.identity.observation = observation
	if work.assignmentObserved == nil {
		work.assignmentObserved = make(map[sourceStagedOperationKey]*sourceStagedAssignmentObservation)
	}
	work.assignmentObserved[root.producer] = observation
}

// refreshStagedAssignmentSource asks the original Set owner for a fresh passive
// source dependency receipt. It cannot adopt, bind a selected setter or recursively
// refresh its children. The caller's finite required-edge walk owns that traversal.
// A live current observation is reused, while clone metadata alone is insufficient.
func (work *callableEffectWork) refreshStagedAssignmentSource(facts []callableFacts, recipe sourceStagedOperationRecipe, owner *executableBodyOwner) {
	source := recipe.assignment
	if source == nil || source.phase != "" || !validStagedAssignmentRecipe(recipe) || owner == nil || owner.values == nil || source.generation != owner.values.generation || work.operationGeneration != source.generation || work.passiveAssignmentSourceReady(recipe) {
		return
	}
	if _, adopted := work.operationIDs[recipe.key]; adopted {
		return // Its existing required producer owns source extraction.
	}
	work.observeStagedAssignment(facts, source.root, owner, false)
}

// passiveAssignmentSourceReady supplies current-graph local source accounting
// only. Every required edge still participates in the caller's conjunction.
// Exact phase snapshots prevent a copied or later-refined recipe from using a
// receipt for a different source interval. No IDs or inputs are manufactured.
func (work *callableEffectWork) passiveAssignmentSourceReady(recipe sourceStagedOperationRecipe) bool {
	source := recipe.assignment
	if !validStagedAssignmentRecipe(recipe) || source.generation != work.operationGeneration {
		return false
	}
	observation := work.assignmentObserved[source.root.producer]
	if observation == nil || !observation.local || observation.disposition == nil || observation.disposition.issuer == nil || observation.disposition.issuer.observation != observation || len(observation.phases) != len(stagedAssignmentPhases) {
		return false
	}
	d := observation.disposition
	set := work.operationRecipes[stagedAssignmentRequest(source.root, "set").producer]
	if valid, _, _ := work.assignmentDispositionFlags(source.root, d, d.issuer, set); !valid {
		return false
	}
	match := func(recipe sourceStagedOperationRecipe, delta sourceStagedOperationDelta, phase string) bool {
		return validStagedAssignmentRecipe(recipe) && recipe.assignment.generation == work.operationGeneration && sameOperationRequest(recipe.assignment.root, source.root) && recipe.assignment.phase == phase && recipe.delta.extracted && delta.extracted && operationDeltaPrefix(recipe.delta, delta) && operationDeltaPrefix(delta, recipe.delta)
	}
	if !match(work.operationRecipes[source.root.producer], observation.root, "") {
		return false
	}
	expected := observation.root
	for i, phase := range stagedAssignmentPhases {
		if !match(work.operationRecipes[stagedAssignmentRequest(source.root, phase).producer], observation.phases[i], phase) {
			return false
		}
		if source.phase == phase {
			expected = observation.phases[i]
		}
	}
	return match(recipe, expected, source.phase)
}

// stagedAssignmentSourceDisposition exposes original Set source accounting,
// never transitive closure, a read value, actual write or selection/category.
func (work *callableEffectWork) stagedAssignmentSourceDisposition(root sourceStagedOperationRequest) (dataOnly, external bool) {
	if !plainStagedAssignment(root.use) {
		return false, false
	}
	request := stagedAssignmentRequest(root, "set")
	id, adopted := work.operationIDs[request.producer]
	if !adopted {
		if !work.passiveAssignmentSourceReady(work.operationRecipes[root.producer]) {
			return false, false
		}
		d := work.assignmentObserved[root.producer].disposition
		_, dataOnly, external := work.assignmentDispositionFlags(root, d, d.issuer, work.operationRecipes[request.producer])
		return dataOnly, external
	}
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false, false
	}
	operation := &work.operations[id.index]
	if operation.invalid || !operation.dependenciesRegistered {
		return false, false
	}
	state := operation.assignment
	if state == nil || !state.observed || state.generation != work.operationGeneration || state.disposition == nil {
		return false, false
	}
	recipe := work.operationRecipes[request.producer]
	_, dataOnly, external = work.assignmentDispositionFlags(root, state.disposition, state.setIssuer, recipe)
	return dataOnly, external
}

// Both graph-local receipt paths share original issuer, physical cut and source
// alternative validation. This is independent of transitive child completion.
func (work *callableEffectWork) assignmentDispositionFlags(root sourceStagedOperationRequest, d *sourceStagedAssignmentDisposition, issuer *sourceStagedAssignmentIssuer, recipe sourceStagedOperationRecipe) (valid, dataOnly, external bool) {
	if !plainStagedAssignment(root.use) || d == nil || d.generation != work.operationGeneration || d.issuer == nil || d.issuer != issuer || d.issuer.disposition != d || d.issuer.generation != d.generation || d.issuer.operation != root.use || d.issuer.get != root.use.AsBinaryExpression().Left || d.cut.operation != root.use || d.cut.reading != d.issuer.get || !sameOperationRequest(d.root, root) || recipe.assignment == nil || !sameOperationRequest(recipe.assignment.request, stagedAssignmentRequest(root, "set")) || !operationPrefix(d.required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, d.required, sameOperationRequest) {
		return false, false, false
	}
	live := sourceRelativeCut{operation: root.use, reading: d.issuer.get}
	if runtimeModuleEvaluation(root.consumer) {
		live.use = d.issuer.get
	}
	if d.cut != live || len(d.required) == 0 || len(d.alternatives) == 0 {
		return false, false, false
	}
	getCut := live
	getCut.operation = d.issuer.get
	externalSource := false
	for _, alternative := range d.alternatives {
		if alternative.get != d.issuer.get || alternative.origin == nil || alternative.cut != getCut || d.dataOnly && (!alternative.data || alternative.setter || alternative.external) {
			return false, false, false
		}
		externalSource = externalSource || alternative.external
	}
	return true, d.dataOnly, d.external && externalSource
}

// stagedStandardAssignmentLookup admits a conditional standard allocation slot
// only inside this original Set loan. It accounts no writer, mutation outcome,
// result/category, normal construction or implementation-integrity obligation.
func (q *sourceValueQuery) stagedStandardAssignmentLookup(get *sourceGetInputs, standard *sourceValue, mode accessorTraversal) bool {
	b := q.liveStagedAssignment()
	if b == nil || mode != accessorSet|accessorNoGet || get == nil || get.operation != b.request.target || standard == nil || standard.native == nil || standard.native.referencesIncomplete || get.receiver.native == nil || get.receiver.native.kind != sourceNativeWeakMapSourceInstance || get.receiver.node == nil || !ast.IsNewExpression(get.receiver.node) || get.receiver.native.acquired != get.receiver.node || get.receiver.normal != nil || get.receiver.bound != nil || get.receiver.capture != nil || get.receiver.instance != nil || len(get.receiver.path) != 0 {
		return false
	}
	if !q.stagedStandardAssignmentConstruction(get.receiver.node) {
		return false
	}
	contribution := q.executable.standardConstructions[get.receiver.node]
	_, key := accessorReceiver(b.request.target)
	if key != "get" && key != "set" {
		return false
	}
	origin, seed, known := q.standardConstructionMemberSeed(get.receiver, key)
	if !known || origin != contribution.site || seed.node != standard.node || seed.native == nil || seed.native.kind != standard.native.kind || seed.native.acquired != standard.native.acquired {
		return false
	}
	source := q.stagedMember
	return source != nil && source.coverage != nil && source.coverage.origin == origin && q.liveStagedMemberSource(source, get, source.read)
}

// observeStagedAssignmentStandardSet runs after original member/writer traversal
// while its source interval is still live. The ordinary standard DATA baseline
// retains the exact C debt; independent setter/unknown alternatives stay intact.
func (q *sourceValueQuery) observeStagedAssignmentStandardSet(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, result *accessorCandidates) {
	if !q.stagedStandardAssignmentLookup(get, standard, mode) || !q.liveStagedMemberSource(q.stagedMember, get, cut) || !assignmentSetChannelsRepresented(result) {
		return
	}
	b := q.liveStagedAssignment()
	alternative := b.alternative
	if alternative == nil || alternative.get != get || alternative.origin != origin || alternative.setter || alternative.external {
		return
	}
	if !q.publishStagedMemberDisposition(get, cut, true) || !q.liveStagedMemberSource(q.stagedMember, get, cut) {
		return
	}
	coverage := q.stagedMember.coverage
	if coverage == nil || !coverage.extracted || coverage.origin != origin || coverage.cut != q.relativeInputCut(get.operation) || coverage.generation != b.generation {
		return
	}
	b.observed, alternative.data = true, true
	q.recordStagedAssignmentCoverage(alternative)
}

// stagedStandardAssignmentConstruction opens only the original reached standard
// allocation's Set route. It grants no Set accounting; the full member traversal
// and its live final source disposition must still provide that contribution.
func (q *sourceValueQuery) stagedStandardAssignmentConstruction(site *ast.Node) bool {
	b := q.liveStagedAssignment()
	if b == nil || q.executable == nil || site == nil || !ast.IsNewExpression(site) || len(q.creators) != 0 {
		return false
	}
	_, key := accessorReceiver(b.request.target)
	if key != "get" && key != "set" {
		return false
	}
	contribution, exists := q.executable.standardConstructions[site]
	if !exists || contribution.site != site || !contribution.selectionComplete || contribution.owner != q.effectOwner && !runtimeModuleEvaluation(contribution.owner) {
		return false
	}
	if args := site.AsNewExpression().Arguments; args != nil && len(args.Nodes) != 0 {
		return false
	}
	root, kind := q.nativeRootDeclaration(contribution.constructor)
	return root != nil && kind == sourceNativeWeakMapConstructor
}
