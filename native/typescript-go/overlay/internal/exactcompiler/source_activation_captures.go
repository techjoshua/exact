package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// moduleActivationCaptureCreator is finite syntax eligibility, not entry proof.
// The inner arrow is a deferred function expression with exactly one free formal.
func moduleActivationCaptureCreator(n *ast.Node) bool {
	if n == nil || !ast.IsFunctionDeclaration(n) || len(n.Parameters()) != 1 || n.Body() == nil || !ast.IsBlock(n.Body()) {
		return false
	}
	p := n.Parameters()[0]
	if !ast.IsIdentifier(p.Name()) || p.Initializer() != nil || p.QuestionToken() != nil || p.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(p) {
		return false
	}
	statements := n.Body().AsBlock().Statements.Nodes
	if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
		return false
	}
	inner := statements[0].Expression()
	if inner == nil || !ast.IsArrowFunction(inner) || ast.HasSyntacticModifier(inner, ast.ModifierFlagsAsync) || len(inner.Parameters()) != 0 || ast.HasDecorators(inner) || inner.Body() == nil || !ast.IsPropertyAccessExpression(inner.Body()) || ast.IsOptionalChain(inner.Body()) {
		return false
	}
	return ast.IsIdentifier(inner.Body().Expression()) && ast.IsIdentifier(inner.Body().Name())
}

// activationCaptureInner requires the finite creator syntax checked by its caller.
func activationCaptureInner(n *ast.Node) *ast.Node {
	return n.Body().AsBlock().Statements.Nodes[0].Expression()
}

// activationCaptureLayout carries checker-qualified free-set provenance only.
// Creation-only proofs have no body recipe. The mixed source layout may add a
// separately indexed deferred recipe, which still grants no current Call.
func activationCaptureLayout(p *closedCallableProof, outer *ast.Node) bool {
	if p == nil || !moduleFunctionDeclaration(outer) || !moduleActivationCaptureCreator(outer) || p.arrow != activationCaptureInner(outer) || p.empty || p.parameters != 0 || !activationInnerRecipe(p) || len(p.captureDeclarations) != 1 || p.captureDeclarations[0] != outer.Parameters()[0] || len(p.captureReferences) != 1 {
		return false
	}
	slot, ok := p.captureReferences[p.arrow.Body().Expression()]
	return ok && slot == 0
}

// activationCreatorProof discovers the inner free set separately. Its member
// expression is not put in the outer runtime map or evaluated by the creator.
func (p *closedPrefixBuilder) activationCreatorProof(n *ast.Node) (*closedCallableProof, bool) {
	parameter := n.Parameters()[0]
	inner := activationCaptureInner(n)
	declared := p.query.owner.checker.GetSymbolAtLocation(parameter.Name())
	captured := p.query.owner.checker.GetSymbolAtLocation(inner.Body().Expression())
	if !p.discover() || declared == nil || captured != declared || declared.ValueDeclaration != parameter || len(declared.Declarations) != 1 {
		return nil, false
	}
	mapping := &closedParameterMap{arrow: n, physical: append([]*ast.Node(nil), n.Parameters()...), declarations: append([]*ast.Node(nil), n.Parameters()...), references: map[*ast.Node]int{}}
	if !mapping.validProjection() {
		return nil, false
	}
	nested := &closedCallableProof{arrow: inner, parameters: 0, empty: false, captureDeclarations: []*ast.Node{parameter}, captureReferences: map[*ast.Node]int{inner.Body().Expression(): 0}}
	child := storageBuilder{discovery: p.discovery, recipe: storageRecipe{body: n, callBody: true, locals: 1, declarations: mapping.declarations}}
	runtime := map[*ast.Node]bool{}
	for _, node := range []*ast.Node{parameter, parameter.Name(), n.Body(), n.Body().AsBlock().Statements.Nodes[0], inner} {
		if !child.discover() {
			return nil, false
		}
		runtime[node] = true
	}
	input := child.event(storageEvent{kind: "ReadAcquiredArgument", node: parameter, cell: 0})
	child.event(storageEvent{kind: "InitializeCell", node: parameter, a: input, cell: 0})
	function := child.event(storageEvent{kind: "CreateClosedCallable", node: inner, callable: nested})
	child.event(storageEvent{kind: "Return", node: n.Body().AsBlock().Statements.Nodes[0], a: function})
	p.discovery, p.exhausted = child.discovery, child.exhausted
	recipe := &child.recipe
	return &closedCallableProof{arrow: n, parameters: 1, empty: true, entry: recipe, plan: &closedBodyPlan{recipe: recipe, parameters: mapping, runtime: runtime}}, !p.exhausted
}

