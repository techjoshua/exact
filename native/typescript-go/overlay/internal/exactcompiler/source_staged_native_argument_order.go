package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeArgumentEntry belongs to the ordinary module collector's
// current extraction. Passive source queries cannot open this interval.
type sourceStagedNativeArgumentEntry struct {
	issuer   *sourceStagedNativeArgumentEntry
	task     sourceStagedOperationID
	observed *sourceStagedNativeArgumentOrder
	work     *callableEffectWork
	facts    []callableFacts
	fact     *callableFacts
	owner    *executableBodyOwner
	root     *ast.Node
	caller   int
	active   bool
}

// sourceStagedNativeArgumentIssuer lends only the child's original Get event.
// It is stack-local and is never stored in a source recipe.
type sourceStagedNativeArgumentIssuer struct {
	description   *sourceStagedNativeArgumentDescription
	entry         *sourceStagedNativeArgumentEntry
	parent        *sourceStagedNativeOccurrence
	child         *ast.Node
	observed      *sourceStagedNativeArgumentOrder
	calleeSelf    *sourceStagedNativeArgumentIssuer
	calleeQuery   *sourceValueQuery
	calleeBorrow  *sourceStagedNativeGetBorrow
	calleeRequest sourceStagedOperationRequest
	calleeCut     sourceRelativeCut
	calleeEpoch   *sourceStagedOperationEpoch
}

// sourceStagedNativeArgumentOrder records evaluation order, not a child result,
// native algorithm, completed Get, or successful outer invocation. The self
// anchor and graph epoch prevent copied/cached descriptions acquiring authority.
type sourceStagedNativeArgumentOrder struct {
	issuer                      *sourceStagedNativeArgumentOrder
	epoch                       *sourceStagedOperationEpoch
	generation                  *projectGeneration
	module, outer, child, get   *ast.Node
	outerCut, sourceCut, mapCut sourceRelativeCut
}

func (work *callableEffectWork) beginStagedNativeArgumentEntry(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) *sourceStagedNativeArgumentEntry {
	if owner == nil || owner.values == nil || owner.values.generation == nil || caller < 0 || caller >= len(facts) || work.extracting != caller {
		return nil
	}
	fact := &facts[caller]
	publisher := owner.pendingMemberPublishers[fact.node]
	if !ast.IsVariableStatement(fact.node) || !runtimeModuleEvaluation(fact.node) || fact.normalInputs != nil || publisher == nil || !publisher.live || publisher.fact != fact || !sourceStagedOccurrenceOwned(call, fact.node) || len(fact.node.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes) != 1 || call != fact.node.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].Initializer() {
		return nil
	}
	entry := &sourceStagedNativeArgumentEntry{work: work, facts: facts, fact: fact, owner: owner, root: call, caller: caller, active: true}
	entry.issuer = entry
	return entry
}

func (entry *sourceStagedNativeArgumentEntry) childIssuer(parent *sourceStagedNativeOccurrence, child *ast.Node) *sourceStagedNativeArgumentIssuer {
	if entry == nil || !entry.active || parent == nil || parent.source == nil || parent.callee == nil || parent.source.request.producer.operation != entry.root || !validStagedNativeCalleeEffects(*parent.callee, parent.source) || parent.callee.generation != entry.owner.values.generation {
		return nil
	}
	arguments := restrictedInvocationArguments(entry.root.AsCallExpression())
	if len(arguments) != 1 || arguments[0] != child {
		return nil
	}
	return &sourceStagedNativeArgumentIssuer{entry: entry, parent: parent, child: child}
}