// qualifyActivationCreation authenticates the actual nested source region and
// checker declaration. Deferred children stay deferred and receive no once flag.
func (p *shortCircuitPopulationProof) qualifyActivationCreation(event storageEvent) bool {
	outer := p.body.arrow
	if !p.spend() || !activationCaptureLayout(event.callable, outer) || event.node != activationCaptureInner(outer) {
		return false
	}
	inner := event.node
	base := inner.Body().Expression()
	symbol := p.candidate.checker.GetSymbolAtLocation(base)
	if symbol == nil || symbol.ValueDeclaration != outer.Parameters()[0] || len(symbol.Declarations) != 1 {
		return false
	}
	for node := inner.Body(); node != inner; node = node.Parent {
		if !p.spend() || node == nil {
			return false
		}
		e := p.index.normalOccurrences[node]
		parent := p.index.normalOccurrences[node.Parent]
		if e == nil || parent == nil || e.node != node || e.parent != parent || e.region != inner {
			return false
		}
	}
	e := p.index.normalOccurrences[base]
	if e == nil || e.region != inner {
		return false
	}
	if event.callable.entry != nil {
		nested := *p
		return nested.qualifyBody(event.callable)
	}
	return true
}

// finalizeActivationCreation stamps a copied construction proof. It supplies no
// normal operation or receipt to the deferred inner function. An optional
// independently qualified inner plan receives the same immutable source stamp.
func finalizeActivationCreation(f *closedCallableProof) {
	if !moduleActivationCaptureCreator(f.arrow) {
		return
	}
	r := *f.entry
	r.events = append([]storageEvent(nil), r.events...)
	inner := *r.events[2].callable
	inner.namespace, inner.generation, inner.source = f.namespace, f.generation, f.source
	if inner.plan != nil {
		inner.mapping = inner.plan.parameters
	}
	r.events[2].callable = &inner
	plan := *f.plan
	plan.recipe = &r
	f.entry, f.plan = &r, &plan
}

// instantiateActivationCreator uses the actual module environment and mutable
// function binding while the formal and argument object do not yet exist.
func (o *languageOwner) instantiateActivationCreator(b languageBranch, p *closedCallableProof, lexicals []languageLexical, binding languageCell, c *closedPrefixCandidate) languageAlternative {
	if !o.live(b) || !o.canAdvance(b, 4) || p == nil || !p.empty || p.parameters != 1 || !moduleFunctionDeclaration(p.arrow) || !moduleActivationCaptureCreator(p.arrow) || !p.finalizedBodyProof(o) || c == nil || !c.enteredCallable(o, p) || !c.authoredEntry() || !c.sourceConstructs(p) || c.continuation != nil || b.env.outer != nil || binding.id.owner != o || binding.environment != b.env.id || binding.immutable || binding.summary || len(lexicals) != len(c.history.recipe.declarations) {
		return storageResidual(b, "activation creator module instantiation")
	}
	count := 0
	for i, v := range lexicals {
		if v.declaration != c.history.recipe.declarations[i] || v.cell.id.owner != o || v.cell.environment != b.env.id {
			return storageResidual(b, "activation creator module cells")
		}
		if v.declaration == p.arrow && v.cell == binding {
			count++
		}
	}
	if count != 1 {
		return storageResidual(b, "activation creator binding")
	}
	for r := b.state.storage; r != nil; r = r.previous {
		if r.cell == binding {
			return storageResidual(b, "activation creator duplicate instantiation")
		}
	}
	f := &languageCallable{id: o.identity(), proof: p, captures: b.env}
	created := o.storageStep(b, languageStorage{value: languageValue{callable: f}})
	return o.initializeLocal(created, binding, languageValue{callable: f, node: p.arrow})
}

// activationCreatorInputs requires a genuine acquired module object, not its
// source/type metadata. The named argument must select its original const Cell.
func (p *closedPrefixCandidate) activationCreatorInputs(a languageAlternative, work *languageCopyWork) bool {
	in := a.callInputs
	if p == nil || p.owner == nil || p.checker == nil || in == nil || in.call == nil || !ast.IsCallExpression(in.call) || in.callee.callable == nil || in.callee.callable.proof == nil || !moduleActivationCaptureCreator(in.callee.callable.proof.arrow) || len(in.arguments) != 1 || in.arguments[0].value.object == nil || in.call.AsCallExpression().Arguments == nil || len(in.call.AsCallExpression().Arguments.Nodes) != 1 {
		return false
	}
	arg := in.call.AsCallExpression().Arguments.Nodes[0]
	if !ast.IsIdentifier(arg) {
		return false
	}
	symbol := p.checker.GetSymbolAtLocation(arg)
	if symbol == nil || symbol.ValueDeclaration == nil || len(symbol.Declarations) != 1 || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	d := symbol.ValueDeclaration
	if d.Parent == nil || d.Parent.Flags&ast.NodeFlagsConst == 0 || d.Initializer() == nil || !ast.IsObjectLiteralExpression(d.Initializer()) {
		return false
	}
	object := in.arguments[0].value.object
	if object.id.owner != p.owner.language || !object.unique || !object.ownComplete || object.array {
		return false
	}
	for _, field := range d.Initializer().AsObjectLiteralExpression().Properties.Nodes {
		work.spend(1)
		if !ast.IsPropertyAssignment(field) || !ast.IsIdentifier(field.Name()) || !expressionLiteralNode(field.Initializer()) {
			return false
		}
	}
	for _, v := range in.lexicals {
		work.spend(1)
		if v.declaration == d {
			for r := a.branch.state.storage; r != nil; r = r.previous {
				work.spend(1)
			}
			value := p.owner.language.readLocal(a.branch, v.cell)
			return value.completion == languageNormal && value.value.object == object
		}
	}
	return false
}

// createActivationCapturedCallable executes only the creation expression. The
// formal is acquired from this actual entry's cell vector, never a source tuple.
func (o *languageOwner) createActivationCapturedCallable(b languageBranch, p *closedCallableProof, cells []languageCell, e *languageCallEntryInput) languageAlternative {
	if !o.live(b) || !o.canAdvance(b, 3) || e == nil || !e.valid(o, e.activation) || b.env != e.activation.env || !activationCaptureLayout(p, e.proof.arrow) || p.namespace != o || p.generation != o.generation || p.source != e.proof.source || !callFormalCellsMatch(e, cells) || len(cells) != 1 || len(e.inputs.arguments) != 1 || e.inputs.arguments[0].value.object == nil || len(e.proof.entry.events) != 4 || e.proof.entry.events[2].callable != p {
		return storageResidual(b, "activation capture creating entry")
	}
	cell := cells[0]
	if cell.id.owner != o || cell.environment != e.activation.env.id || cell.summary || cell.immutable {
		return storageResidual(b, "activation capture formal cell")
	}
	// Exactly one formal Initialize precedes this creation in the selected
	// four-event body. A completed creation branch cannot issue another one.
	head := b.state.storage
	if b.state.previous != e.activation.state || b.cursor != e.activation.cursor+1 || b.guard != e.activation.guard || b.generation != e.activation.generation || head == nil || head.cell != cell || !head.initialized || head.previous != e.activation.state.storage {
		return storageResidual(b, "activation capture original Initialize predecessor")
	}
	value := o.readLocal(b, cell)
	if value.completion != languageNormal || value.value.object != e.inputs.arguments[0].value.object {
		return storageResidual(b, "activation capture initialized formal")
	}
	f := &languageCallable{id: o.identity(), proof: p, captures: b.env, capturedLexicals: []languageLexical{{declaration: e.proof.arrow.Parameters()[0], cell: cell}}}
	return languageAlternative{branch: o.storageStep(b, languageStorage{cell: cell, value: languageValue{callable: f}}), value: languageValue{callable: f, node: p.arrow}}
}

// activationCreationMarker is a callable-origin row, never a property write.
func activationCreationMarker(row *languageStorage, cell languageCell, f *languageCallable) bool {
	return row != nil && f != nil && row.cell == cell && row.object == nil &&
		row.key == (languagePropertyKey{}) && row.descriptor == (languageDescriptor{}) &&
		row.value == (languageValue{callable: f}) && !row.initialized && !row.deleted
}