// beginChildCallee lends evaluation order at the installed original child
// query, before acquiring its receiver can demand the later outer invocation.
// The parent proof and real entry lease authorize this interval independently
// of any child algorithm, result or later map-conversion observation.
func (issuer *sourceStagedNativeArgumentIssuer) beginChildCallee(q *sourceValueQuery, request sourceStagedNativeRequest) func() {
	if issuer == nil || issuer.entry == nil || issuer.calleeQuery != nil || q == nil || q.owner == nil || q.stagedNativeGet == nil || request.argumentIssuer != issuer || request.call != issuer.child || request.get != issuer.child.Expression() {
		return func() {}
	}
	entry := issuer.entry
	parent := issuer.parent
	borrow := q.stagedNativeGet
	if !entry.sourceEntryLive() || entry.work.operationEpoch == nil || parent == nil || parent.work != entry.work || parent.generation != q.owner.generation || parent.source == nil || parent.callee == nil || !validStagedNativeCalleeEffects(*parent.callee, parent.source) || parent.callee.generation != q.owner.generation || parent.source.request.producer.operation != entry.root || entry.owner != q.executable || entry.owner.values.generation != q.owner.generation || borrow.issuer != q || borrow.owner != q.owner || borrow.generation != q.owner.generation || borrow.call != issuer.child || borrow.argumentIssuer != nil || q.effectOwner != entry.fact.node || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || q.normalBindingCall != nil || q.reading != issuer.child || q.initializing != nil || q.protectedMember != nil {
		return func() {}
	}
	expected, owned := stagedNativeInputOccurrenceRequest(entry.fact, issuer.child)
	publisher := entry.owner.pendingMemberPublishers[entry.fact.node]
	file := ast.GetSourceFileOfNode(issuer.child)
	if !owned || !sameOperationRequest(expected, request.request) || publisher == nil || !publisher.live || publisher.fact != entry.fact || entry.caller < 0 || entry.caller >= len(entry.facts) || &entry.facts[entry.caller] != entry.fact || file == nil || q.owner.program.GetSourceFile(file.FileName()) != file {
		return func() {}
	}
	index := entry.owner.values.index(file)
	occurrence := index.normalOccurrences[entry.root]
	if index.incomplete || occurrence == nil || !occurrence.once || occurrence.region != nil || occurrence.statement != entry.fact.node {
		return func() {}
	}
	issuer.calleeSelf = issuer
	issuer.calleeQuery, issuer.calleeBorrow = q, borrow
	issuer.calleeRequest, issuer.calleeCut, issuer.calleeEpoch = request.request, q.relativeInputCut(issuer.child), entry.work.operationEpoch
	borrow.argumentIssuer = issuer
	live := true
	return func() {
		if !live {
			return
		}
		live = false
		if borrow.argumentIssuer == issuer {
			borrow.argumentIssuer = nil
		}
		issuer.calleeSelf = nil
		issuer.calleeQuery, issuer.calleeBorrow = nil, nil
		issuer.calleeRequest, issuer.calleeCut, issuer.calleeEpoch = sourceStagedOperationRequest{}, sourceRelativeCut{}, nil
	}
}

// followsChildCalleeArgument consumes only that same live child acquisition.
// Its current physical receiver/property Get stays separate from the original
// child Call cut; neither identity is normalized to the other.
func (cut *sourceMemberWriterReadCut) followsChildCalleeArgument(q *sourceValueQuery, get *sourceGetInputs, operation *ast.Node) bool {
	if cut == nil || q == nil || q.owner == nil || get == nil || q.stagedNativeGet == nil || cut.afterArguments != nil || cut.operation != get.operation || cut.use != q.reading || get.operation != q.reading {
		return false
	}
	borrow := q.stagedNativeGet
	issuer := borrow.argumentIssuer
	if issuer == nil || issuer.calleeSelf != issuer || issuer.calleeQuery != q || issuer.calleeBorrow != borrow || issuer.entry == nil || q.executable != issuer.entry.owner || q.owner.program != issuer.entry.owner.values.program || q.owner.checker != issuer.entry.owner.checker || !issuer.entry.sourceEntryLive() || issuer.calleeEpoch == nil || issuer.calleeEpoch != issuer.entry.work.operationEpoch || borrow.issuer != q || borrow.owner != q.owner || borrow.generation != q.owner.generation || borrow.call != issuer.child || q.originalSourceCalleeOperation() != issuer.child || q.effectOwner != issuer.entry.fact.node || operation != issuer.entry.root || q.inputs != nil || q.operation != nil || q.normalBindingCall != nil || !q.active[issuer.child] || q.initializing != issuer.child || q.returning != issuer.calleeCut.returning || q.invoking != issuer.calleeCut.invoking || q.protectedMember != issuer.child.Expression() || issuer.calleeRequest.producer.operation != issuer.child {
		return false
	}
	expected, owned := stagedNativeInputOccurrenceRequest(issuer.entry.fact, issuer.child)
	if !owned || !sameOperationRequest(expected, issuer.calleeRequest) || issuer.calleeCut != (sourceRelativeCut{operation: issuer.child, use: issuer.child, reading: issuer.child}) {
		return false
	}
	publisher := issuer.entry.owner.pendingMemberPublishers[q.effectOwner]
	parent := issuer.parent
	return publisher != nil && publisher.live && publisher.fact == issuer.entry.fact && parent != nil && parent.callee != nil && parent.source != nil && validStagedNativeCalleeEffects(*parent.callee, parent.source) && parent.callee.generation == q.owner.generation && parent.work == issuer.entry.work && parent.source.request.producer.operation == operation
}