// activationCapturedReturn is narrow output validation using the ORIGINAL Call
// history. It neither executes the inner body nor authorizes a later Call/Get.
func activationCapturedReturn(call languageAlternative, work *languageCopyWork) bool {
	if call.callHistory == nil || !call.callHistory.validResult(call) || call.value.callable == nil {
		return false
	}
	e := call.callHistory.entry
	raw := call.callHistory.raw.alternatives[0]
	f := call.value.callable
	o := call.branch.owner
	if !moduleActivationCaptureCreator(e.proof.arrow) || !activationCaptureLayout(f.proof, e.proof.arrow) || f.id.owner != o || f.proof.namespace != o || f.proof.generation != o.generation || f.proof.source != e.proof.source || f.captures != e.activation.env || len(f.capturedLexicals) != 1 || raw.storage == nil || len(raw.storage.cells) != 1 || len(e.proof.entry.events) != 4 || e.proof.entry.events[2].callable != f.proof || len(e.inputs.arguments) != 1 || e.inputs.arguments[0].value.object == nil {
		return false
	}
	cell := raw.storage.cells[0]
	if f.capturedLexicals[0] != (languageLexical{declaration: e.proof.arrow.Parameters()[0], cell: cell}) || cell.environment != f.captures.id || cell.id.owner != o || cell.summary || cell.immutable {
		return false
	}
	if raw.storage.pc != 4 || len(raw.storage.values) != 4 || len(raw.storage.ready) != 4 || !raw.storage.ready[2] || !raw.storage.ready[3] || raw.storage.values[2] != raw.value || raw.storage.values[3] != raw.value {
		return false
	}
	head := raw.branch.state.storage
	if !activationCreationMarker(head, cell, f) {
		return false
	}
	markers, initialized := 0, false
	for r := raw.branch.state.storage; r != nil; r = r.previous {
		work.spend(1)
		if r.cell != cell {
			continue
		}
		if r.initialized {
			if initialized || r.value.object != e.inputs.arguments[0].value.object {
				return false
			}
			initialized = true
		}
		if r.value == (languageValue{callable: f}) && !r.initialized {
			if !activationCreationMarker(r, cell, f) {
				return false
			}
			markers++
		}
	}
	return markers == 1 && initialized
}

// initializerReturnSupported adds only the original creator's authenticated
// callable Return to existing scalars. It supplies no inner entry authority.
func initializerReturnSupported(call languageAlternative, work *languageCopyWork) bool {
	return strictFunctionScalar(call.value) || activationCapturedReturn(call, work)
}

// activationInnerRecipe distinguishes the original creation-only layout from
// the finite, separately indexed deferred body. Neither grants a current Call.
func activationInnerRecipe(p *closedCallableProof) bool {
	if p.entry == nil {
		return p.plan == nil && p.mapping == nil
	}
	if p.plan == nil || p.plan.recipe != p.entry || p.plan.parameters == nil || p.plan.parameters.arrow != p.arrow || !p.plan.parameters.validProjection() || len(p.plan.parameters.declarations) != 0 || p.mapping != nil && p.mapping != p.plan.parameters {
		return false
	}
	r := p.entry
	if r.body != p.arrow || !r.callBody || r.prefix || r.locals != 0 || len(r.events) != 4 || r.registers != 4 {
		return false
	}
	base := p.arrow.Body().Expression()
	a, b, c, d := r.events[0], r.events[1], r.events[2], r.events[3]
	return a.kind == "ReadCapturedCell" && a.cell == 0 && a.node == base && a.out == 0 && b.kind == "Member" && b.node == p.arrow.Body() && b.a == 0 && b.out == 1 && b.key == languageStringKey(p.arrow.Body().Name().Text()) && b.keyProducerPC == -1 && c.kind == "GetValue" && c.node == p.arrow.Body() && c.a == 1 && c.out == 2 && d.kind == "Return" && d.node == p.arrow.Body() && d.a == 2 && d.out == 3
}

// activationParameterProof recognizes only the original creator's checker
// qualified free formal. Source/current entry authority remains independent.
func activationParameterProof(p *closedCallableProof) bool {
	return p != nil && len(p.captureDeclarations) == 1 && p.captureDeclarations[0] != nil && ast.IsParameterDeclaration(p.captureDeclarations[0]) && activationCaptureLayout(p, p.captureDeclarations[0].Parent)
}

// prepareActivationCallBody adds a plan only when the same finite source has
// a second original Call. It does not execute the inner body during creation.
func (p *closedPrefixBuilder) prepareActivationCallBody(r *storageRecipe) bool {
	found := false
	for _, e := range r.events {
		f := e.callable
		if f == nil || !moduleActivationCaptureCreator(f.arrow) {
			continue
		}
		if found || f.entry == nil || len(f.entry.events) != 4 {
			return false
		}
		inner := f.entry.events[2].callable
		if !activationParameterProof(inner) || inner.entry != nil {
			return false
		}
		mapping := &closedParameterMap{arrow: inner.arrow, references: map[*ast.Node]int{}}
		recipe, plan := p.callBodyRecipe(inner.arrow, mapping, inner)
		if recipe == nil || plan == nil {
			return false
		}
		inner.entry, inner.plan = recipe, plan
		if !activationInnerRecipe(inner) {
			return false
		}
		found = true
	}
	return found
}

// activationCaptureState validates actual storage issuance, not a captured
// value snapshot. The live original successor candidate supplies Call authority.
func (o *languageOwner) activationCaptureState(b languageBranch, f *languageCallable) bool {
	if !o.live(b) || f == nil || !activationParameterProof(f.proof) || !f.proof.finalizedBodyProof(o) || f.id.owner != o || f.captures == nil || f.captures.id.owner != o || f.captures.outer == nil || len(f.capturedLexicals) != 1 || b.env != f.captures.outer && b.env.outer != f.captures {
		return false
	}
	v := f.capturedLexicals[0]
	if v.declaration != f.proof.captureDeclarations[0] || v.cell.id.owner != o || v.cell.environment != f.captures.id || v.cell.immutable || v.cell.summary {
		return false
	}
	marker, initialized := false, false
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell != v.cell {
			continue
		}
		if row.initialized {
			if initialized || row.value.object == nil {
				return false
			}
			initialized = true
		}
		if row.value.callable != nil {
			if marker || !activationCreationMarker(row, v.cell, f) {
				return false
			}
			marker = true
		}
	}
	return marker && initialized
}

// readActivationCapturedCell uses the fresh actual entry and CURRENT storage.
// It cannot weaken local-environment equality or module-root capture admission.
func (o *languageOwner) readActivationCapturedCell(b languageBranch, e *languageCallEntryInput, index int) languageAlternative {
	if e == nil || index != 0 || !e.valid(o, e.activation) || !o.activationCaptureState(b, e.callable) || b.env != e.activation.env || b.env.outer != e.callable.captures || b.guard != e.activation.guard || b.generation != e.activation.generation {
		return storageResidual(b, "activation captured cell entry")
	}
	ancestor := false
	for state := b.state; state != nil; state = state.previous {
		if state == e.activation.state {
			ancestor = true
			break
		}
	}
	if !ancestor {
		return storageResidual(b, "activation captured cell branch")
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == e.callable.capturedLexicals[0].cell && row.initialized {
			return languageAlternative{branch: b, value: row.value}
		}
	}
	return storageResidual(b, "activation captured cell unavailable")
}

// activationCapturedDemand names one UNKNOWN lexical input obligation. Naming
// neither resolves a value nor proves a Get, Call, descriptor or effect coverage.
func activationCapturedDemand(inner, member, parameter *ast.Node, key string) bool {
	if parameter == nil || !ast.IsParameterDeclaration(parameter) || !moduleActivationCaptureCreator(parameter.Parent) || parameter != parameter.Parent.Parameters()[0] || inner != activationCaptureInner(parameter.Parent) || member != inner.Body() || key != member.Name().Text() {
		return false
	}
	return ast.GetSourceFileOfNode(inner) == ast.GetSourceFileOfNode(parameter)
}