// observe runs inside the original native member publisher, before algorithm
// admission can request map conversion. It does not wait for child completion.
func (issuer *sourceStagedNativeArgumentIssuer) observe(q *sourceValueQuery, get *sourceGetInputs, source *sourceStagedNativeGetSource, mapCut sourceRelativeCut) {
	if issuer == nil || issuer.entry == nil || !issuer.entry.active || q == nil || source == nil || get == nil {
		return
	}
	entry := issuer.entry
	publisher := entry.owner.pendingMemberPublishers[entry.fact.node]
	if q.executable != entry.owner || q.owner == nil || q.owner.program != entry.owner.values.program || q.owner.checker != entry.owner.values.checker || q.owner.generation == nil || q.owner.generation != entry.work.operationGeneration || !entry.sourceEntryLive() || publisher == nil || !publisher.live || publisher.fact != entry.fact || q.effectOwner != entry.fact.node || q.stagedNativeGet == nil || q.stagedNativeGet.issuer != q || q.stagedNativeGet.owner != q.owner || q.stagedNativeGet.call != issuer.child || !q.stagedNativeGet.canonical || get.operation != issuer.child || q.protectedMember != source.get || source.request.producer.operation != issuer.child || source.request.consumer != entry.fact.node || source.get != issuer.child.Expression() || mapCut.operation != issuer.child || mapCut.reading != issuer.child || issuer.observed != nil {
		return
	}
	file := ast.GetSourceFileOfNode(issuer.child)
	if file == nil || q.owner.program.GetSourceFile(file.FileName()) != file {
		return
	}
	proof := &sourceStagedNativeArgumentOrder{epoch: entry.work.operationEpoch, generation: q.owner.generation, module: entry.fact.node, outer: entry.root, child: issuer.child, get: source.get, outerCut: issuer.parent.callee.cut, sourceCut: q.relativeInputCut(issuer.child), mapCut: mapCut}
	proof.issuer = proof
	issuer.description = &sourceStagedNativeArgumentDescription{outerRequest: issuer.parent.source.request, childRequest: source.request, module: proof.module, outer: proof.outer, child: proof.child, get: proof.get, outerCut: proof.outerCut, sourceCut: proof.sourceCut, mapCut: proof.mapCut}
	issuer.observed, entry.observed = proof, proof
	// A fresh original event renews graph-local order on an immutable cached
	// map description. It preserves every existing atom and required edge.
	for _, recipe := range entry.work.operationRecipes {
		if !sameNativeGetSource(recipe.nativeGet, source) || recipe.nativeGet.descriptorMap == nil {
			continue
		}
		next, plan := *recipe.nativeGet, *recipe.nativeGet.descriptorMap
		plan.argumentOrder = proof
		plan.argumentSource = issuer.description
		next.descriptorMap = &plan
		recipe.nativeGet = &next
		entry.work.attachOperationSource(entry.facts, recipe)
	}
}

// followsStagedMapArgument is a separate ordering case from the callee-Get
// loan. It excludes only the enclosing invocation's mutation route while the
// child map owner is actually enumerating; all acquisition/eager work survives.
func (cut *sourceMemberWriterReadCut) followsStagedMapArgument(q *sourceValueQuery, get *sourceGetInputs, operation *ast.Node) bool {
	if cut == nil || q == nil || q.stagedMap == nil || !q.stagedMap.converting || !q.traceModeKnown || q.traceMode != accessorEnumerate|accessorNoGet || cut.afterArguments != nil || get == nil || cut.operation != get.operation || q.reading != cut.use || !q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
		return false
	}
	borrow := q.stagedMap
	proof := borrow.argumentOrder
	if proof == nil || proof.issuer != proof || proof.epoch != borrow.argumentEpoch || proof.generation != q.owner.generation || proof.module != q.effectOwner || !runtimeModuleEvaluation(proof.module) || proof.outer != operation || proof.child != borrow.operation || proof.get != proof.child.Expression() || proof.mapCut != borrow.cut || q.relativeInputCut(borrow.operation) != proof.mapCut || proof.sourceCut.operation != proof.child || proof.sourceCut.reading != proof.child || proof.outerCut.operation != proof.outer || proof.outerCut.reading != proof.outer {
		return false
	}
	file := ast.GetSourceFileOfNode(proof.child)
	return file != nil && q.owner.program.GetSourceFile(file.FileName()) == file
}

// stagedMapInvocationFollows uses the original live member loan in caller
// eligibility as well as reflective eligibility. It does not acquire an input
// or classify any earlier argument/callee work as effect-free.
func (query *sourceValueQuery) stagedMapInvocationFollows(call *ast.Node) bool {
	if query == nil || query.stagedMember == nil {
		return false
	}
	member := query.stagedMember
	return query.liveStagedMemberSource(member, member.get, member.read) && member.read.followsStagedArgumentInvocation(query, member.get, call)
}

// followsStagedArgumentInvocation is the common eligibility decision for a
// candidate invocation across reflective discovery, source interference and
// writer-input recovery. Each phase keeps its own live issuer and physical cut.
func (cut *sourceMemberWriterReadCut) followsStagedArgumentInvocation(q *sourceValueQuery, get *sourceGetInputs, operation *ast.Node) bool {
	return cut.followsChildCalleeArgument(q, get, operation) || cut.followsStagedMapArgument(q, get, operation) || cut.followsStagedMapEntryArgument(q, get, operation) || cut.followsStagedDescriptorArgument(q, get, operation)
}

// sourceEntryLive keeps ordinary extraction and adopted source-task leases
// distinct. Neither a copied query nor registering fact lifetime opens either.
func (entry *sourceStagedNativeArgumentEntry) sourceEntryLive() bool {
	if entry == nil || entry.issuer != entry || !entry.active {
		return false
	}
	if entry.task.index == 0 {
		return entry.work.extracting == entry.caller
	}
	id := entry.task
	if entry.work.nativeEffectsTaskSource(id) != nil {
		return entry.nativeEffectsEntryLive()
	}
	return id.epoch == entry.work.operationEpoch && int(id.index) < len(entry.work.operations) && entry.work.operations[id.index].moduleArgumentRunning && entry.work.moduleArgumentTaskOwned(entry.work.operationRecipes[entry.work.operations[id.index].key])
}

// A live map-entry Get is a later, separate phase from enumeration. It retains
// its actual entry receiver/Get/binder debt; only the outer invocation is later.
func (cut *sourceMemberWriterReadCut) followsStagedMapEntryArgument(q *sourceValueQuery, get *sourceGetInputs, operation *ast.Node) bool {
	if cut == nil || q == nil || q.stagedMap == nil || get == nil || cut.afterArguments != nil || cut.operation != get.operation || cut.use != q.reading || !q.traceModeKnown || q.traceMode != accessorAcquire || !q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
		return false
	}
	b := q.stagedMap
	if !b.converting || !b.reading || b.currentRead == nil || q.stagedMember == nil || !sameOperationRequest(q.stagedMember.request, b.currentRead.request) || !stagedMapEntryMemberParent(b.currentRead.request) || b.currentRead.entry.group != b.receiver.expression {
		return false
	}
	return stagedArgumentOrderAt(q, b.argumentOrder, b.argumentEpoch, operation, b.operation, b.cut)
}