// activationCapturedFieldCall projects only the original second Call's complete
// native Get. The prior pointer is consumed while it is still history.receipt.
// Detached outcomes carry no captured value, branch, frame or publication right.
func (p *closedPrefixCandidate) activationCapturedFieldCall(row languageAlternative, fact *callableFacts) (sourceFieldCall, bool) {
	if p == nil || !p.activationCallLayout() || p.continuation == nil || !p.priorContinuationValid() || !p.authenticated || !p.bodyClaimed || p.owner == nil || p.owner.closedPrefixCandidate != p || p.frame == nil || p.slot == nil || p.frame.ownedFact != fact || fact == nil || fact.node != p.statement || fact.descriptorMode != p.history.mode || p.slot.closedPrefix != p.history || p.frame.operations[p.call] != p.slot || p.slot.entry != p.entry || p.slot.population != p.frame.population || p.frame.population == nil || p.frame.population.root != p.statement || p.frame.population.entries[p.call] != p.entry || p.entry == nil || !p.entry.once || p.entry.region != nil || p.entry.node != p.call || row.callHistory == nil || !row.callHistory.validResult(row) {
		return sourceFieldCall{}, false
	}
	h := p.history
	if p.slot.state != sourceOperationPending || p.slot.authority != h.authority || p.program.GetSourceFile(p.source.FileName()) != p.source {
		return sourceFieldCall{}, false
	}
	work := languageCopyWork{}
	defer func() { p.owner.indexWork = estimatedCostSum(p.owner.indexWork, work.used) }()
	e := row.callHistory.entry
	if e == nil || e.callable != p.successorCallable() || !activationParameterProof(e.proof) || !p.enteredCallable(p.owner.language, e.proof) || e.inputs.call != p.call || len(e.inputs.arguments) != 0 || e.proof.source != p.source || h.source != p.source || h.authority.program != p.program || h.authority.checker != p.checker || h.authority.generation != p.generation || h.authority.owner != p.owner || p.owner.program != p.program || p.owner.checker != p.checker || p.owner.generation != p.generation || e.acquisition.input != p.continuation.prior.alternatives[0].branch {
		return sourceFieldCall{}, false
	}
	first := h.callReceipts[0].alternatives[0]
	if !activationCapturedReturn(first, &work) || first.value.callable != e.callable {
		return sourceFieldCall{}, false
	}
	raw := row.callHistory.raw.alternatives[0]
	r := e.proof.entry
	if !callBodySnapshot(e, raw) || raw.completion != languageReturn || raw.returnBoundary != e.boundary || raw.storage.pc != 4 || len(raw.storage.ready) != 4 || len(raw.storage.values) != 4 || len(raw.storage.references) != 4 || len(raw.storage.choices) != 0 || raw.storage.copy != nil || r.finally != nil || !raw.storage.ready[0] || !raw.storage.ready[1] || !raw.storage.ready[2] || !raw.storage.ready[3] || raw.value != raw.storage.values[2] || raw.value != raw.storage.values[3] {
		return sourceFieldCall{}, false
	}
	parameter := e.callable.capturedLexicals[0].declaration
	member := e.proof.arrow.Body()
	key := member.Name().Text()
	if !activationCapturedDemand(e.proof.arrow, member, parameter, key) {
		return sourceFieldCall{}, false
	}
	index, indexed := p.owner.indexes[p.source]
	memberEntry, baseEntry, innerEntry := index.normalOccurrences[member], index.normalOccurrences[member.Expression()], index.normalOccurrences[e.proof.arrow]
	work.spend(3)
	if !indexed || index.incomplete || memberEntry == nil || baseEntry == nil || innerEntry == nil || memberEntry.node != member || memberEntry.parent != innerEntry || memberEntry.region != e.proof.arrow || baseEntry.node != member.Expression() || baseEntry.parent != memberEntry || baseEntry.region != e.proof.arrow || index.normalOccurrences[p.call] != p.entry {
		return sourceFieldCall{}, false
	}
	symbol := p.checker.GetSymbolAtLocation(member.Expression())
	if symbol == nil || symbol.ValueDeclaration != parameter || len(symbol.Declarations) != 1 {
		return sourceFieldCall{}, false
	}
	receiver := raw.storage.values[0]
	ref := raw.storage.references[1]
	o := p.owner.language
	if receiver.object == nil || receiver.object != first.callHistory.entry.inputs.arguments[0].value.object || ref.id.owner != o || ref.id.serial == 0 || ref.cell != (languageCell{}) || ref.receiver != receiver || ref.key != languageStringKey(key) {
		return sourceFieldCall{}, false
	}
	descriptor, present, complete, _ := o.readOwnRecord(raw.branch, receiver.object, ref.key)
	if !present || !complete || descriptor.accessor || descriptor.value != raw.value {
		return sourceFieldCall{}, false
	}
	work.spend(int(unsafe.Sizeof(sourceFieldCall{})) + int(unsafe.Sizeof(sourceFieldOutcome{})))
	demand := sourceFieldDemand{declaration: e.proof.arrow, operation: member, slot: parameter, key: key}
	return sourceFieldCall{operation: p.call, target: e.proof.arrow, complete: true, outcomes: []sourceFieldOutcome{{demand: demand, fulfilled: true}}}, true
}