// The standalone field owner lends the precise current Has/Get pointer. Its
// read function rechecks the applied typed source view; a description, copied
// Get, finished phase or getter-body query cannot use this relationship.
func (cut *sourceMemberWriterReadCut) followsStagedDescriptorArgument(q *sourceValueQuery, get *sourceGetInputs, operation *ast.Node) bool {
	if cut == nil || q == nil || get == nil || cut.afterArguments != nil || cut.operation != get.operation || cut.use != q.reading || !q.liveStagedFieldGet(get) {
		return false
	}
	b := q.stagedFieldGet
	if b.argumentGet != get && !q.liveStagedFieldArgumentLookup(get) || b.argumentRead == nil || b.observation == nil || b.argumentOrder == nil || b.argumentRead() != b.argumentOrder || b.receiver != b.request.producer.selector.occurrence || b.request.producer.selector.association == nil || b.request.producer.selector.association.Parent != b.argumentGroup {
		return false
	}
	has := b.observation.phase == stagedFieldObservationHas && get.hasOnly && q.traceModeKnown && q.traceMode == accessorNoGet
	read := b.observation.phase == stagedFieldObservationGet && !get.hasOnly && q.traceModeKnown && q.traceMode == accessorAcquire
	if !has && !read {
		return false
	}
	actuals := restrictedInvocationArguments(b.operation.AsCallExpression())
	return len(actuals) == 2 && actuals[1] == b.argumentGroup && stagedArgumentOrderAt(q, b.argumentOrder, b.argumentEpoch, operation, b.operation, b.cut)
}

func stagedArgumentOrderAt(q *sourceValueQuery, p *sourceStagedNativeArgumentOrder, epoch *sourceStagedOperationEpoch, outer, child *ast.Node, cut sourceRelativeCut) bool {
	if p == nil || p.issuer != p || p.epoch != epoch || p.generation != q.owner.generation || p.module != q.effectOwner || !runtimeModuleEvaluation(p.module) || p.outer != outer || p.child != child || p.get != child.Expression() || p.mapCut != cut || q.relativeInputCut(child) != cut || p.outerCut.operation != outer || p.outerCut.reading != outer || p.sourceCut.operation != child || p.sourceCut.reading != child {
		return false
	}
	file := ast.GetSourceFileOfNode(child)
	return file != nil && q.owner.program.GetSourceFile(file.FileName()) == file
}

// sourceStagedFieldArgumentLookup is issued only with the lookup owner's new
// selected copy. The canonical field Get remains unchanged. No arbitrary copy,
// output/body callback or later lookup inherits this synchronous interval.
type sourceStagedFieldArgumentLookup struct {
	issuer             *sourceStagedFieldArgumentLookup
	query              *sourceValueQuery
	borrow             *sourceStagedFieldGetBorrow
	original, selected *sourceGetInputs
	origin             *ast.Node
	cut                sourceRelativeCut
	active, revoked    bool
}

func (q *sourceValueQuery) copyStagedFieldLookupGet(original *sourceGetInputs, origin *ast.Node) (*sourceGetInputs, *sourceStagedFieldArgumentLookup) {
	selected := *original
	b := q.stagedFieldGet
	if !q.liveStagedFieldGet(original) || b.argumentGet != original || b.argumentLookup != nil || b.argumentRead == nil || b.argumentOrder == nil || b.argumentRead() != b.argumentOrder || b.observation == nil || b.observation.phase != stagedFieldObservationGet || original.hasOnly {
		return &selected, nil
	}
	loan := &sourceStagedFieldArgumentLookup{query: q, borrow: b, original: original, selected: &selected, origin: origin, cut: q.relativeInputCut(b.operation)}
	loan.issuer = loan
	return &selected, loan
}

func stagedFieldLookupReceiver(value sourceValue, node *ast.Node) bool {
	return value.node == node && calleeSyntaxCarrier(value) && value.capture == nil && len(value.path) == 0 && value.rest == nil && value.copied == nil && !value.undefined
}

// valid authenticates the original issued field and the exact selected pointer
// made above. Only this lookup owner's lookupOwner/inspection adjustments are
// permitted; a further acquired/nativeFreeze proofGet copy is not this loan.
func (loan *sourceStagedFieldArgumentLookup) valid(q *sourceValueQuery, selected *sourceGetInputs) bool {
	if loan == nil || loan.issuer != loan || loan.revoked || loan.query != q || q == nil || selected != loan.selected || q.stagedFieldGet != loan.borrow || loan.borrow.argumentGet != loan.original || !q.liveStagedFieldGet(loan.original) || !q.liveStagedFieldGet(selected) || q.relativeInputCut(loan.borrow.operation) != loan.cut || q.callerInputs != nil || q.normalBindingCall != nil || len(q.creators) != 0 || !q.traceModeKnown || q.traceMode != accessorAcquire {
		return false
	}
	b := loan.borrow
	parent, issued := stagedFieldMemberRequest(b.request, stagedFieldObservationGet)
	if !issued || q.stagedMember == nil || q.stagedMember.issuer != q || !sameOperationRequest(q.stagedMember.request, parent) || b.observation == nil || b.observation.phase != stagedFieldObservationGet || b.argumentRead == nil || b.argumentOrder == nil || b.argumentRead() != b.argumentOrder {
		return false
	}
	original := loan.original
	if selected.operation != original.operation || selected.propertyKey != original.propertyKey || selected.hasOnly != original.hasOnly || selected.presence != original.presence || selected.stagedEffects != original.stagedEffects || selected.symbol != original.symbol || selected.ownSlot != original.ownSlot || !stagedFieldLookupReceiver(original.receiver, b.receiver) || !stagedFieldLookupReceiver(selected.receiver, b.receiver) {
		return false
	}
	if original.receiver.node == loan.origin {
		return selected.lookupOwner == original.lookupOwner && selected.inspection == original.inspection
	}
	if selected.lookupOwner == nil || !stagedFieldLookupReceiver(*selected.lookupOwner, loan.origin) {
		return false
	}
	if original.inspection == nil {
		return selected.inspection == nil
	}
	if selected.inspection == nil {
		return false
	}
	expected := *original.inspection
	expected.lookup = selected.lookupOwner
	return *selected.inspection == expected
}

func (loan *sourceStagedFieldArgumentLookup) begin(q *sourceValueQuery, selected *sourceGetInputs, mode accessorTraversal) func() {
	if loan == nil || loan.active || mode != accessorAcquire || !loan.valid(q, selected) || loan.borrow.argumentLookup != nil {
		return func() {}
	}
	loan.active = true
	loan.borrow.argumentLookup = loan
	return func() {
		loan.active, loan.revoked = false, true
		if loan.borrow.argumentLookup == loan {
			loan.borrow.argumentLookup = nil
		}
	}
}

func (q *sourceValueQuery) liveStagedFieldArgumentLookup(get *sourceGetInputs) bool {
	if q == nil || q.stagedFieldGet == nil {
		return false
	}
	loan := q.stagedFieldGet.argumentLookup
	return loan != nil && loan.active && loan.valid(q, get)
}

// Suspension is scoped even for nil output observations. Restoration cannot
// revive a revoked/finished field interval or a changed current source reader.
func (q *sourceValueQuery) suspendStagedFieldArgumentLookup() func() {
	if q == nil || q.stagedFieldGet == nil || q.stagedFieldGet.argumentLookup == nil {
		return func() {}
	}
	loan := q.stagedFieldGet.argumentLookup
	active := loan.active
	loan.active = false
	return func() {
		if active && !loan.revoked && q.stagedFieldGet == loan.borrow && loan.borrow.argumentLookup == loan && loan.valid(q, loan.selected) {
			loan.active = true
		}
	}
}
